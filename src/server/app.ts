import path from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { APP_DIR, APP_HOST, APP_MODE } from '../core/appfiles.js';
import { resolveWebSwap, type HostInfo } from '../core/apphost.js';
import { createCapturer, type Capturer } from '../core/capture.js';
import { AgentRunner, type AgentCommand, type AgentId } from '../core/agent.js';
import type { Config } from '../core/config.js';
import type { Runner } from '../core/picker.js';
import { DeviceStore } from '../core/devices.js';
import { AppError, errorBody } from '../core/errors.js';
import { lanAddresses, rankLanAddresses } from '../core/net.js';
import { accessHook } from './access.js';
import { Registry } from '../core/registry.js';
import { Runtime } from '../core/runtime.js';
import { StateStore, type StaleProcess } from '../core/state.js';
import { agentRoutes } from './routes/agent.js';
import { commentRoutes } from './routes/comments.js';
import { devicesRoutes } from './routes/devices.js';
import { healthRoutes } from './routes/health.js';
import { pickRoutes } from './routes/pick.js';
import { prototypeRoutes } from './routes/prototypes.js';
import { updateRoutes } from './routes/update.js';
import { checkForUpdate, installContext, UpdateChecker } from '../core/selfupdate.js';
import type { UpdateCheck } from '../core/update.js';
import { spawnSelfUpdate } from '../cli/update.js';
import { VERSION } from '../version.js';

export interface BuildAppOptions {
  config: Config;
  logger?: FastifyServerOptions['logger'];
  /** Dipanggil oleh POST /api/shutdown. Tanpa ini endpoint tersebut 501. */
  onShutdown?: () => void;
  /** Untuk tes: ganti perintah agent (per id agent). */
  agentCommands?: Partial<Record<AgentId, AgentCommand>>;
  /** Untuk tes: folder Web UI awal + versinya (default `WEB_DIR`, `VERSION`). */
  web?: WebSource;
  /** Untuk tes: host exe (default `APP_HOST`; null di luar biner tunggal). */
  appHost?: Pick<HostInfo, 'root' | 'appDir' | 'runtime'> | null;
  /** Untuk tes: ganti pemeriksaan & pemasangan pembaruan. */
  update?: { check?: (current: string) => Promise<UpdateCheck>; install?: () => string };
  /** Untuk tes: ganti pembuka dialog pilih file/folder OS. */
  picker?: { run?: Runner; platform?: NodeJS.Platform };
  /** Untuk tes: alamat untuk URL pairing (default: IP LAN komputer ini + PROTOTYPER_ALLOWED_HOSTS). */
  lanAddresses?: () => string[];
  /** Untuk tes: ganti perender ekspor PDF/PNG (default Chromium headless). */
  capture?: Capturer;
}

/** Asal Web UI yang sedang dilayani. Berganti tanpa restart lewat `POST /api/app/reload-web`. */
export interface WebSource {
  dir: string;
  version: string;
}

export interface AppContext {
  config: Config;
  registry: Registry;
  runtime: Runtime;
  agent: AgentRunner;
  state: StateStore;
  /** Proses command dari sesi daemon sebelumnya yang mungkin masih hidup. */
  staleProcesses: StaleProcess[];
  web: WebSource;
  /** Perangkat lain (HP) yang dipasangkan untuk mode LAN. */
  devices: DeviceStore;
  /** Perender ekspor halaman (PDF/PNG/JPG). */
  capture: Capturer;
}

export const WEB_DIR = path.join(APP_DIR, 'web');

