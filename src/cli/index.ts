#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { Command, InvalidArgumentError } from 'commander';
import { AgentRunner } from '../core/agent.js';
import { removeCheckpoints } from '../core/checkpoint.js';
import { describeAgentFiles, syncAgentFiles } from '../core/agentfiles.js';
import { loadConfig, type Config } from '../core/config.js';
import { detectManifest } from '../core/detect.js';
import { AppError } from '../core/errors.js';
import { readLogFileTail, type LogLine } from '../core/logs.js';
import { loadManifest, MANIFEST_FILE, parseManifest, writeManifest } from '../core/manifest.js';
import { Registry, type ResolvedPrototype } from '../core/registry.js';
import { STOPPED_INFO } from '../core/runtime.js';
import { createPrototype, isTemplate, TEMPLATE_INFO, TEMPLATES } from '../core/scaffold.js';
import { toView, type PrototypeView } from '../core/views.js';
import { startServer } from '../server/index.js';
import { VERSION } from '../version.js';
import { APP_MODE } from '../core/appfiles.js';
import { DaemonClient } from './client.js';
import { isExplorerLaunch, runLauncher, windowsParentImage } from './launcher.js';
import { registerCommentCommands } from './comments.js';
import { launchTray, quitDeps, quitPrototyper, runTray } from '../tray/index.js';
import { formatLogLine, printInfo, printJson, printTable, reportError } from './output.js';

interface GlobalOpts {
  json?: boolean;
  home?: string;
  port?: number;
  lan?: boolean;
}

interface Ctx {
  json: boolean;
  config: Config;
  registry: Registry;
  client: DaemonClient;
}

function parseIntOption(min: number, max: number) {
  return (value: string): number => {
    const n = Number(value);
    if (!Number.isInteger(n) || n < min || n > max) throw new InvalidArgumentError(`harus angka ${min}-${max}`);
    return n;
  };
}

function makeCtx(cmd: Command): Ctx {
  const o = cmd.optsWithGlobals<GlobalOpts>();
  const config = loadConfig({ home: o.home, port: o.port, lan: o.lan });
  return { json: !!o.json, config, registry: new Registry(config.home), client: new DaemonClient(config) };
}

/** Bungkus action: argumen posisi, lalu Command; error dilaporkan sesuai --json. */
function act(fn: (ctx: Ctx, args: Array<string | undefined>, cmd: Command) => Promise<void>) {
  return async (...raw: unknown[]) => {
    const cmd = raw[raw.length - 1] as Command;
    const args = raw.slice(0, -2) as Array<string | undefined>;
    let json = false;
    try {
      const ctx = makeCtx(cmd);
      json = ctx.json;
      await fn(ctx, args, cmd);
    } catch (err) {
      reportError(err, json || !!cmd.optsWithGlobals<GlobalOpts>().json);
      process.exitCode = 1;
    }
  };
}

const enc = encodeURIComponent;
const localView = (p: Awaited<ReturnType<Registry['require']>>) => toView(p, STOPPED_INFO, { lan: false, lanAddrs: [] });

async function listViews(ctx: Ctx): Promise<PrototypeView[]> {
  if (await ctx.client.health()) return ctx.client.request<PrototypeView[]>('GET', '/api/prototypes');
  return (await ctx.registry.list()).map(localView);
}

async function getView(ctx: Ctx, id: string): Promise<PrototypeView> {
  if (await ctx.client.health()) return ctx.client.request<PrototypeView>('GET', `/api/prototypes/${enc(id)}`);
  return localView(await ctx.registry.require(id));
}

function printUrls(v: PrototypeView): void {
  console.log(`✓ ${v.id} berjalan: ${v.url ?? '-'}`);
  for (const u of v.lanUrls) console.log(`  LAN: ${u}`);
}

async function runAction(ctx: Ctx, id: string, action: 'start' | 'stop' | 'restart'): Promise<void> {
  await ctx.client.ensure();
  try {
    const v = await ctx.client.request<PrototypeView>('POST', `/api/prototypes/${enc(id)}/${action}`);
    if (ctx.json) return printJson(v);
    if (action === 'stop') console.log(`■ ${v.id} dihentikan`);
    else printUrls(v);
  } catch (err) {
    if (err instanceof AppError && err.code === 'START_FAILED' && !ctx.json) {
      const logs = await ctx.client
        .request<{ lines: LogLine[] }>('GET', `/api/prototypes/${enc(id)}/logs?tail=20`)
        .catch(() => ({ lines: [] }));
      if (logs.lines.length) {
        console.error('--- 20 baris log terakhir ---');
        for (const l of logs.lines) console.error(formatLogLine(l));
        console.error('-----------------------------');
      }
    }
    throw err;
  }
}

