import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DaemonClient } from '../cli/client.js';
import { openBrowser } from '../core/open.js';
import { APP_DIR, APP_MODE, cliCommand } from '../core/appfiles.js';
import type { Config } from '../core/config.js';
import { AppError } from '../core/errors.js';
import { runReg, StartupEntry, type RegRunner } from '../core/startup.js';
import {
  cleanupOldExecutable,
  downloadUpdate,
  evaluateRelease,
  fetchLatestRelease,
  replaceExecutable,
  selfUpdateAssetName,
} from '../core/update.js';
import type { PrototypeView } from '../core/views.js';
import { VERSION } from '../version.js';
import { TrayController, type DaemonApi } from './controller.js';
import { TrayHost } from './host.js';

/**
 * `prototyper tray`: Prototyper sebagai ikon tray Windows. Proses tray terpisah dari daemon dan
 * berbicara lewat HTTP seperti CLI; "Jeda daemon" = shutdown daemon, "Lanjutkan" = nyalakan lagi.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

export const trayFiles = (home: string) => ({
  lock: path.join(home, 'tray.pid'),
  log: path.join(home, 'tray.log'),
  settings: path.join(home, 'tray.json'),
  dir: path.join(home, 'tray'),
  updates: path.join(home, 'updates'),
});

export function trayIconPath(appDir: string = APP_DIR): string {
  return path.join(appDir, 'assets', 'tray');
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** PID tray yang sedang berjalan (dari `tray.pid`), atau null. */
export function runningTrayPid(home: string, alive: (pid: number) => boolean = isAlive): number | null {
  try {
    const pid = Number.parseInt(readFileSync(trayFiles(home).lock, 'utf8').trim(), 10);
    return Number.isInteger(pid) && pid > 0 && pid !== process.pid && alive(pid) ? pid : null;
  } catch {
    return null;
  }
}

/** Baca `AppsUseLightTheme` dari output `reg query`: 0 = gelap. */
export function parseAppsTheme(output: string): 'light' | 'dark' {
  const m = /AppsUseLightTheme\s+REG_DWORD\s+0x([0-9a-f]+)/i.exec(output);
  return m && Number.parseInt(m[1]!, 16) === 0 ? 'dark' : 'light';
}

/** Tema aplikasi Windows (Settings → Personalization → Colors); menu klik kanan mengikutinya. */
export async function readAppsTheme(reg: RegRunner = runReg): Promise<'light' | 'dark'> {
  const r = await reg(['query', String.raw`HKCU\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize`, '/v', 'AppsUseLightTheme']);
  return r.code === 0 ? parseAppsTheme(r.stdout) : 'light';
}

export function assertTraySupported(platform: NodeJS.Platform = process.platform): void {
  if (platform !== 'win32') {
    throw new AppError('NOT_IMPLEMENTED', 'Ikon tray baru tersedia di Windows. Di OS ini pakai "prototyper serve" lalu buka Web UI.');
  }
}

/** Argumen untuk menjalankan tray di latar (dipakai startup Windows & peluncur). */
export function trayArgs(config: Config, extra: string[] = []): string[] {
  return [...cliCommand(), '--home', config.home, '--port', String(config.port), 'tray', ...extra];
}

/** Jalankan proses tray `--foreground` terlepas dari konsol ini; output ke tray.log. */
export function spawnTray(config: Config, extra: string[] = []): string {
  const f = trayFiles(config.home);
  mkdirSync(config.home, { recursive: true });
  try {
    if (statSync(f.log).size > 1024 * 1024) rmSync(f.log, { force: true });
  } catch {
    /* belum ada */
  }
  const out = openSync(f.log, 'a');
  const [cmd, ...args] = trayArgs(config, ['--foreground', ...extra]);
  const child = spawn(cmd!, args, { detached: true, stdio: ['ignore', out, out], windowsHide: true, env: process.env });
  child.unref();
  return f.log;
}

export interface LaunchResult {
  alreadyRunning: boolean;
  pid: number | null;
  log: string;
}