export async function buildApp({ config, logger = false, onShutdown, agentCommands, web, appHost = APP_HOST, update, picker, lanAddresses: addrs, capture }: BuildAppOptions): Promise<{
  app: FastifyInstance;
  ctx: AppContext;
}> {
  const state = new StateStore(config.home);
  await state.load();
  const staleProcesses = state.takeStaleProcesses();
  const registry = new Registry(config.home);
  const runtime = new Runtime(config, state);
  const agent = new AgentRunner(config, agentCommands);
  const devices = new DeviceStore(config.home);
  await devices.load();
  const ctx: AppContext = { config, registry, runtime, agent, state, staleProcesses, web: web ?? { dir: WEB_DIR, version: VERSION }, devices, capture: capture ?? createCapturer() };

  const app = Fastify({ logger, forceCloseConnections: true });
  const startedAt = Date.now();

  // Hak akses: komputer ini = semua; HP terpasang (mode LAN) = baca + alur komentar/agent; lainnya
  // ditolak. Juga memeriksa Host (DNS rebinding) dan Origin (CSRF). Lihat access.ts.
  app.decorateRequest('access', 'none');
  app.decorateRequest('device', null);
  app.addHook('onRequest', accessHook(devices, config.allowedHosts));

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send(errorBody(err.code, err.message, err.details));
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      return reply.status(status).send(errorBody('BAD_REQUEST', (err as Error).message));
    }
    app.log.error(err);
    return reply.status(500).send(errorBody('INTERNAL', `Terjadi kesalahan internal: ${(err as Error).message}`));
  });

  app.setNotFoundHandler((req, reply) => {
    reply.status(404).send(errorBody('NOT_FOUND', `Route ${req.method} ${req.url} tidak ditemukan`));
  });

  app.addHook('onClose', async () => {
    await devices.flush();
    await agent.stopAll();
    await runtime.stopAll();
  });

  await app.register(healthRoutes, { prefix: '/api', startedAt, lanMode: config.lanMode, home: config.home, workspace: config.workspace, dsWorkspace: config.dsWorkspace, version: () => ctx.web.version });
  await app.register(prototypeRoutes, { prefix: '/api', ctx });
  await app.register(commentRoutes, { prefix: '/api', registry, agent, devices });
  await app.register(agentRoutes, { prefix: '/api', registry, agent });
  await app.register(devicesRoutes, {
    devices,
    lanMode: config.lanMode,
    port: config.port,
    addresses: addrs ?? (() => [...rankLanAddresses(lanAddresses()), ...config.allowedHosts]),
  });
  await app.register(pickRoutes, { prefix: '/api', ...(picker ?? {}) });
  const ictx = installContext();
  const checker = new UpdateChecker({
    enabled: config.updateCheck,
    mode: APP_MODE,
    version: () => ctx.web.version,
    check: update?.check ?? ((current) => checkForUpdate(config.updateRepo, current, ictx)),
  });
  await app.register(updateRoutes, { prefix: '/api', checker, install: update?.install ?? (() => spawnSelfUpdate(config)) });

  app.post('/api/shutdown', async (_req, reply) => {
    if (!onShutdown) throw new AppError('NOT_IMPLEMENTED', 'Shutdown tidak tersedia');
    setTimeout(onShutdown, 50);
    return reply.send({ ok: true });
  });

  // Pembaruan yang hanya mengubah web/ (codeHash sama): pindah folder Web UI tanpa memulai ulang daemon
  // maupun prototype. Dipanggil tray setelah memasang paket aplikasi; lihat resolveWebSwap.
  app.post('/api/app/reload-web', async () => {
    if (!appHost) throw new AppError('NOT_IMPLEMENTED', 'Pembaruan tanpa restart hanya untuk prototyper.exe');
    const r = resolveWebSwap(appHost.root, appHost.appDir, appHost.runtime);
    if (!r.ok) throw new AppError('CONFLICT', `Perlu mulai ulang: ${r.reason}`);
    ctx.web = { dir: r.webDir, version: r.app.version };
    app.log.info(`Web UI dialihkan ke ${r.app.version} (${r.webDir})`);
    return { version: r.app.version, webDir: r.webDir };
  });

  // Web UI dilayani dari ctx.web.dir (bukan root tetap) agar bisa dialihkan saat daemon berjalan.
  await app.register(fastifyStatic, { root: ctx.web.dir, serve: false });
  app.get('/*', (req, reply) => {
    const rel = (req.params as { '*': string })['*'];
    return reply.sendFile(rel === '' || rel.endsWith('/') ? `${rel}index.html` : rel, ctx.web.dir);
  });

  return { app, ctx };
}