/** Jalankan command.install di terminal ini (foreground). Mengembalikan exit code. */
async function installLocal(ctx: Ctx, p: ResolvedPrototype): Promise<number | null> {
  const m = p.manifest;
  if (!m) throw new AppError('INVALID_MANIFEST', `Prototype "${p.id}" tidak valid: ${p.error ?? ''}`);
  if (m.type !== 'command' || !m.command.install) {
    throw new AppError('BAD_REQUEST', `Prototype "${p.id}" tidak punya command.install`);
  }
  const install = m.command.install;
  const cwd = path.resolve(p.path, m.command.cwd);
  if (!ctx.json) console.log(`$ ${install}  (cwd: ${cwd})`);
  const code = await new Promise<number | null>((resolve, reject) => {
    // Saat --json, output perintah dialihkan ke stderr agar stdout tetap JSON murni.
    const child = spawn(install, {
      cwd,
      shell: true,
      env: { ...process.env, ...m.command.env },
      stdio: ['inherit', ctx.json ? process.stderr : 'inherit', 'inherit'],
    });
    child.once('exit', resolve);
    child.once('error', reject);
  });
  if (code !== 0 && !ctx.json) console.error(`Install gagal (exit ${code ?? '-'})`);
  return code;
}

const program = new Command();
program
  .name('prototyper')
  .description('Daftarkan dan jalankan prototype lokal agar bisa dikerjakan LLM agent apa pun')
  .version(VERSION, '-v, --version')
  .option('--json', 'output JSON (untuk agent/skrip)')
  .option('--home <dir>', 'folder data (default ~/.prototyper atau PROTOTYPER_HOME)')
  .option('-p, --port <port>', 'port daemon (default 4000 atau PROTOTYPER_PORT)', parseIntOption(1, 65535))
  .option('--lan', 'mode LAN: bind 0.0.0.0 agar bisa dibuka dari perangkat lain')
  .showHelpAfterError();

program
  .command('serve')
  .description('jalankan daemon (HTTP API + Web UI) di foreground')
  .action(
    act(async (ctx) => {
      await startServer(ctx.config);
    }),
  );

program
  .command('init [dir]')
  .description(`buat ${MANIFEST_FILE} di folder prototype (deteksi otomatis)`)
  .option('-t, --type <type>', 'static | command')
  .option('--id <id>', 'id prototype (default: nama folder)')
  .option('--name <name>', 'nama tampilan')
  .option('--run <cmd>', 'perintah start untuk mode command, boleh memakai {port} dan {host}')
  .option('-f, --force', `timpa ${MANIFEST_FILE} yang sudah ada`)
  .action(
    act(async (ctx, [dir], cmd) => {
      const o = cmd.opts<{ type?: string; id?: string; name?: string; run?: string; force?: boolean }>();
      if (o.type !== undefined && o.type !== 'static' && o.type !== 'command') {
        throw new AppError('BAD_REQUEST', '--type harus "static" atau "command"');
      }
      const abs = path.resolve(dir ?? '.');
      if (!existsSync(abs)) throw new AppError('BAD_REQUEST', `Folder tidak ditemukan: ${abs}`);
      const file = path.join(abs, MANIFEST_FILE);
      if (existsSync(file) && !o.force) {
        throw new AppError('CONFLICT', `${file} sudah ada. Pakai --force untuk menimpa, atau edit langsung.`);
      }
      const { manifest, notes } = await detectManifest(abs, {
        ...(o.type ? { type: o.type as 'static' | 'command' } : {}),
        ...(o.id ? { id: o.id } : {}),
        ...(o.name ? { name: o.name } : {}),
        ...(o.run ? { run: o.run } : {}),
      });
      parseManifest(manifest); // validasi sebelum ditulis
      await writeManifest(abs, manifest, { overwrite: true }); // keberadaan file sudah dicek di atas
      if (ctx.json) return printJson({ path: file, manifest, notes });
      console.log(`✓ ${file} dibuat (type: ${manifest.type}, id: ${manifest.id})`);
      for (const n of notes) console.log(`  - ${n}`);
      console.log(`Periksa isinya, lalu daftarkan: prototyper add "${abs}"`);
    }),
  );

