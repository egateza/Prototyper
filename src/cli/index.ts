#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { Command, InvalidArgumentError } from 'commander';
import { AgentRunner } from '../core/agent.js';
import { removeCheckpoints } from '../core/checkpoint.js';
import { describeAgentFiles, syncAgentFiles } from '../core/agentfiles.js';
import { loadConfig, resolveHome, type Config } from '../core/config.js';
import { applyLangSetting, argvHome, langState, settingsFile, writeSettings } from '../core/settings.js';
import { isLangSetting, LANG_SETTINGS, LOCALE_INFO, resolveLang, type LangSetting } from '../core/i18n.js';
import { samePath } from '../core/fsutil.js';
import { detectManifest } from '../core/detect.js';
import { AppError } from '../core/errors.js';
import { readLogFileTail, type LogLine } from '../core/logs.js';
import { loadManifest, MANIFEST_FILE, parseManifest, writeManifest } from '../core/manifest.js';
import { Registry, type ResolvedPrototype } from '../core/registry.js';
import { STOPPED_INFO } from '../core/runtime.js';
import { createPrototype, isTemplate, TEMPLATE_INFO, TEMPLATES } from '../core/scaffold.js';
import { toView, type PrototypeView } from '../core/views.js';
import { startServer } from '../server/index.js';
import { healthLanMode, type HealthResponse } from '../server/routes/health.js';
import type { SettingsResponse } from '../server/routes/settings.js';
import { VERSION } from '../version.js';
import { APP_MODE } from '../core/appfiles.js';
import { DaemonClient } from './client.js';
import { isExplorerLaunch, runLauncher, windowsParentImage } from './launcher.js';
import { registerCommentCommands } from './comments.js';
import { describeLink, registerDesignSystemCommands } from './designsystem.js';
import { registerUpdateCommand } from './update.js';
import { launchTray, quitDeps, quitPrototyper, runTray } from '../tray/index.js';
import { formatLogLine, printInfo, printJson, printTable, reportError } from './output.js';
import { localizeCommander, t as tc } from './commander-i18n.js';
import { t } from './messages.js';

interface GlobalOpts {
  json?: boolean;
  home?: string;
  port?: number;
  lan?: boolean;
  lanPrototypes?: boolean;
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
    if (!Number.isInteger(n) || n < min || n > max) throw new InvalidArgumentError(t('numberRange', { min, max }));
    return n;
  };
}

