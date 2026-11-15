import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Config } from './config.js';
import { AppError, errorMessage } from './errors.js';
import { EMBED_PATH, injectEmbedTag, payloadToString, readEmbedScript } from './embed.js';
import { isDirectory } from './fsutil.js';
import { LIVERELOAD_PATH, LiveReload } from './livereload.js';
import { LogStore, type LogLine } from './logs.js';
import type { CommandConfig, StaticConfig } from './manifest.js';
import { allocatePort, isPortFree, probeHosts, probePort } from './ports.js';
import type { ResolvedPrototype } from './registry.js';
import type { StateStore } from './state.js';

const IS_WIN = process.platform === 'win32';

export type RunStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'crashed' | 'failed';
const ACTIVE: ReadonlySet<RunStatus> = new Set<RunStatus>(['starting', 'running', 'stopping']);

export interface RunInfo {
  status: RunStatus;
  port: number | null;
  pid: number | null;
  startedAt: string | null;
  exitCode: number | null;
  error: string | null;
}

export const STOPPED_INFO: RunInfo = {
  status: 'stopped',
  port: null,
  pid: null,
  startedAt: null,
  exitCode: null,
  error: null,
};

interface Run {
  id: string;
  status: RunStatus;
  port: number;
  startedAt: string;
  exitCode: number | null;
  error: string | null;
  child?: ChildProcess | undefined;
  exited?: Promise<void> | undefined;
  server?: FastifyInstance | undefined;
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Hentikan proses beserta seluruh proses anaknya (npm run dev memunculkan anak). */
export async function killTree(child: ChildProcess, exited?: Promise<void>): Promise<void> {
  const pid = child.pid;
  if (pid === undefined) return;
  const waitExit = (ms: number) =>
    exited ? Promise.race([exited.then(() => true), delay(ms).then(() => false)]) : delay(ms).then(() => false);

  if (IS_WIN) {
    await new Promise<void>((resolve) => {
      const k = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      k.once('exit', () => resolve());
      k.once('error', () => resolve());
    });
    await waitExit(5000);
    return;
  }
  const signalGroup = (sig: NodeJS.Signals) => {
    try {
      process.kill(-pid, sig);
    } catch {
      /* grup sudah tidak ada */
    }
  };
  signalGroup('SIGTERM');
  await waitExit(5000);
  signalGroup('SIGKILL'); // bersihkan anak yang masih tersisa
}

/** Mengelola prototype yang sedang berjalan. Hanya dipakai oleh daemon. */
export class Runtime {
  private readonly runs = new Map<string, Run>();
  private readonly logStores = new Map<string, Promise<LogStore>>();
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(
    private readonly config: Config,
    private readonly state: StateStore,
  ) {}

  info(id: string): RunInfo {
    const r = this.runs.get(id);
    if (!r) return { ...STOPPED_INFO };
    const live = ACTIVE.has(r.status);
    return {
      status: r.status,
      port: live ? r.port : null,
      pid: live ? (r.child?.pid ?? null) : null,
      startedAt: r.startedAt,
      exitCode: r.exitCode,
      error: r.error,
    };
  }

  /** true bila prototype sedang starting/running/stopping. */
  isActive(id: string): boolean {
    const r = this.runs.get(id);
    return !!r && ACTIVE.has(r.status);
  }

  logs(id: string): Promise<LogStore> {
    let p = this.logStores.get(id);
    if (!p) {
      p = LogStore.open(path.join(this.config.home, 'logs', `${id}.log`));
      this.logStores.set(id, p);
    }
    return p;
  }

  start(p: ResolvedPrototype): Promise<RunInfo> {
    return this.exclusive(p.id, () => this.doStart(p));
  }

  stop(id: string): Promise<RunInfo> {
    return this.exclusive(id, () => this.doStop(id));
  }

  restart(p: ResolvedPrototype): Promise<RunInfo> {
    return this.exclusive(p.id, async () => {
      await this.doStop(p.id);
      return this.doStart(p);
    });
  }