program
  .command('add <dir>')
  .description(`daftarkan folder prototype (${MANIFEST_FILE} dibuat otomatis bila belum ada)`)
  .option('--start', 'langsung jalankan setelah didaftarkan')
  .option('-t, --type <type>', `static | command (hanya bila ${MANIFEST_FILE} belum ada)`)
  .option('--id <id>', `id prototype (hanya bila ${MANIFEST_FILE} belum ada)`)
  .option('--run <cmd>', `perintah start mode command (hanya bila ${MANIFEST_FILE} belum ada)`)
  .action(
    act(async (ctx, [dir], cmd) => {
      const o = cmd.opts<{ start?: boolean; type?: string; id?: string; run?: string }>();
      if (o.type !== undefined && o.type !== 'static' && o.type !== 'command') {
        throw new AppError('BAD_REQUEST', '--type harus "static" atau "command"');
      }
      const abs = path.resolve(dir ?? '.');
      if (!existsSync(abs)) throw new AppError('BAD_REQUEST', `Folder tidak ditemukan: ${abs}`);

      // Setara alur Web UI: folder tanpa manifest dideteksi dulu, manifest ditulis, lalu didaftarkan.
      let notes: string[] = [];
      let manifestCreated = false;
      if (!existsSync(path.join(abs, MANIFEST_FILE))) {
        const r = await detectManifest(abs, {
          ...(o.type ? { type: o.type as 'static' | 'command' } : {}),
          ...(o.id ? { id: o.id } : {}),
          ...(o.run ? { run: o.run } : {}),
        });
        const m = parseManifest(r.manifest);
        await ctx.registry.assertCanAdd(abs, m.id); // cek bentrok sebelum menulis file
        await writeManifest(abs, r.manifest);
        notes = r.notes;
        manifestCreated = true;
      } else if (o.type || o.id || o.run) {
        throw new AppError('BAD_REQUEST', `${MANIFEST_FILE} sudah ada; --type/--id/--run hanya dipakai saat membuatnya. Edit file itu langsung.`);
      }

      const p = await ctx.registry.add(abs);
      const agentFiles = p.manifest ? await syncAgentFiles(p.path, p.manifest, { home: ctx.config.home }) : [];
      let v = localView(p);
      if (o.start) {
        await ctx.client.ensure();
        v = await ctx.client.request<PrototypeView>('POST', `/api/prototypes/${enc(p.id)}/start`);
      }
      if (ctx.json) return printJson({ ...v, manifestCreated, notes, agentFiles });
      if (manifestCreated) {
        console.log(`✓ ${MANIFEST_FILE} dibuat otomatis (type: ${p.manifest?.type}) — periksa isinya.`);
        for (const n of notes) console.log(`  - ${n}`);
      }
      console.log(`✓ "${v.id}" terdaftar (${v.path})`);
      for (const line of describeAgentFiles(agentFiles)) console.log(`  Petunjuk agent: ${line}`);
      const m = v.manifest;
      if (m?.type === 'command') {
        console.log(`  Perintah yang akan dijalankan: ${m.command.run}`);
        if (m.command.install) console.log(`  Install: ${m.command.install}  (jalankan: prototyper install ${v.id})`);
      }
      if (v.url) printUrls(v);
      else console.log(`Jalankan: prototyper start ${v.id}`);
    }),
  );

program
  .command('remove <id>')
  .alias('rm')
  .description('hapus dari daftar (file prototype tidak dihapus)')
  .action(
    act(async (ctx, [id]) => {
      const pid = id ?? '';
      const removed = (await ctx.client.health())
        ? (await ctx.client.request<{ removed: { id: string; path: string } }>('DELETE', `/api/prototypes/${enc(pid)}`)).removed
        : await ctx.registry.remove(pid).then(async (r) => {
            await removeCheckpoints(ctx.config.home, r.id).catch(() => undefined);
            return r;
          });
      if (ctx.json) return printJson({ removed: { id: removed.id, path: removed.path } });
      console.log(`✓ "${removed.id}" dihapus dari daftar (folder ${removed.path} tidak disentuh)`);
    }),
  );

