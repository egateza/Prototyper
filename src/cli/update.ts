import { spawn } from 'node:child_process';
import { mkdirSync, openSync } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import { APP_MODE, cliCommand } from '../core/appfiles.js';
import { lanArgs, type Config } from '../core/config.js';
import { AppError } from '../core/errors.js';
import { checkForUpdate, installContext, manualHint, runSelfUpdate, type SelfUpdateDeps, type SelfUpdateResult } from '../core/selfupdate.js';
import { downloadUpdate } from '../core/update.js';
import { httpApi, installUpdate, quitDeps, restoreArgs, runningTrayPid, spawnTray, trayFiles } from '../tray/index.js';
import { VERSION } from '../version.js';
import { DaemonClient } from './client.js';
import { printJson } from './output.js';
import { defineMessages } from '../core/i18n.js';

const t = defineMessages({
  id: {
    autoInstallSeaOnly: 'Pemasangan otomatis hanya untuk prototyper.exe',
    upToDate: '✓ Prototyper {current} sudah versi terbaru',
    available: 'Pembaruan tersedia: {current} → {latest}',
    releaseNotes: '  Catatan rilis: {url}',
    installWith: '  Pasang dengan: prototyper update',
    manual: '  Instalasi ini tidak bisa diperbarui otomatis. {hint}',
    releasePage: '  Halaman rilis: {url}',
    restartedTray: 'Tray dinyalakan lagi',
    restartedDaemon: 'Daemon dinyalakan lagi',
    restartedInstaller: 'Installer MSI berjalan di latar dan akan menyalakan tray lagi',
    restoredPrototypes: ', prototype dinyalakan lagi: {ids}',
    installed: '✓ Prototyper {latest} terpasang (sebelumnya {current})',
    updateDesc: 'periksa & pasang pembaruan Prototyper dari GitHub Releases',
    optCheck: 'hanya periksa, jangan pasang',
  },
  en: {
    autoInstallSeaOnly: 'Automatic installation is only available for prototyper.exe',
    upToDate: '✓ Prototyper {current} is the latest version',
    available: 'Update available: {current} → {latest}',
    releaseNotes: '  Release notes: {url}',
    installWith: '  Install with: prototyper update',
    manual: '  This installation cannot be updated automatically. {hint}',
    releasePage: '  Release page: {url}',
    restartedTray: 'Tray started again',
    restartedDaemon: 'Daemon started again',
    restartedInstaller: 'The MSI installer is running in the background and will start the tray again',
    restoredPrototypes: ', prototypes started again: {ids}',
    installed: '✓ Prototyper {latest} installed (previously {current})',
    updateDesc: 'check for & install Prototyper updates from GitHub Releases',
    optCheck: 'only check, do not install',
  },
});

/** Dependensi nyata `prototyper update` untuk instalasi ini. */
export function selfUpdateDeps(config: Config, log: (m: string) => void, onProgress?: (f: number) => void): SelfUpdateDeps {
  const api = httpApi(config);
  const ctx = installContext();
  return {
    check: () => checkForUpdate(config.updateRepo, VERSION, ctx),
    download: (check, progress) => downloadUpdate(check, trayFiles(config.home).updates, progress),
    daemon: async () => {
      const s = await api.status();
      return s ? { running: s.prototypes.filter((p) => p.status === 'running').map((p) => p.id), lanMode: s.lanMode } : null;
    },
    shutdownDaemon: () => api.shutdown(),
    trayPid: () => runningTrayPid(config.home),
    killTray: (pid) => quitDeps(config).killTree(pid),
    install: async (file, check, restore) => {
      if (APP_MODE !== 'sea') throw new AppError('NOT_IMPLEMENTED', t('autoInstallSeaOnly'));
      await installUpdate(config, file, check, restoreArgs(restore));
    },
    spawnTray: (restore) => void spawnTray(config, restoreArgs(restore)),
    startDaemon: async (lanMode, restore) => {
      await new DaemonClient({ ...config, lanMode }).ensure();
      for (const id of restore) await api.action(id, 'start').catch(() => undefined);
    },
    log,
    ...(onProgress ? { onProgress } : {}),
  };
}

/** Log `prototyper update` yang dijalankan dari Web UI. */
export const updateLogFile = (home: string) => path.join(trayFiles(home).updates, 'update.log');

/** Jalankan `prototyper update` terlepas dari daemon (dipakai Web UI); output ke update.log. */
export function spawnSelfUpdate(config: Config): string {
  const log = updateLogFile(config.home);
  mkdirSync(path.dirname(log), { recursive: true });
  const out = openSync(log, 'w');
  const [cmd, ...args] = [...cliCommand(), '--home', config.home, '--port', String(config.port), ...lanArgs(config.lanMode), 'update'];
  const child = spawn(cmd!, args, { detached: true, stdio: ['ignore', out, out], windowsHide: true, env: process.env });
  child.unref();
  return log;
}

function describe(r: SelfUpdateResult): string[] {
  switch (r.status) {
    case 'uptodate':
      return [t('upToDate', { current: r.current })];
    case 'available':
      return [t('available', { current: r.current, latest: r.latest }), t('releaseNotes', { url: r.pageUrl }), t('installWith')];
    case 'manual':
      return [
        t('available', { current: r.current, latest: r.latest }),
        t('manual', { hint: manualHint(APP_MODE) }),
        t('releasePage', { url: r.pageUrl }),
      ];
    case 'installed': {
      const again =
        r.restarted === 'tray' ? t('restartedTray') : r.restarted === 'daemon' ? t('restartedDaemon') : r.restarted === 'installer' ? t('restartedInstaller') : null;
      return [
        t('installed', { latest: r.latest, current: r.current }),
        ...(again ? [`  ${again}${r.restore.length ? t('restoredPrototypes', { ids: r.restore.join(', ') }) : ''}.`] : []),
      ];
    }
  }
}

export function registerUpdateCommand(
  program: Command,
  act: (fn: (ctx: { json: boolean; config: Config }, args: Array<string | undefined>, cmd: Command) => Promise<void>) => (...raw: unknown[]) => Promise<void>,
): void {
  program
    .command('update')
    .description(t('updateDesc'))
    .option('--check', t('optCheck'))
    .action(
      act(async (ctx, _args, cmd) => {
        const { check } = cmd.opts<{ check?: boolean }>();
        const log = (m: string) => {
          if (!ctx.json) console.log(m);
        };
        let shown = -1;
        const progress = (f: number) => {
          const pct = Math.floor(f * 100);
          if (ctx.json || pct === shown) return;
          shown = pct;
          process.stderr.write(`\r  ${pct}%${pct === 100 ? '\n' : ''}`);
        };
        const r = await runSelfUpdate(selfUpdateDeps(ctx.config, log, progress), { install: !check });
        if (ctx.json) return printJson(r);
        for (const line of describe(r)) console.log(line);
      }),
    );
}