  /** Hentikan dan lupakan prototype (dipakai saat dihapus dari registry). */
  async forget(id: string): Promise<void> {
    await this.stop(id);
    this.runs.delete(id);
    const store = this.logStores.get(id);
    this.logStores.delete(id);
    if (store) (await store).close();
    await this.state.forget(id);
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.runs.keys()].map((id) => this.stop(id)));
    for (const s of this.logStores.values()) (await s).close();
    this.logStores.clear();
    await this.state.flush();
  }

  /** Jalankan command.install dan tunggu selesai; output masuk ke log. */
  install(p: ResolvedPrototype): Promise<{ exitCode: number | null }> {
    return this.exclusive(p.id, async () => {
      const m = p.manifest;
      if (!m) throw new AppError('INVALID_MANIFEST', `Prototype "${p.id}" tidak valid: ${p.error ?? ''}`);
      if (m.type !== 'command' || !m.command.install) {
        throw new AppError('BAD_REQUEST', `Prototype "${p.id}" tidak punya command.install`);
      }
      const logs = await this.logs(p.id);
      const cwd = path.resolve(p.path, m.command.cwd);
      logs.system(`install: ${m.command.install}  (cwd: ${cwd})`);
      const child = spawn(m.command.install, {
        cwd,
        shell: true,
        windowsHide: true,
        env: { ...process.env, ...m.command.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      child.stdout?.setEncoding('utf8').on('data', (d: string) => logs.write('stdout', d));
      child.stderr?.setEncoding('utf8').on('data', (d: string) => logs.write('stderr', d));
      const exitCode = await new Promise<number | null>((resolve) => {
        child.once('exit', (code) => resolve(code));
        child.once('error', (err) => {
          logs.system(`install gagal: ${err.message}`);
          resolve(null);
        });
      });
      logs.flush();
      logs.system(`install selesai (exit ${exitCode ?? '-'})`);
      return { exitCode };
    });
  }

  private exclusive<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(id) ?? Promise.resolve();
    const next = prev.then(fn);
    this.locks.set(
      id,
      next.catch(() => undefined),
    );
    return next;
  }

  private activePorts(except: string): Set<number> {
    const s = new Set<number>();
    for (const r of this.runs.values()) if (r.id !== except && ACTIVE.has(r.status)) s.add(r.port);
    return s;
  }

  private async doStart(p: ResolvedPrototype): Promise<RunInfo> {
    const m = p.manifest;
    if (!m) throw new AppError('INVALID_MANIFEST', `Prototype "${p.id}" tidak valid: ${p.error ?? 'manifest tidak terbaca'}`);
    const existing = this.runs.get(p.id);
    if (existing && ACTIVE.has(existing.status)) return this.info(p.id);

    const port = await allocatePort({
      range: this.config.portRange,
      preferred: this.state.getPort(p.id),
      exclude: this.activePorts(p.id),
      hosts: probeHosts(this.config.host),
    });
    await this.state.setPort(p.id, port);
    const logs = await this.logs(p.id);
    const run: Run = { id: p.id, status: 'starting', port, startedAt: new Date().toISOString(), exitCode: null, error: null };
    this.runs.set(p.id, run);
    logs.system(`start (${m.type}) di port ${port}`);

    try {
      if (m.type === 'static') await this.startStatic(run, p.path, m.static, logs);
      else await this.startCommand(run, p.path, m.command, logs);
    } catch (err) {
      run.status = 'failed';
      run.error = errorMessage(err);
      logs.system(`gagal: ${run.error}`);
      throw new AppError('START_FAILED', `Gagal menjalankan "${p.id}": ${run.error}. Lihat log: prototyper logs ${p.id}`);
    }
    return this.info(p.id);
  }

  private async startStatic(run: Run, dir: string, cfg: StaticConfig, logs: LogStore): Promise<void> {
    const root = path.resolve(dir, cfg.root);
    if (!(await isDirectory(root))) throw new Error(`folder static.root tidak ditemukan: ${root}`);
    const server = Fastify({ logger: false, forceCloseConnections: true });
    try {
      // Data Prototyper di folder prototype (.prototyper/, mis. komentar) tidak ikut disajikan.
      server.addHook('onRequest', async (req, reply) => {
        let pathname = req.url.split('?')[0] ?? '';
        try {
          pathname = decodeURIComponent(pathname);
        } catch {
          /* biarkan apa adanya */
        }
        if (pathname.split(/[\\/]/).some((seg) => seg.toLowerCase() === '.prototyper')) {
          return reply.code(404).type('text/plain; charset=utf-8').send('404 - tidak ditemukan');
        }
      });
      const liveReload = cfg.inject && cfg.liveReload;
      if (cfg.inject) {
        // Skrip komentar-elemen untuk pratinjau Web UI; disisipkan ke setiap respons HTML.
        server.get(EMBED_PATH, async (_req, reply) =>
          reply.type('application/javascript; charset=utf-8').header('Cache-Control', 'no-store').send(await readEmbedScript()),
        );
        server.addHook('onSend', async (req, reply, payload) => {
          if (req.method !== 'GET' || !String(reply.getHeader('content-type') ?? '').startsWith('text/html')) return payload;
          const html = await payloadToString(payload);
          if (html === null) return payload;
          reply.removeHeader('content-length');
          return injectEmbedTag(html, { liveReload });
        });
      }
      if (liveReload) {
        const lr = new LiveReload(root, {
          onBroadcast: (kind, files) => {
            const list = files.length > 3 ? `${files.slice(0, 3).join(', ')}, +${files.length - 3}` : files.join(', ');
            logs.system(`live-reload${kind === 'css' ? ' (css)' : ''}: ${list || 'berubah'}`);
          },
          onError: (msg) => logs.system(`live-reload berhenti: ${msg}`),
        });
        server.get(LIVERELOAD_PATH, (req, reply) => {
          reply.hijack();
          lr.attach(reply.raw);
        });
        server.addHook('preClose', async () => lr.close()); // akhiri aliran SSE agar close tidak menunggu
        server.addHook('onClose', async () => lr.close());
      }
      await server.register(fastifyStatic, {
        root,
        index: [cfg.index],
        cacheControl: false,
        etag: false,
        lastModified: false,
        setHeaders: (reply) => {
          reply.header('Cache-Control', 'no-store');
        },
      });
      server.setNotFoundHandler((req, reply) => {
        const pathname = req.url.split('?')[0] ?? '';
        if (cfg.spa && req.method === 'GET' && !path.extname(pathname)) return reply.sendFile(cfg.index);
        return reply.code(404).type('text/plain; charset=utf-8').send('404 - tidak ditemukan');
      });
      server.addHook('onResponse', async (req, reply) => {
        logs.write('stdout', `${req.method} ${req.url} ${reply.statusCode}\n`);
      });
      await server.listen({ host: this.config.host, port: run.port });
    } catch (err) {
      await server.close().catch(() => undefined);
      throw err;
    }
    run.server = server;
    run.status = 'running';
    logs.system(`siap: http://localhost:${run.port}`);
  }

  private async startCommand(run: Run, dir: string, cfg: CommandConfig, logs: LogStore): Promise<void> {
    const cwd = path.resolve(dir, cfg.cwd);
    if (!(await isDirectory(cwd))) throw new Error(`folder command.cwd tidak ditemukan: ${cwd}`);
    const host = this.config.host;
    const cmd = cfg.run.replaceAll('{port}', String(run.port)).replaceAll('{host}', host);
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      BROWSER: 'none', // cegah dev server membuka browser sendiri
      HOST: host,
      ...cfg.env,
      [cfg.portEnv]: String(run.port),
    };
    logs.system(`$ ${cmd}  (cwd: ${cwd})`);

    const child = spawn(cmd, {
      cwd,
      env,
      shell: true,
      detached: !IS_WIN, // grup proses sendiri agar bisa dibunuh sekaligus (Linux/macOS)
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    run.child = child;
    child.stdout?.setEncoding('utf8').on('data', (d: string) => logs.write('stdout', d));
    child.stderr?.setEncoding('utf8').on('data', (d: string) => logs.write('stderr', d));

    run.exited = new Promise<void>((resolve) => {
      let done = false;
      const finish = (code: number | null, signal: NodeJS.Signals | null, err?: Error) => {
        if (done) return;
        done = true;
        logs.flush();
        void this.state.setProcess(run.id, undefined);
        run.exitCode = code;
        const desc = err
          ? `gagal spawn: ${err.message}`
          : `proses keluar (exit ${code ?? '-'}${signal ? `, signal ${signal}` : ''})`;
        logs.system(desc);
        if (run.status === 'stopping') run.status = 'stopped';
        else if (run.status === 'starting') {
          run.status = 'failed';
          run.error ??= `${desc} sebelum siap`;
        } else if (run.status === 'running') {
          run.status = 'crashed';
          run.error = desc;
        }
        resolve();
      };
      child.once('exit', (code, signal) => finish(code, signal));
      child.once('error', (err) => finish(null, null, err));
    });

    const ready = this.waitReady(run, cfg, logs); // pasang listener sebelum await apa pun
    if (child.pid !== undefined) await this.state.setProcess(run.id, { pid: child.pid, startedAt: run.startedAt });
    const result = await ready;

    if (result === 'exited') throw new Error(run.error ?? 'proses berhenti sebelum siap');
    if (result === 'timeout') {
      const msg = `tidak siap dalam ${cfg.readyTimeoutSec} detik`;
      run.status = 'stopping';
      await killTree(child, run.exited);
      await this.waitPortReleased(run.port, 3000);
      run.status = 'failed';
      run.error = msg;
      throw new Error(msg);
    }
    run.status = 'running';
    if (cfg.readyPattern && !(await probePort(run.port))) {
      logs.system(
        `peringatan: port ${run.port} belum menerima koneksi. Pastikan perintah memakai {port} atau env ${cfg.portEnv}.`,
      );
    }
    logs.system(`siap: http://localhost:${run.port}`);
  }

  private waitReady(run: Run, cfg: CommandConfig, logs: LogStore): Promise<'ready' | 'exited' | 'timeout'> {
    return new Promise((resolve) => {
      let settled = false;
      const cleanups: Array<() => void> = [];
      const settle = (r: 'ready' | 'exited' | 'timeout') => {
        if (settled) return;
        settled = true;
        for (const c of cleanups) c();
        resolve(r);
      };
      const timer = setTimeout(() => settle('timeout'), cfg.readyTimeoutSec * 1000);
      cleanups.push(() => clearTimeout(timer));
      void run.exited?.then(() => settle('exited'));

      if (cfg.readyPattern) {
        const re = new RegExp(cfg.readyPattern);
        const onLine = (l: LogLine) => {
          if (l.stream !== 'system' && re.test(l.line)) settle('ready');
        };
        logs.on('line', onLine);
        cleanups.push(() => logs.off('line', onLine));
      } else {
        void (async () => {
          while (!settled) {
            if (await probePort(run.port)) return settle('ready');
            await delay(300);
          }
        })();
      }
    });
  }

  private async waitPortReleased(port: number, timeoutMs: number): Promise<boolean> {
    const hosts = probeHosts(this.config.host);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await isPortFree(port, hosts)) return true;
      await delay(100);
    }
    return false;
  }

  private async doStop(id: string): Promise<RunInfo> {
    const run = this.runs.get(id);
    if (!run || !ACTIVE.has(run.status)) return this.info(id);
    const logs = await this.logs(id);
    logs.system('stop');
    run.status = 'stopping';
    if (run.server) {
      await run.server.close();
      run.server = undefined;
    } else if (run.child) {
      await killTree(run.child, run.exited);
      // Proses cucu (mis. node di bawah npm/cmd) bisa melepas port sedikit lebih lambat.
      if (!(await this.waitPortReleased(run.port, 5000))) {
        logs.system(`peringatan: port ${run.port} masih dipakai setelah stop; mungkin ada proses anak yang tersisa`);
      }
    }
    run.status = 'stopped';
    return this.info(id);
  }
}