function makeCtx(cmd: Command): Ctx {
  const o = cmd.optsWithGlobals<GlobalOpts>();
  const lanMode = o.lan ? 'all' : o.lanPrototypes ? 'prototypes' : undefined;
  const config = loadConfig({ home: o.home, port: o.port, lanMode });
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
const lanLabel = (h: HealthResponse) => {
  const mode = healthLanMode(h);
  return mode === 'all' ? ', LAN' : mode === 'prototypes' ? t('lanPrototypesOnly') : '';
};
const localView = (p: Awaited<ReturnType<Registry['require']>>) => toView(p, STOPPED_INFO, { lanAddrs: [], lanExposed: false });

async function listViews(ctx: Ctx): Promise<PrototypeView[]> {
  if (await ctx.client.health()) return ctx.client.request<PrototypeView[]>('GET', '/api/prototypes');
  return (await ctx.registry.list()).map(localView);
}

async function getView(ctx: Ctx, id: string): Promise<PrototypeView> {
  if (await ctx.client.health()) return ctx.client.request<PrototypeView>('GET', `/api/prototypes/${enc(id)}`);
  return localView(await ctx.registry.require(id));
}

function printUrls(v: PrototypeView): void {
  console.log(t('running', { id: v.id, url: v.url ?? '-' }));
  for (const u of v.lanUrls) console.log(`  LAN: ${u}`);
}

async function runAction(ctx: Ctx, id: string, action: 'start' | 'stop' | 'restart'): Promise<void> {
  await ctx.client.ensure();
  try {
    const v = await ctx.client.request<PrototypeView>('POST', `/api/prototypes/${enc(id)}/${action}`);
    if (ctx.json) return printJson(v);
    if (action === 'stop') console.log(t('stopped', { id: v.id }));
    else printUrls(v);
  } catch (err) {
    if (err instanceof AppError && err.code === 'START_FAILED' && !ctx.json) {
      const logs = await ctx.client
        .request<{ lines: LogLine[] }>('GET', `/api/prototypes/${enc(id)}/logs?tail=20`)
        .catch(() => ({ lines: [] }));
      if (logs.lines.length) {
        console.error(t('lastLogLines'));
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
  if (!m) throw new AppError('INVALID_MANIFEST', t('invalidPrototype', { id: p.id, error: p.error ?? '' }));
  if (m.type !== 'command' || !m.command.install) {
    throw new AppError('BAD_REQUEST', t('noInstallCommand', { id: p.id }));
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
  if (code !== 0 && !ctx.json) console.error(t('installFailed', { code: code ?? '-' }));
  return code;
}

// Bahasa CLI ditetapkan sebelum perintah (beserta teks bantuannya) dibuat: PROTOTYPER_LANG > settings.json > OS.
applyLangSetting(resolveHome(argvHome(process.argv)));

const program = localizeCommander(new Command());
program
  .name('prototyper')
  .description(t('programDesc'))
  .version(VERSION, '-v, --version', tc('versionDesc'))
  .option('--json', t('optJson'))
  .option('--home <dir>', t('optHome'))
  .option('-p, --port <port>', t('optPort'), parseIntOption(1, 65535))
  .option('--lan', t('optLan'))
  .option('--lan-prototypes', t('optLanPrototypes'))
  .showHelpAfterError();

program
  .command('serve')
  .description(t('serveDesc'))
  .option('-d, --detach', t('serveDetach'))
  .action(
    act(async (ctx, _args, cmd) => {
      if (!cmd.opts<{ detach?: boolean }>().detach) {
        await startServer(ctx.config);
        return;
      }
      const alreadyRunning = (await ctx.client.health()) !== null;
      const health = await ctx.client.ensure();
      const url = `http://localhost:${ctx.config.port}`;
      if (ctx.json) return printJson({ ok: true, alreadyRunning, url, log: ctx.client.logFile, daemon: health });
      if (alreadyRunning) {
        console.log(t('daemonAlreadyRunning', { url, version: health.version, lan: lanLabel(health) }));
        if (ctx.config.lanMode !== healthLanMode(health)) {
          console.log(t('lanModeUnchanged'));
        }
      } else {
        console.log(t('daemonInBackground', { url, version: health.version, lan: lanLabel(health) }));
        console.log(t('logFile', { file: ctx.client.logFile }));
      }
      console.log(t('stopWith'));
    }),
  );

program
  .command('init [dir]')
  .description(t('initDesc', { file: MANIFEST_FILE }))
  .option('-t, --type <type>', 'static | command')
  .option('--id <id>', t('optId'))
  .option('--name <name>', t('optName'))
  .option('--run <cmd>', t('optRun'))
  .option('-f, --force', t('optForceManifest', { file: MANIFEST_FILE }))
  .action(
    act(async (ctx, [dir], cmd) => {
      const o = cmd.opts<{ type?: string; id?: string; name?: string; run?: string; force?: boolean }>();
      if (o.type !== undefined && o.type !== 'static' && o.type !== 'command') {
        throw new AppError('BAD_REQUEST', t('typeMustBe'));
      }
      const abs = path.resolve(dir ?? '.');
      if (!existsSync(abs)) throw new AppError('BAD_REQUEST', t('folderNotFound', { path: abs }));
      const file = path.join(abs, MANIFEST_FILE);
      if (existsSync(file) && !o.force) {
        throw new AppError('CONFLICT', t('manifestExists', { file }));
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
      console.log(t('manifestCreated', { file, type: manifest.type, id: manifest.id }));
      for (const n of notes) console.log(`  - ${n}`);
      console.log(t('reviewThenAdd', { dir: abs }));
    }),
  );

program
  .command('add <dir>')
  .description(t('addDesc', { file: MANIFEST_FILE }))
  .option('--start', t('optStartAfterAdd'))
  .option('-t, --type <type>', t('optTypeIfMissing', { file: MANIFEST_FILE }))
  .option('--id <id>', t('optIdIfMissing', { file: MANIFEST_FILE }))
  .option('--run <cmd>', t('optRunIfMissing', { file: MANIFEST_FILE }))
  .action(
    act(async (ctx, [dir], cmd) => {
      const o = cmd.opts<{ start?: boolean; type?: string; id?: string; run?: string }>();
      if (o.type !== undefined && o.type !== 'static' && o.type !== 'command') {
        throw new AppError('BAD_REQUEST', t('typeMustBe'));
      }
      const abs = path.resolve(dir ?? '.');
      if (!existsSync(abs)) throw new AppError('BAD_REQUEST', t('folderNotFound', { path: abs }));

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
        throw new AppError('BAD_REQUEST', t('manifestExistsNoFlags', { file: MANIFEST_FILE }));
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
        console.log(t('manifestAutoCreated', { file: MANIFEST_FILE, type: p.manifest?.type }));
        for (const n of notes) console.log(`  - ${n}`);
      }
      console.log(t('registered', { id: v.id, path: v.path }));
      for (const line of describeAgentFiles(agentFiles)) console.log(t('agentInstructions', { line }));
      const m = v.manifest;
      if (m?.type === 'command') {
        console.log(t('commandToRun', { cmd: m.command.run }));
        if (m.command.install) console.log(t('installHint', { cmd: m.command.install, id: v.id }));
      }
      if (v.url) printUrls(v);
      else console.log(t('startHint', { id: v.id }));
    }),
  );

program
  .command('remove <id>')
  .alias('rm')
  .description(t('removeDesc'))
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
      console.log(t('removed', { id: removed.id, path: removed.path }));
    }),
  );

program
  .command('list')
  .alias('ls')
  .description(t('listDesc'))
  .action(
    act(async (ctx) => {
      const views = await listViews(ctx);
      if (ctx.json) return printJson(views);
      printTable(views);
    }),
  );

program
  .command('status')
  .description(t('statusDesc'))
  .action(
    act(async (ctx) => {
      const health = await ctx.client.health();
      const views = await listViews(ctx);
      if (ctx.json) return printJson({ daemon: health ? { ...health, url: ctx.client.base } : null, prototypes: views });
      console.log(
        health
          ? `${t('daemonStatusRunning', { port: ctx.config.port, version: health.version, uptime: health.uptimeSec, lan: lanLabel(health) })}\n`
          : `${t('daemonStatusStopped')}\n`,
      );
      printTable(views);
    }),
  );

program
  .command('info <id>')
  .description(t('infoDesc'))
  .action(
    act(async (ctx, [id]) => {
      const v = await getView(ctx, id ?? '');
      if (ctx.json) return printJson(v);
      printInfo(v);
    }),
  );

program
  .command('validate [dir]')
  .description(t('validateDesc', { file: MANIFEST_FILE }))
  .action(
    act(async (ctx, [dir]) => {
      const abs = path.resolve(dir ?? '.');
      const manifest = await loadManifest(abs);
      if (ctx.json) return printJson({ valid: true, path: path.join(abs, MANIFEST_FILE), manifest });
      console.log(t('manifestValid', { file: path.join(abs, MANIFEST_FILE), type: manifest.type, id: manifest.id }));
    }),
  );

program
  .command('install <id>')
  .description(t('installDesc'))
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
  .description(t('newDesc'))
  .option('-t, --template <name>', t('optTemplate', { choices: TEMPLATES.join(' | ') }), 'static')
  .option('-d, --dir <folder>', t('optDir'))
  .option('--name <name>', t('optNameDefaultId'))
  .option('--description <text>', t('optDescription'))
  .option('--from <file.html>', t('optFrom'))
  .option('--design-system <id>', t('optDesignSystem'))
  .option('--no-install', t('optNoInstall'))
  .option('--start', t('optStartAfterNew'))
  .addHelpText(
    'after',
    [
      '',
      t('helpTemplates'),
      ...TEMPLATES.map((name) => `  ${name.padEnd(13)} ${TEMPLATE_INFO[name]}`),
      '',
      t('helpExamples'),
      '  prototyper new kasir-grosir -t vite-react --start',
      '  prototyper new laporan-stok --from Downloads\\artifact.html',
      '  prototyper new brand-ds -t design-system',
      '  prototyper new laporan-stok --design-system brand-ds',
    ].join('\n'),
  )
  .action(
    act(async (ctx, [id], cmd) => {
      const o = cmd.opts<{
        template: string; dir?: string; name?: string; description?: string; from?: string; install: boolean; start?: boolean;
        designSystem?: string;
      }>();
      if (!isTemplate(o.template)) throw new AppError('BAD_REQUEST', t('templateMustBe', { choices: TEMPLATES.join(', ') }));
      let html: string | undefined;
      if (o.from) {
        const file = path.resolve(o.from);
        html = await fs.readFile(file, 'utf8').catch(() => {
          throw new AppError('BAD_REQUEST', t('htmlUnreadable', { file }));
        });
      }
      const r = await createPrototype(ctx.registry, {
        id: id ?? '',
        template: o.template,
        workspace: ctx.config.workspace,
        dsWorkspace: ctx.config.dsWorkspace,
        ...(o.dir ? { dir: o.dir } : {}),
        ...(o.name ? { name: o.name } : {}),
        ...(o.description ? { description: o.description } : {}),
        ...(html !== undefined ? { html: html.replace(/^﻿/, '') } : {}),
        ...(o.designSystem ? { designSystem: o.designSystem } : {}),
      });
      const p = r.prototype;
      if (!ctx.json) {
        console.log(t('createdFromTemplate', { id: p.id, template: r.template, path: p.path }));
        for (const f of r.files) console.log(`  + ${f}`);
        if (r.designSystem) console.log(t('designSystemUsed', { ds: r.designSystem.designSystem, link: describeLink(r.designSystem.link) }));
        if (r.template === 'design-system') console.log(t('useDesignSystemHint', { id: p.id }));
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
      if (ctx.json) return printJson({ ...v, template: r.template, files: r.files, install, agentFiles: r.agentFiles, designSystem: r.designSystem });
      if (install && !install.ok) {
        process.exitCode = 1;
        console.log(t('fixAndRetryInstall', { id: p.id }));
        return;
      }
      if (v.url) printUrls(v);
      else console.log(t('startHint', { id: p.id }));
    }),
  );

for (const action of ['start', 'stop', 'restart'] as const) {
  const desc = { start: t('startDesc'), stop: t('stopDesc'), restart: t('restartDesc') };
  program
    .command(`${action} <id>`)
    .description(desc[action])
    .action(act((ctx, [id]) => runAction(ctx, id ?? '', action)));
}

program
  .command('lan <id> [state]')
  .description(t('lanDesc'))
  .action(
    act(async (ctx, [id, state]) => {
      const pid = id ?? '';
      if (state !== undefined && state !== 'on' && state !== 'off') {
        throw new AppError('BAD_REQUEST', t('lanStateMustBe'));
      }
      await ctx.client.ensure();
      const v =
        state === undefined
          ? await ctx.client.request<PrototypeView>('GET', `/api/prototypes/${enc(pid)}`)
          : await ctx.client.request<PrototypeView>('PUT', `/api/prototypes/${enc(pid)}/lan`, { exposed: state === 'on' });
      if (ctx.json) return printJson(v);
      console.log(t(v.lanExposed ? 'lanOpened' : 'lanClosed', { id: v.id }));
      if (v.lanUrls.length) for (const u of v.lanUrls) console.log(`  LAN: ${u}`);
      else if (v.lanExposed) console.log(t('lanAppliesOnStart', { id: v.id }));
    }),
  );

/** Ukuran jendela untuk `export --device` (sama dengan pilihan perangkat di Web UI). */
const EXPORT_DEVICES: Record<string, { w: number; h: number; mobile: boolean }> = {
  desktop: { w: 1280, h: 800, mobile: false },
  tablet: { w: 820, h: 1180, mobile: true },
  mobile: { w: 390, h: 844, mobile: true },
};

program
  .command('export <id>')
  .description(t('exportDesc'))
  .option('-f, --format <format>', 'png | jpg | pdf', 'png')
  .option('-p, --page <path>', t('optPage'), '/')
  .option('-o, --out <file>', t('optOut'))
  .option('-d, --device <device>', 'desktop | tablet | mobile', 'desktop')
  .option('--width <px>', t('optWidth'), parseIntOption(240, 3840))
  .option('--height <px>', t('optHeight'), parseIntOption(240, 4000))
  .option('--landscape', t('optLandscape'))
  .option('--viewport', t('optViewport'))
  .option('--scale <n>', t('optScale'), parseIntOption(1, 3))
  .option('--paper <paper>', t('optPaper'), 'screen')
  .option('--wait <ms>', t('optWait'), parseIntOption(0, 10_000), 500)
  .action(
    act(async (ctx, [id], cmd) => {
      const o = cmd.opts<{ format: string; page: string; out?: string; device: string; width?: number; height?: number; landscape?: boolean; viewport?: boolean; scale?: number; paper: string; wait: number }>();
      const pid = id ?? '';
      const dev = EXPORT_DEVICES[o.device];
      if (!dev) throw new AppError('BAD_REQUEST', t('deviceMustBe'));
      const [dw, dh] = o.landscape && dev.mobile ? [dev.h, dev.w] : [dev.w, dev.h];
      await ctx.client.ensure();
      const v = await ctx.client.request<PrototypeView>('GET', `/api/prototypes/${enc(pid)}`);
      if (v.status !== 'running') await ctx.client.request<PrototypeView>('POST', `/api/prototypes/${enc(pid)}/start`);
      const q = new URLSearchParams({
        format: o.format,
        path: o.page,
        width: String(o.width ?? dw),
        height: String(o.height ?? dh),
        full: o.viewport ? '0' : '1',
        mobile: dev.mobile ? '1' : '0',
        paper: o.paper,
        wait: String(o.wait),
        ...(o.scale ? { scale: String(o.scale) } : {}),
      });
      const { data, headers } = await ctx.client.download(`/api/prototypes/${enc(pid)}/export?${q}`);
      const name = /filename="([^"]+)"/.exec(headers.get('content-disposition') ?? '')?.[1] ?? `${pid}.${o.format}`;
      const out = path.resolve(o.out ?? name);
      await fs.mkdir(path.dirname(out), { recursive: true });
      await fs.writeFile(out, data);
      const truncated = headers.get('x-prototyper-truncated') === '1';
      if (ctx.json) return printJson({ id: pid, path: out, bytes: data.length, format: headers.get('content-type'), truncated });
      console.log(`✓ ${out} (${Math.round(data.length / 1024)} KB)`);
      if (truncated) console.log(t('pageTruncated'));
    }),
  );

program
  .command('logs <id>')
  .description(t('logsDesc'))
  .option('-n, --tail <n>', t('optTail'), parseIntOption(0, 1000), 200)
  .option('-f, --follow', t('optFollow'))
  .action(
    act(async (ctx, [id], cmd) => {
      const o = cmd.opts<{ tail: number; follow?: boolean }>();
      const pid = id ?? '';
      const up = await ctx.client.health();
      if (o.follow) {
        if (!up) throw new AppError('DAEMON_UNAVAILABLE', t('followNeedsDaemon'));
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
      if (!lines.length) console.log(t('logEmpty'));
      for (const l of lines) console.log(formatLogLine(l));
    }),
  );

program
  .command('shutdown')
  .description(t('shutdownDesc'))
  .action(
    act(async (ctx) => {
      if (!(await ctx.client.health())) {
        if (ctx.json) return printJson({ ok: true, wasRunning: false });
        console.log(t('daemonNotRunning'));
        return;
      }
      await ctx.client.request('POST', '/api/shutdown');
      const deadline = Date.now() + 15_000;
      while (Date.now() < deadline && (await ctx.client.health())) await new Promise((r) => setTimeout(r, 300));
      if (ctx.json) return printJson({ ok: true, wasRunning: true });
      console.log(t('daemonStopped'));
    }),
  );

program
  .command('quit')
  .description(t('quitDesc'))
  .option('--remove-startup', t('optRemoveStartup'))
  .action(
    act(async (ctx, _args, cmd) => {
      const o = cmd.opts<{ removeStartup?: boolean }>();
      const r = await quitPrototyper(quitDeps(ctx.config), { removeStartup: o.removeStartup === true });
      if (ctx.json) return printJson({ ok: true, ...r });
      console.log(r.daemon ? t('daemonAndPrototypesStopped') : t('daemonNotRunning'));
      console.log(r.tray ? t('trayClosed', { pid: r.tray }) : t('trayNotRunning'));
      if (r.startupRemoved) console.log(t('startupRemoved'));
    }),
  );

program
  .command('tray')
  .description(t('trayDesc'))
  .option('--foreground', t('optForeground'))
  .option('--restore <ids>', t('optRestore'))
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
      if (r.alreadyRunning) console.log(t('trayAlreadyRunning', { pid: r.pid }));
      else console.log(t('trayRunning', { log: r.log }));
    }),
  );