program
  .command('list')
  .alias('ls')
  .description('daftar prototype')
  .action(
    act(async (ctx) => {
      const views = await listViews(ctx);
      if (ctx.json) return printJson(views);
      printTable(views);
    }),
  );

program
  .command('status')
  .description('status daemon dan semua prototype')
  .action(
    act(async (ctx) => {
      const health = await ctx.client.health();
      const views = await listViews(ctx);
      if (ctx.json) return printJson({ daemon: health ? { ...health, url: ctx.client.base } : null, prototypes: views });
      console.log(
        health
          ? `Daemon: berjalan di http://localhost:${ctx.config.port} (v${health.version}, uptime ${health.uptimeSec}s${health.lan ? ', LAN' : ''})\n`
          : 'Daemon: tidak berjalan (akan dinyalakan otomatis oleh "prototyper start")\n',
      );
      printTable(views);
    }),
  );

program
  .command('info <id>')
  .description('detail prototype: path, URL, status, file instruksi agent')
  .action(
    act(async (ctx, [id]) => {
      const v = await getView(ctx, id ?? '');
      if (ctx.json) return printJson(v);
      printInfo(v);
    }),
  );

program
  .command('validate [dir]')
  .description(`validasi ${MANIFEST_FILE} di sebuah folder`)
  .action(
    act(async (ctx, [dir]) => {
      const abs = path.resolve(dir ?? '.');
      const manifest = await loadManifest(abs);
      if (ctx.json) return printJson({ valid: true, path: path.join(abs, MANIFEST_FILE), manifest });
      console.log(`✓ ${path.join(abs, MANIFEST_FILE)} valid (type: ${manifest.type}, id: ${manifest.id})`);
    }),
  );

program
  .command('install <id>')
  .description('jalankan command.install di folder prototype (foreground)')
  .action(
    act(async (ctx, [id]) => {
      const p = await ctx.registry.require(id ?? '');
      const code = await installLocal(ctx, p);
      if (ctx.json) printJson({ id: p.id, exitCode: code, ok: code === 0 });
      if (code !== 0) process.exitCode = 1;
    }),
  );

program
  .command('new <id>')
  .description('buat prototype baru dari template, lalu daftarkan')
  .option('-t, --template <name>', `template: ${TEMPLATES.join(' | ')}`, 'static')
  .option('-d, --dir <folder>', 'folder tujuan (default: <PROTOTYPER_WORKSPACE>/<id>)')
  .option('--name <name>', 'nama tampilan (default: id)')
  .option('--description <text>', 'deskripsi singkat')
  .option('--from <file.html>', 'impor file HTML (mis. artifact Claude) sebagai index.html; template static')
  .option('--no-install', 'jangan menjalankan npm install untuk template Vite')
  .option('--start', 'langsung jalankan setelah dibuat')
  .addHelpText(
    'after',
    [
      '',
      'Template:',
      ...TEMPLATES.map((t) => `  ${t.padEnd(13)} ${TEMPLATE_INFO[t]}`),
      '',
      'Contoh:',
      '  prototyper new kasir-grosir -t vite-react --start',
      '  prototyper new laporan-stok --from Downloads\\artifact.html',
    ].join('\n'),
  )
  .action(
    act(async (ctx, [id], cmd) => {
      const o = cmd.opts<{
        template: string; dir?: string; name?: string; description?: string; from?: string; install: boolean; start?: boolean;
      }>();
      if (!isTemplate(o.template)) throw new AppError('BAD_REQUEST', `--template harus salah satu dari: ${TEMPLATES.join(', ')}`);
      let html: string | undefined;
      if (o.from) {
        const file = path.resolve(o.from);
        html = await fs.readFile(file, 'utf8').catch(() => {
          throw new AppError('BAD_REQUEST', `File HTML tidak bisa dibaca: ${file}`);
        });
      }
      const r = await createPrototype(ctx.registry, {
        id: id ?? '',
        template: o.template,
        workspace: ctx.config.workspace,
        ...(o.dir ? { dir: o.dir } : {}),
        ...(o.name ? { name: o.name } : {}),
        ...(o.description ? { description: o.description } : {}),
        ...(html !== undefined ? { html: html.replace(/^﻿/, '') } : {}),
      });
      const p = r.prototype;
      if (!ctx.json) {
        console.log(`✓ "${p.id}" dibuat dari template ${r.template}: ${p.path}`);
        for (const f of r.files) console.log(`  + ${f}`);
      }

      let install: { exitCode: number | null; ok: boolean } | null = null;
      const m = p.manifest;
      if (o.install && m?.type === 'command' && m.command.install) {
        const code = await installLocal(ctx, p);
        install = { exitCode: code, ok: code === 0 };
      }

      let v = localView(p);
      if (o.start && (!install || install.ok)) {
        await ctx.client.ensure();
        v = await ctx.client.request<PrototypeView>('POST', `/api/prototypes/${enc(p.id)}/start`);
      }
      if (ctx.json) return printJson({ ...v, template: r.template, files: r.files, install, agentFiles: r.agentFiles });
      if (install && !install.ok) {
        process.exitCode = 1;
        console.log(`Perbaiki lalu ulangi: prototyper install ${p.id}`);
        return;
      }
      if (v.url) printUrls(v);
      else console.log(`Jalankan: prototyper start ${p.id}`);
    }),
  );

