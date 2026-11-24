import { APP_HOST, APP_MODE, type AppMode } from './appfiles.js';
import type { LanMode } from './config.js';
import { AppError, errorMessage } from './errors.js';
import {
  detectInstaller,
  evaluateRelease,
  fetchLatestRelease,
  updateCandidates,
  type InstallContext,
  type UpdateCheck,
  type UpdateKind,
} from './update.js';
import { defineMessages } from './i18n.js';

const t = defineMessages({
  id: {
    hintSource: 'Jalankan "git pull" lalu "npm install" di repo Prototyper.',
    hintPackage: 'Unduh paket npm/portable versi baru dari halaman rilis lalu pasang ulang.',
    hintSea: 'Unduh berkas rilis untuk OS ini dari halaman rilis.',
    checkFailed: 'Gagal memeriksa pembaruan',
    downloading: 'Mengunduh {name}…',
    stoppingDaemon: 'Menghentikan daemon…',
    closingTray: 'Menutup tray…',
    installing: 'Memasang {version}…',
    installFailed: 'Gagal memasang pembaruan: {message}',
  },
  en: {
    hintSource: 'Run "git pull" and then "npm install" in the Prototyper repo.',
    hintPackage: 'Download the new npm/portable package from the releases page and reinstall.',
    hintSea: 'Download the release file for this OS from the releases page.',
    checkFailed: 'Could not check for updates',
    downloading: 'Downloading {name}…',
    stoppingDaemon: 'Stopping the daemon…',
    closingTray: 'Closing the tray…',
    installing: 'Installing {version}…',
    installFailed: 'Could not install the update: {message}',
  },
});

/**
 * Pemeriksaan & pemasangan pembaruan untuk CLI (`prototyper update`) dan Web UI (`/api/update`).
 * Tray memakai logika yang sama di src/core/update.ts; di sini hanya alur tanpa tray.
 */

/** Konteks instalasi proses ini (sama dengan yang dipakai tray). */
export function installContext(): InstallContext {
  return {
    platform: process.platform,
    arch: process.arch,
    mode: APP_MODE,
    runtime: APP_HOST?.runtime ?? null,
    installer: APP_MODE === 'sea' ? detectInstaller(process.execPath) : null,
  };
}

export async function checkForUpdate(repo: string, current: string, ctx: InstallContext, fetchImpl: typeof fetch = fetch): Promise<UpdateCheck> {
  const latest = await fetchLatestRelease(repo, current, fetchImpl);
  return evaluateRelease(current, latest, updateCandidates(latest.version, ctx));
}

/** Petunjuk memperbarui secara manual untuk instalasi yang tidak bisa dipasang otomatis. */
export function manualHint(mode: AppMode): string {
  switch (mode) {
    case 'source':
      return t('hintSource');
    case 'dist':
    case 'bundle':
      return t('hintPackage');
    case 'sea':
      return t('hintSea');
  }
}

/** Ringkasan pembaruan untuk Web UI / `--json`. */
export interface UpdateInfo {
  /** Pemeriksaan otomatis aktif (PROTOTYPER_UPDATE_CHECK ≠ 0). */
  enabled: boolean;
  current: string;
  latest: string | null;
  available: boolean;
  pageUrl: string | null;
  /** Bisa dipasang otomatis (biner tunggal Windows dengan berkas rilis yang cocok). */
  autoInstall: boolean;
  kind: UpdateKind | null;
  checkedAt: string | null;
  error: string | null;
  /** Petunjuk manual bila `autoInstall` false. */
  hint: string | null;
  /** Pemasangan sedang berjalan (dimulai dari Web UI). */
  installing: boolean;
}

export function toUpdateInfo(c: UpdateCheck, mode: AppMode, extra: { enabled: boolean; checkedAt: Date; installing?: boolean }): UpdateInfo {
  const autoInstall = c.asset !== null && c.checksums !== null;
  return {
    enabled: extra.enabled,
    current: c.current,
    latest: c.latest.version,
    available: c.available,
    pageUrl: c.latest.pageUrl,
    autoInstall,
    kind: autoInstall ? c.kind : null,
    checkedAt: extra.checkedAt.toISOString(),
    error: null,
    hint: autoInstall ? null : manualHint(mode),
    installing: extra.installing ?? false,
  };
}

export interface UpdateCheckerOptions {
  enabled: boolean;
  mode: AppMode;
  /** Versi yang sedang berjalan (bisa berubah setelah pembaruan Web UI tanpa restart). */
  version: () => string;
  check: (current: string) => Promise<UpdateCheck>;
  /** Lama hasil pemeriksaan disimpan (default 6 jam). */
  ttlMs?: number;
  now?: () => number;
}

/** Pemeriksaan pembaruan dengan cache, agar Web UI tidak memanggil GitHub tiap kali dibuka. */
export class UpdateChecker {
  private last: { at: number; version: string; check: UpdateCheck | null; error: string | null } | null = null;
  private pending: Promise<void> | null = null;
  installing = false;

  constructor(private readonly o: UpdateCheckerOptions) {}

  private now(): number {
    return this.o.now?.() ?? Date.now();
  }