const agentsCmd = program.command('agents').description(t('agentsDesc'));

agentsCmd
  .command('list')
  .alias('ls')
  .description(t('agentsListDesc'))
  .action(
    act(async (ctx) => {
      const runner = new AgentRunner(ctx.config);
      const agents = await runner.checkAll(true);
      if (ctx.json) return printJson({ default: runner.defaultAgent, agents });
      for (const a of agents) {
        const mark = a.available ? '✓' : '·';
        const tag = a.support === 'tested' ? '' : t('experimental');
        console.log(`${mark} ${a.name.padEnd(20)} ${a.available ? `${a.version ?? ''}${tag}` : t('notAvailable')}`);
        if (a.path) console.log(`    ${a.path}`);
        if (!a.available) console.log(`    ${a.error ?? ''} ${a.install}`.trimEnd());
      }
      console.log(t('defaultAgent', { agent: runner.defaultAgent }));
    }),
  );

agentsCmd
  .command('sync [id]')
  .description(t('agentsSyncDesc'))
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
      if (!results.length) console.log(t('noPrototypesYet'));
      for (const r of results) {
        console.log(`${r.id}  (${r.path})`);
        if (r.error) console.log(t('skippedInvalid', { error: r.error }));
        for (const line of describeAgentFiles(r.files)) console.log(`  ${line}`);
      }
      if (results.some((r) => r.files.some((f) => f.action === 'error'))) process.exitCode = 1;
    }),
  );