/** `prototyper tray` tanpa --foreground: jalankan tray di latar, atau buka Web UI bila sudah ada. */
export async function launchTray(config: Config): Promise<LaunchResult> {
  assertTraySupported();
  const f = trayFiles(config.home);
  const pid = runningTrayPid(config.home);
  if (pid) {
    if (await new DaemonClient(config).health()) openBrowser(`http://localhost:${config.port}`);
    return { alreadyRunning: true, pid, log: f.log };
  }
  return { alreadyRunning: false, pid: null, log: spawnTray(config) };
}

function httpApi(config: Config): DaemonApi {
  const client = new DaemonClient(config);
  const enc = encodeURIComponent;
  return {
    async list() {
      if (!(await client.health())) return null;
      return client.request<PrototypeView[]>('GET', '/api/prototypes').catch(() => null);
    },
    async action(id, action) {
      await client.request('POST', `/api/prototypes/${enc(id)}/${action}`);
    },
    async ensure() {
      await client.ensure();
    },
    async shutdown() {
      if (!(await client.health())) return;
      await client.request('POST', '/api/shutdown');
      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline && (await client.health())) await new Promise((r) => setTimeout(r, 300));
    },
  };
}

/** Proses tray sebenarnya (`prototyper tray --foreground`). Berjalan sampai Keluar. */
export async function runTray(config: Config, opts: { restore?: string[] } = {}): Promise<void> {
  assertTraySupported();
  const f = trayFiles(config.home);
  const other = runningTrayPid(config.home);
  if (other) throw new AppError('CONFLICT', `Tray Prototyper sudah berjalan (PID ${other})`);
  mkdirSync(config.home, { recursive: true });
  writeFileSync(f.lock, String(process.pid));
  const releaseLock = () => {
    try {
      if (readFileSync(f.lock, 'utf8').trim() === String(process.pid)) rmSync(f.lock, { force: true });
    } catch {
      /* sudah hilang */
    }
  };
  process.once('exit', releaseLock);
  if (APP_MODE === 'sea') await cleanupOldExecutable(process.execPath);

  const icon = trayIconPath();
  if (!existsSync(icon)) throw new AppError('INTERNAL', `Icon tray tidak ditemukan: ${icon}`);

  const assetName = selfUpdateAssetName('{v}', process.platform, process.arch, APP_MODE);
  const startup = new StartupEntry();
  const host = new TrayHost();
  const theme = await readAppsTheme();
  const controller = new TrayController({
    host,
    api: httpApi(config),
    url: `http://localhost:${config.port}`,
    version: VERSION,
    selfUpdate: assetName !== null,
    updater: {
      check: async () => {
        const latest = await fetchLatestRelease(config.updateRepo, VERSION);
        return evaluateRelease(VERSION, latest, assetName?.replace('{v}', latest.version) ?? null);
      },
      download: (check, onProgress) => downloadUpdate(check, f.updates, onProgress),
    },
    startup: {
      get: async () => (await startup.get()) !== null,
      set: (enabled) => startup.set(enabled, trayArgs(config)),
    },
    openUrl: openBrowser,
    theme,
    settingsFile: f.settings,
    install: async (file, restore) => {
      if (APP_MODE !== 'sea') throw new AppError('NOT_IMPLEMENTED', 'Pemasangan otomatis hanya untuk prototyper.exe');
      replaceExecutable(process.execPath, file);
      releaseLock();
      spawnTray(config, restore.length ? ['--restore', restore.join(',')] : []);
    },
    exit: (code) => {
      releaseLock();
      process.exit(code);
    },
    autoUpdate: config.updateCheck ? { firstMs: 10_000, everyMs: DAY_MS } : null,
  });

  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.once(sig, () => {
      host.close();
      releaseLock();
      process.exit(0);
    });
  }

  host.start(f.dir, icon);
  console.log(`Tray Prototyper berjalan (PID ${process.pid}, data ${config.home})`);
  await controller.start(opts.restore ?? []);
}