  /** Hasil terakhir; `refresh` memaksa memeriksa lagi. Tanpa `refresh` dan pemeriksaan otomatis mati → tidak menghubungi GitHub. */
  async info(refresh = false): Promise<UpdateInfo> {
    const version = this.o.version();
    const stale = !this.last || this.last.version !== version || this.now() - this.last.at > (this.o.ttlMs ?? 6 * 60 * 60 * 1000);
    if (refresh || (stale && this.o.enabled)) await this.run(version);
    return this.view(version);
  }

  /** Pemeriksaan terbaru yang berhasil (untuk memasang). */
  async fresh(): Promise<UpdateCheck> {
    await this.run(this.o.version());
    if (!this.last?.check) throw new AppError('INTERNAL', this.last?.error ?? t('checkFailed'));
    return this.last.check;
  }

  private run(version: string): Promise<void> {
    this.pending ??= this.o
      .check(version)
      .then(
        (check) => void (this.last = { at: this.now(), version, check, error: null }),
        (err: unknown) => void (this.last = { at: this.now(), version, check: this.last?.check ?? null, error: errorMessage(err) }),
      )
      .finally(() => (this.pending = null));
    return this.pending;
  }

  private view(version: string): UpdateInfo {
    const l = this.last;
    if (l?.check && l.check.current === version) {
      return { ...toUpdateInfo(l.check, this.o.mode, { enabled: this.o.enabled, checkedAt: new Date(l.at), installing: this.installing }), error: l.error };
    }
    return {
      enabled: this.o.enabled,
      current: version,
      latest: null,
      available: false,
      pageUrl: null,
      autoInstall: false,
      kind: null,
      checkedAt: l ? new Date(l.at).toISOString() : null,
      error: l?.error ?? null,
      hint: null,
      installing: this.installing,
    };
  }
}

// ===== Pemasangan tanpa tray (CLI & Web UI) =====

export interface DaemonSnapshot {
  /** Prototype yang sedang berjalan; dinyalakan lagi setelah pembaruan. */
  running: string[];
  lanMode: LanMode;
}

export interface SelfUpdateDeps {
  check(): Promise<UpdateCheck>;
  download(check: UpdateCheck, onProgress: (fraction: number) => void): Promise<string>;
  /** Keadaan daemon sebelum pemasangan; null bila tidak berjalan. */
  daemon(): Promise<DaemonSnapshot | null>;
  shutdownDaemon(): Promise<void>;
  trayPid(): number | null;
  killTray(pid: number): void;
  /** Pasang berkas; untuk MSI, skrip pemasang yang menyalakan tray lagi dengan `restore`. */
  install(file: string, check: UpdateCheck, restore: string[]): Promise<void>;
  spawnTray(restore: string[]): void;
  startDaemon(lanMode: LanMode, restore: string[]): Promise<void>;
  log(message: string): void;
  onProgress?: (fraction: number) => void;
}

export type SelfUpdateStatus = 'uptodate' | 'available' | 'manual' | 'installed';

export interface SelfUpdateResult {
  status: SelfUpdateStatus;
  current: string;
  latest: string;
  pageUrl: string;
  kind: UpdateKind | null;
  /** Apa yang dinyalakan lagi setelah pemasangan. */
  restarted: 'tray' | 'daemon' | 'installer' | null;
  restore: string[];
}

/**
 * Periksa, lalu (bila `install`) unduh, hentikan daemon & tray, pasang, dan nyalakan lagi seperti semula
 * beserta prototype yang tadinya berjalan. Gagal memasang → keadaan semula dipulihkan lalu error dilempar.
 */
export async function runSelfUpdate(d: SelfUpdateDeps, opts: { install: boolean }): Promise<SelfUpdateResult> {
  const c = await d.check();
  const base = { current: c.current, latest: c.latest.version, pageUrl: c.latest.pageUrl, kind: c.kind, restarted: null, restore: [] as string[] };
  if (!c.available) return { ...base, status: 'uptodate' };
  if (!c.asset || !c.checksums) return { ...base, kind: null, status: 'manual' };
  if (!opts.install) return { ...base, status: 'available' };

  d.log(t('downloading', { name: c.asset.name }));
  const file = await d.download(c, d.onProgress ?? (() => undefined));

  const snap = await d.daemon();
  const restore = snap?.running ?? [];
  const tray = d.trayPid();
  // daemon dulu (prototype berhenti dengan rapi), baru tray: taskkill /T pada tray ikut mematikan anaknya
  if (snap) {
    d.log(t('stoppingDaemon'));
    await d.shutdownDaemon();
  }
  if (tray) {
    d.log(t('closingTray'));
    d.killTray(tray);
  }

  const bringBack = async (): Promise<SelfUpdateResult['restarted']> => {
    if (tray) {
      d.spawnTray(restore);
      return 'tray';
    }
    if (snap) {
      await d.startDaemon(snap.lanMode, restore);
      return 'daemon';
    }
    return null;
  };

  d.log(t('installing', { version: c.latest.version }));
  try {
    await d.install(file, c, restore);
  } catch (err) {
    await bringBack().catch(() => undefined);
    throw new AppError('INTERNAL', t('installFailed', { message: errorMessage(err) }));
  }
  const restarted = c.kind === 'msi' ? 'installer' : await bringBack();
  return { ...base, status: 'installed', restarted, restore };
}