program
  .command('lang')
  .description(t('langDesc'))
  .argument('[lang]', t('langArg', { choices: LANG_SETTINGS.join(' | ') }))
  .action(
    act(async (ctx, [value]) => {
      const home = ctx.config.home;
      const health = await ctx.client.health();
      // Daemon yang memakai folder data yang sama ikut diubah lewat API (bahasa daemon & petunjuk agent ikut berganti).
      const daemonUp = !!health && (!health.home || samePath(health.home, home));
      const choices = LANG_SETTINGS.join(', ');
      let daemon: SettingsResponse['lang'] | null = null;
      let saved: LangSetting | undefined;
      if (value !== undefined) {
        const lang = value.trim().toLowerCase();
        if (!isLangSetting(lang)) throw new AppError('BAD_REQUEST', t('langUnknown', { lang: value, choices }));
        if (daemonUp) daemon = (await ctx.client.request<SettingsResponse>('PUT', '/api/settings', { lang })).lang;
        else await writeSettings(home, { lang });
        saved = lang;
      } else if (daemonUp) {
        daemon = (await ctx.client.request<SettingsResponse>('GET', '/api/settings')).lang;
      }
      // Bahasa CLI ini mengikuti pengaturan baru, jadi pesan di bawah sudah dalam bahasa yang dipilih.
      const state = applyLangSetting(home);
      const envValue = process.env.PROTOTYPER_LANG?.trim();
      if (ctx.json) {
        return printJson({
          ...langState(home),
          ...(saved ? { changed: true, saved, via: daemon ? 'daemon' : 'file' } : {}),
          choices: LANG_SETTINGS,
          file: settingsFile(home),
          daemon: daemon ? { setting: daemon.setting, locale: daemon.locale, fromEnv: daemon.fromEnv } : null,
        });
      }
      const name = LOCALE_INFO[state.locale].name;
      if (saved) {
        const locale = state.fromEnv ? resolveLang(saved) : state.locale;
        console.log(t('langChanged', { setting: saved, name: LOCALE_INFO[locale].name, locale }));
        if (daemon) console.log(t('langViaDaemon'));
      } else {
        console.log(t('langCurrent', { name, locale: state.locale }));
        console.log(state.setting === 'auto' ? t('langSettingAuto') : t('langSetting', { setting: state.setting }));
        if (daemon && daemon.locale !== state.locale) {
          console.log(t('langDaemon', { name: LOCALE_INFO[daemon.locale].name, locale: daemon.locale }));
        }
        console.log(t('langChoices', { choices }));
      }
      if (state.fromEnv) console.log(t('langLockedByEnv', { value: envValue }));
      if (daemon?.fromEnv && !state.fromEnv) console.log(t('langDaemonLockedByEnv'));
    }),
  );

registerCommentCommands(program, act);
registerDesignSystemCommands(program, act);
registerUpdateCommand(program, act);

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