for (const action of ['start', 'stop', 'restart'] as const) {
  const desc = { start: 'jalankan prototype (daemon dinyalakan otomatis)', stop: 'hentikan prototype', restart: 'restart prototype' };
  program
    .command(`${action} <id>`)
    .description(desc[action])
    .action(act((ctx, [id]) => runAction(ctx, id ?? '', action)));
}

program
  .command('logs <id>')
  .description('tampilkan log prototype')
  .option('-n, --tail <n>', 'jumlah baris terakhir', parseIntOption(0, 1000), 200)
  .option('-f, --follow', 'ikuti log secara realtime (butuh daemon)')
  .action(
    act(async (ctx, [id], cmd) => {
      const o = cmd.opts<{ tail: number; follow?: boolean }>();
      const pid = id ?? '';
      const up = await ctx.client.health();
      if (o.follow) {
        if (!up) throw new AppError('DAEMON_UNAVAILABLE', 'Daemon tidak berjalan; --follow butuh daemon (prototyper start <id>)');
        await ctx.client.followLogs(pid, o.tail, (l) => console.log(ctx.json ? JSON.stringify(l) : formatLogLine(l)));
        return;
      }
      let lines: LogLine[];
      if (up) {
        lines = (await ctx.client.request<{ lines: LogLine[] }>('GET', `/api/prototypes/${enc(pid)}/logs?tail=${o.tail}`)).lines;
      } else {
        await ctx.registry.require(pid);
        lines = await readLogFileTail(path.join(ctx.config.home, 'logs', `${pid}.log`), o.tail);
      }
      if (ctx.json) return printJson({ id: pid, lines });
      if (!lines.length) console.log('(log kosong)');
      for (const l of lines) console.log(formatLogLine(l));
    }),
  );

program
  .command('shutdown')
  .description('hentikan daemon dan semua prototype yang berjalan')
  .action(
    act(async (ctx) => {
      if (!(await ctx.client.health())) {
        if (ctx.json) return printJson({ ok: true, wasRunning: false });
        console.log('Daemon tidak berjalan.');
        return;
      }
      await ctx.client.request('POST', '/api/shutdown');
      const deadline = Date.now() + 15_000;
      while (Date.now() < deadline && (await ctx.client.health())) await new Promise((r) => setTimeout(r, 300));
      if (ctx.json) return printJson({ ok: true, wasRunning: true });
      console.log('✓ Daemon dihentikan.');
    }),
  );

program
  .command('quit')
  .description('tutup Prototyper sepenuhnya: tray, daemon, dan semua prototype (dipakai installer saat uninstall)')
  .option('--remove-startup', 'hapus juga "jalankan saat startup" yang menunjuk ke exe ini')
  .action(
    act(async (ctx, _args, cmd) => {
      const o = cmd.opts<{ removeStartup?: boolean }>();
      const r = await quitPrototyper(quitDeps(ctx.config), { removeStartup: o.removeStartup === true });
      if (ctx.json) return printJson({ ok: true, ...r });
      console.log(r.daemon ? '✓ Daemon dan prototype dihentikan.' : 'Daemon tidak berjalan.');
      console.log(r.tray ? `✓ Tray ditutup (PID ${r.tray}).` : 'Tray tidak berjalan.');
      if (r.startupRemoved) console.log('✓ "Jalankan saat startup" dihapus.');
    }),
  );

program
  .command('tray')
  .description('jalankan Prototyper di tray Windows (daemon ikut dinyalakan); bila sudah berjalan, buka Web UI')
  .option('--foreground', 'tetap di terminal ini (untuk debug); default: berjalan di latar')
  .option('--restore <ids>', 'jalankan prototype ini setelah daemon siap (dipisah koma)')
  .action(
    act(async (ctx, _args, cmd) => {
      const o = cmd.opts<{ foreground?: boolean; restore?: string }>();
      const restore = (o.restore ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      if (o.foreground) {
        await runTray(ctx.config, { restore });
        return;
      }
      const r = await launchTray(ctx.config, restore.length ? ['--restore', restore.join(',')] : []);
      if (ctx.json) return printJson(r);
      if (r.alreadyRunning) console.log(`Prototyper sudah berjalan di tray (PID ${r.pid}); Web UI dibuka di browser.`);
      else console.log(`✓ Prototyper berjalan di tray (log: ${r.log})`);
    }),
  );

const agentsCmd = program.command('agents').description('agent coding lokal & petunjuk agent di folder prototype');

agentsCmd
  .command('list')
  .alias('ls')
  .description('cek agent coding yang tersedia di mesin ini (Claude Code, Codex, Gemini CLI, Copilot CLI)')
  .action(
    act(async (ctx) => {
      const runner = new AgentRunner(ctx.config);
      const agents = await runner.checkAll(true);
      if (ctx.json) return printJson({ default: runner.defaultAgent, agents });
      for (const a of agents) {
        const mark = a.available ? '✓' : '·';
        const tag = a.support === 'tested' ? '' : ' (eksperimental)';
        console.log(`${mark} ${a.name.padEnd(20)} ${a.available ? `${a.version ?? ''}${tag}` : 'tidak tersedia'}`);
        if (a.path) console.log(`    ${a.path}`);
        if (!a.available) console.log(`    ${a.error ?? ''} ${a.install}`.trimEnd());
      }
      console.log(`\nDefault: ${runner.defaultAgent} (ubah dengan env PROTOTYPER_AGENT_DEFAULT)`);
    }),
  );

agentsCmd
  .command('sync [id]')
  .description('pasang/perbarui bagian Prototyper di AGENTS.md dan CLAUDE.md (semua prototype bila id tidak diisi)')
  .action(
    act(async (ctx, [id]) => {
      const targets = id ? [await ctx.registry.require(id)] : await ctx.registry.list();
      const results = [];
      for (const p of targets) {
        if (!p.manifest) {
          results.push({ id: p.id, path: p.path, error: p.error, files: [] });
          continue;
        }
        results.push({ id: p.id, path: p.path, error: null, files: await syncAgentFiles(p.path, p.manifest, { home: ctx.config.home }) });
      }
      if (ctx.json) return printJson(results);
      if (!results.length) console.log('Belum ada prototype terdaftar.');
      for (const r of results) {
        console.log(`${r.id}  (${r.path})`);
        if (r.error) console.log(`  dilewati: manifest tidak valid — ${r.error}`);
        for (const line of describeAgentFiles(r.files)) console.log(`  ${line}`);
      }
      if (results.some((r) => r.files.some((f) => f.action === 'error'))) process.exitCode = 1;
    }),
  );

registerCommentCommands(program, act);

const userArgs = process.argv.slice(2);
if (isExplorerLaunch({ platform: process.platform, mode: APP_MODE, args: userArgs, parentImage: windowsParentImage })) {
  // Dobel-klik exe: jalankan di tray (daemon ikut menyala), bukan mencetak bantuan lalu jendela tertutup.
  void runLauncher(loadConfig({}));
} else {
  program.parseAsync(process.argv).catch((err: unknown) => {
    reportError(err, process.argv.includes('--json'));
    process.exit(1);
  });
}
