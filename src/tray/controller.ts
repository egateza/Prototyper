import { promises as fs } from 'node:fs';
import path from 'node:path';
import { errorMessage } from '../core/errors.js';
import { rankLanAddresses } from '../core/net.js';
import type { UpdateCheck } from '../core/update.js';
import type { PrototypeView } from '../core/views.js';
import type { HostEvent, TrayHostLike } from './host.js';
import type { LanMode } from '../core/config.js';
import { iconState, isLive, lanCopyText, lanUrl, statusNotices, summary, type LanScope, type TrayState } from './menu.js';
import { menuLayout, popupLayout } from './popup.js';

/** Akses ke daemon (lewat HTTP di aplikasi asli, tiruan di tes). */
export interface DaemonApi {
  /** Daftar prototype & mode daemon, atau null bila daemon tidak berjalan. */
  status(): Promise<DaemonStatus | null>;
  action(id: string, action: 'start' | 'stop' | 'restart'): Promise<void>;
  /** Nyalakan daemon (bila belum) dengan mode LAN `lanMode`, dan tunggu sampai siap. */
  ensure(opts: { lanMode: LanMode }): Promise<void>;
  /** Hentikan daemon beserta semua prototype, tunggu sampai mati. */
  shutdown(): Promise<void>;
}

export interface DaemonStatus {
  prototypes: PrototypeView[];
  /** Mode LAN daemon yang sedang berjalan. */
  lanMode: LanMode;
}

export interface Updater {
  check(): Promise<UpdateCheck>;
  download(check: UpdateCheck, onProgress: (fraction: number) => void): Promise<string>;
}

export interface StartupControl {
  get(): Promise<boolean>;
  set(enabled: boolean): Promise<void>;
}

export interface TrayDeps {
  host: TrayHostLike;
  api: DaemonApi;
  /** URL Web UI Prototyper. */
  url: string;
  version: string;
  /** true bila pembaruan bisa dipasang dari tray. */
  selfUpdate: boolean;
  updater: Updater;
  startup: StartupControl | null;
  openUrl: (url: string) => void;
  /** File pengaturan tray (notifikasi). */
  settingsFile: string;
  /** Pasang `file` (jenisnya dari `check.kind`) lalu jalankan ulang tray yang menyalakan lagi `restore`. */
  install: (file: string, restore: string[], check: UpdateCheck) => Promise<void>;
  /**
   * Paket aplikasi (`check.kind === 'app'`): pasang selagi daemon berjalan. `live`: hanya Web UI yang
   * berubah dan daemon sudah beralih ke sana, tanpa restart. `live: false`: sudah terpasang, tapi kode
   * berubah sehingga tray & daemon perlu dimulai ulang (lewat `relaunch`). Tanpa ini: alur `install`.
   */
  applyApp?: (file: string, check: UpdateCheck) => Promise<AppApplyResult>;
  /** Jalankan tray baru yang menyalakan lagi `restore` (dipakai setelah `applyApp` butuh restart). */
  relaunch?: (restore: string[]) => void;
  /**
   * Paket aplikasi yang sudah diunduh hanya mengubah Web UI (codeHash sama dengan kode tray ini),
   * sehingga `applyApp` akan memasangnya tanpa restart. Hanya untuk label tombol; tanpa ini: "Mulai ulang".
   */
  webOnly?: (file: string) => boolean;
  /** Dipanggil saat tray selesai (Keluar, host tertutup). */
  exit: (code: number) => void;
  /** Alamat IPv4 LAN mesin ini (untuk alamat yang ditampilkan saat mode LAN aktif). */
  lanAddresses?: () => string[];
  /** Salin teks ke clipboard. Tanpa ini: tombol "Salin" hanya memberi notifikasi alamatnya. */
  copyText?: (text: string) => void;
  /** Paksa mode LAN saat mulai (tray dijalankan dengan `--lan`/`--lan-prototypes`). Selain itu: dari tray.json. */
  lanMode?: LanMode;
  /** Tema aplikasi Windows untuk menu klik kanan (default terang). */
  theme?: 'light' | 'dark';
  /** Interval polling daemon (ms). */
  pollMs?: number;
  /** Periksa pembaruan otomatis: jeda pertama & interval (ms). null = mati. */
  autoUpdate?: { firstMs: number; everyMs: number } | null;
}

interface Settings {
  notifications: boolean;
  lanMode: LanMode;
  lanScope: LanScope;
}

const LAN_MODES: readonly LanMode[] = ['off', 'prototypes', 'all'];
const LAN_LABEL: Record<LanScope, string> = { all: 'Web UI + prototype', prototypes: 'prototype saja' };

export type AppApplyResult = { live: true; version: string } | { live: false };

/** Hash halaman "Yang baru" di Web UI (lihat `WHATSNEW` di web/app.js). */
export const WHATSNEW_HASH = '#!whatsnew';

export class TrayController {
  readonly state: TrayState;
  private check: UpdateCheck | null = null;
  private downloaded: string | null = null;
  private timers: NodeJS.Timeout[] = [];
  private polling = false;
  private lastRendered: string[] = [];
  private stopped = false;

  constructor(private readonly d: TrayDeps) {
    this.state = {
      url: d.url,
      daemonUp: false,
      daemonBusy: null,
      prototypes: [],
      startup: null,
      notifications: true,
      lanMode: d.lanMode ?? 'off',
      lanScope: d.lanMode === 'prototypes' ? 'prototypes' : 'all',
      lanAddrs: [],
      theme: d.theme ?? 'light',
      update: { status: 'idle', current: d.version, latest: null, progress: 0, checkedAt: null, error: null, selfUpdate: d.selfUpdate, restart: true },
    };
    d.host.on('event', (e: HostEvent) => void this.onEvent(e));
    d.host.on('exit', () => this.finish(0));
  }

  /** Nyalakan daemon, lalu mulai polling. `restore`: prototype yang dinyalakan lagi (setelah pembaruan). */
  async start(restore: string[] = []): Promise<void> {
    await this.loadSettings();
    if (this.d.startup) this.state.startup = await this.d.startup.get().catch(() => null);
    this.render();
    await this.resumeDaemon(false);
    for (const id of restore) await this.d.api.action(id, 'start').catch(() => undefined);
    if (restore.length) await this.poll();
    this.timers.push(setInterval(() => void this.poll(), this.d.pollMs ?? 2000));
    const auto = this.d.autoUpdate;
    if (auto) {
      this.timers.push(setTimeout(() => void this.checkUpdate(true), auto.firstMs));
      this.timers.push(setInterval(() => void this.checkUpdate(true), auto.everyMs));
    }
  }

  /**
   * Balon notifikasi tray. `info` mengikuti "Tampilkan notifikasi"; `error` (aksi yang diklik pengguna gagal
   * atau tidak bisa dijalankan) tetap tampil agar kegagalan tidak terjadi diam-diam.
   */
  private notify(title: string, text: string, kind: 'info' | 'error' = 'info'): void {
    if (this.state.notifications || kind === 'error') this.d.host.balloon(title, text);
  }

  render(): void {
    const s = this.state;
    const popup = popupLayout(s);
    const menu = menuLayout(s);
    const icon = iconState(s);
    // host menggambar ulang setiap pesan: kirim hanya bagian yang berubah
    const keys = [JSON.stringify(popup), JSON.stringify(menu), JSON.stringify(icon)];
    const last = this.lastRendered;
    this.lastRendered = keys;
    if (keys[0] !== last[0]) this.d.host.setPopup(popup);
    if (keys[1] !== last[1]) this.d.host.setMenu(menu);
    if (keys[2] !== last[2]) this.d.host.setIcon(icon);
  }

  async poll(): Promise<void> {
    if (this.polling || this.stopped) return;
    this.polling = true;
    try {
      const st = await this.d.api.status().catch(() => null);
      const s = this.state;
      if (st) {
        if (s.daemonUp) for (const n of statusNotices(s.prototypes, st.prototypes)) this.notify(n.title, n.text);
        s.prototypes = st.prototypes;
        // daemon bisa dinyalakan dari luar tray (CLI) dengan mode lain: tampilkan mode sebenarnya
        if (!s.daemonBusy) {
          s.lanMode = st.lanMode;
          if (st.lanMode !== 'off') s.lanScope = st.lanMode;
        }
      }
      if (!s.daemonBusy) s.daemonUp = st !== null;
      if (!st) this.markStopped();
      this.refreshLanAddrs();
      this.render();
    } finally {
      this.polling = false;
    }
  }

  private async onEvent(e: HostEvent): Promise<void> {
    if (e.t === 'ready') {
      this.lastRendered = []; // host baru: kirim semuanya
      return this.render();
    }
    if (e.t === 'open') return this.openUi();
    if (e.t !== 'click') return;
    try {
      await this.click(e.id);
    } catch (err) {
      this.notify('Prototyper', errorMessage(err), 'error');
    }
    await this.poll();
  }

  async click(id: string): Promise<void> {
    const m = /^p:(start|stop|restart|open):(.+)$/.exec(id);
    if (m) return this.prototypeAction(m[1] as 'start' | 'stop' | 'restart' | 'open', m[2]!);
    switch (id) {
      case 'open':
        return this.openUi();
      case 'startAll':
        return this.startAll();
      case 'stopAll':
        return this.stopAll();
      case 'pause':
        return this.state.daemonUp ? this.pauseDaemon() : this.resumeDaemon(true);
      case 'startup':
        return this.toggleStartup();
      case 'notif':
        return this.toggleNotifications();
      case 'lan':
        return this.setLanMode(this.state.lanMode === 'off' ? this.state.lanScope : 'off');
      case 'lan:all':
      case 'lan:prototypes':
        return this.setLanMode(id === 'lan:all' ? 'all' : 'prototypes');
      case 'lanCopy':
        return this.copyLanUrl();
      case 'update':
        return this.updateAction();
      case 'whatsnew':
        return this.openUi(WHATSNEW_HASH);
      case 'quit':
        return this.quit();
    }
  }

  /** `hash`: halaman tertentu di Web UI, mis. `WHATSNEW_HASH`. */
  private openUi(hash = ''): void {
    if (!this.state.daemonUp) {
      this.notify('Daemon dijeda', 'Lanjutkan daemon dulu untuk membuka Prototyper.', 'error');
      return;
    }
    this.d.openUrl(`${this.state.url}${hash ? `/${hash}` : ''}`);
  }

  private async prototypeAction(action: 'start' | 'stop' | 'restart' | 'open', id: string): Promise<void> {
    if (action === 'open') {
      const url = this.state.prototypes.find((p) => p.id === id)?.url;
      if (url) this.d.openUrl(url);
      return;
    }
    if (!this.state.daemonUp) {
      this.notify('Daemon dijeda', 'Lanjutkan daemon dulu untuk menjalankan prototype.', 'error');
      return;
    }
    await this.d.api.action(id, action);
  }

  private async startAll(): Promise<void> {
    const targets = this.state.prototypes.filter((p) => p.valid && !isLive(p));
    const failed: string[] = [];
    for (const p of targets) {
      await this.d.api.action(p.id, 'start').catch(() => failed.push(p.name));
    }
    if (failed.length) this.notify('Sebagian gagal dijalankan', failed.join(', '), 'error');
  }

  private async stopAll(): Promise<void> {
    const targets = this.state.prototypes.filter((p) => isLive(p));
    for (const p of targets) await this.d.api.action(p.id, 'stop').catch(() => undefined);
    this.notify('Prototyper', 'Semua prototype dihentikan.');
  }

  private async pauseDaemon(): Promise<void> {
    this.state.daemonBusy = 'stopping';
    this.render();
    try {
      await this.d.api.shutdown();
      this.state.daemonUp = false;
      this.markStopped();
      this.notify('Prototyper', 'Daemon dijeda. Semua prototype dihentikan.');
    } finally {
      this.state.daemonBusy = null;
      this.render();
    }
  }

  private async resumeDaemon(announce: boolean): Promise<void> {
    this.state.daemonBusy = 'starting';
    this.render();
    try {
      await this.d.api.ensure({ lanMode: this.state.lanMode });
      this.state.daemonUp = true;
      if (announce) this.notify('Prototyper', 'Daemon berjalan kembali.');
    } catch (err) {
      this.state.daemonUp = false;
      this.notify('Daemon gagal dinyalakan', errorMessage(err), 'error');
    } finally {
      this.state.daemonBusy = null;
      await this.poll();
    }
  }

  /** Daemon mati = semua prototype berhenti; daftar terakhir tetap ditampilkan. */
  private markStopped(): void {
    for (const p of this.state.prototypes) {
      if (p.status !== 'stopped') Object.assign(p, { status: 'stopped', port: null, url: null, pid: null });
    }
  }

  private async toggleStartup(): Promise<void> {
    if (!this.d.startup) return;
    const next = !this.state.startup;
    await this.d.startup.set(next);
    this.state.startup = next;
    this.notify(
      'Jalankan saat startup',
      next ? 'Diaktifkan — Prototyper otomatis berjalan di tray saat Windows mulai.' : 'Dinonaktifkan — jalankan manual dari prototyper.exe.',
    );
    this.render();
  }

  private async toggleNotifications(): Promise<void> {
    this.state.notifications = !this.state.notifications;
    await this.saveSettings();
    if (this.state.notifications) this.notify('Notifikasi', 'Notifikasi tray diaktifkan.');
    this.render();
  }

  // ===== Mode LAN =====

  private refreshLanAddrs(): void {
    try {
      this.state.lanAddrs = this.state.lanMode !== 'off' ? rankLanAddresses(this.d.lanAddresses?.() ?? []) : [];
    } catch {
      this.state.lanAddrs = [];
    }
  }

  /**
   * Mode LAN hanya bisa diubah saat daemon dinyalakan (alamat bind), jadi daemon dimulai ulang
   * dengan mode baru, lalu prototype yang tadinya berjalan dinyalakan lagi. Pilihan disimpan di tray.json.
   */
  private async setLanMode(next: LanMode): Promise<void> {
    const s = this.state;
    if (s.daemonBusy || next === s.lanMode) return;
    s.lanMode = next;
    if (next !== 'off') s.lanScope = next;
    await this.saveSettings();
    this.refreshLanAddrs();
    if (!s.daemonUp) {
      this.notify('Mode LAN', next === 'off' ? 'Dimatikan.' : `${LAN_LABEL[next]} — berlaku saat daemon dilanjutkan.`);
      return this.render();
    }
    const restore = s.prototypes.filter((p) => isLive(p)).map((p) => p.id);
    s.daemonBusy = 'stopping';
    this.render();
    try {
      await this.d.api.shutdown();
      s.daemonUp = false;
      this.markStopped();
      s.daemonBusy = 'starting';
      this.render();
      await this.d.api.ensure({ lanMode: next });
      s.daemonUp = true;
    } catch (err) {
      s.daemonBusy = null;
      this.notify('Gagal mengubah mode LAN', errorMessage(err), 'error');
      await this.poll();
      return;
    }
    const failed: string[] = [];
    for (const id of restore) await this.d.api.action(id, 'start').catch(() => failed.push(id));
    s.daemonBusy = null;
    await this.poll();
    const addr = s.lanAddrs[0];
    const firewall = 'Bila Windows meminta izin firewall, izinkan untuk jaringan Private.';
    if (next === 'off') {
      this.notify('Mode LAN dimatikan', 'Prototyper & prototype hanya bisa dibuka dari komputer ini.');
    } else if (!addr) {
      this.notify(`Mode LAN aktif (${LAN_LABEL[next]})`, 'Komputer ini belum terhubung ke jaringan. Alamat LAN muncul setelah tersambung.');
    } else if (next === 'all') {
      this.notify('Mode LAN aktif', `Buka ${lanUrl(s)} dari HP di jaringan yang sama, lalu pasangkan lewat ikon HP di Web UI komputer ini. ${firewall}`);
    } else {
      this.notify(
        'Mode LAN aktif (prototype saja)',
        `Prototype bisa dibuka dari perangkat lain di http://${addr}:<port prototype>. Web UI Prototyper tetap hanya di komputer ini. ${firewall}`,
      );
    }
    if (failed.length) this.notify('Sebagian gagal dijalankan lagi', failed.join(', '), 'error');
  }

  private copyLanUrl(): void {
    const text = this.state.daemonUp ? lanCopyText(this.state) : null;
    if (!text) return;
    if (!this.d.copyText) return this.notify('Alamat LAN', text);
    this.d.copyText(text);
    const lines = text.split('\r\n');
    this.notify('Alamat LAN disalin', lines.length > 1 ? `${lines.length} alamat prototype — tempel di perangkat lain.` : `${text} — tempel di browser perangkat lain.`);
  }

  // ===== Pembaruan =====

  async checkUpdate(silent = false): Promise<void> {
    const u = this.state.update;
    if (u.status === 'checking' || u.status === 'downloading' || u.status === 'ready') return;
    if (silent && u.status === 'available') return;
    u.status = 'checking';
    this.render();
    try {
      const c = await this.d.updater.check();
      this.check = c;
      u.checkedAt = new Date();
      u.latest = c.latest.version;
      u.error = null;
      u.selfUpdate = this.d.selfUpdate && c.asset !== null;
      if (c.available) {
        u.status = 'available';
        this.notify('Pembaruan tersedia', `Prototyper ${c.latest.version} sudah rilis (sekarang ${c.current}).`);
      } else {
        u.status = 'uptodate';
        if (!silent) this.notify('Tidak ada pembaruan', `Prototyper ${c.current} sudah versi terbaru.`);
      }
    } catch (err) {
      u.status = 'error';
      u.checkedAt = new Date();
      u.error = errorMessage(err);
      if (!silent) this.notify('Gagal memeriksa pembaruan', u.error, 'error');
    }
    this.render();
  }

  async updateAction(): Promise<void> {
    const u = this.state.update;
    const c = this.check;
    if (u.status === 'available' && c) {
      if (!u.selfUpdate) return this.d.openUrl(c.latest.pageUrl);
      return this.downloadUpdate(c);
    }
    if (u.status === 'ready' && this.downloaded && c) return this.installUpdate(this.downloaded, c);
    return this.checkUpdate(false);
  }

  private async downloadUpdate(c: UpdateCheck): Promise<void> {
    const u = this.state.update;
    u.status = 'downloading';
    u.progress = 0;
    this.render();
    try {
      this.downloaded = await this.d.updater.download(c, (f) => {
        // kirim ulang menu tiap kenaikan 5%
        if (Math.floor(f * 20) !== Math.floor(u.progress * 20)) {
          u.progress = f;
          this.render();
        }
        u.progress = f;
      });
      u.status = 'ready';
      u.restart = !(c.kind === 'app' && this.d.applyApp && this.isWebOnly(this.downloaded));
      this.notify(
        'Pembaruan siap dipasang',
        u.restart
          ? `Pilih "Mulai ulang" di tray untuk memasang ${c.latest.version}.`
          : `Pilih "Pasang" di tray untuk memasang ${c.latest.version}. Prototype tetap berjalan.`,
      );
    } catch (err) {
      u.status = 'available';
      this.notify('Gagal mengunduh pembaruan', errorMessage(err), 'error');
    }
    this.render();
  }

  private isWebOnly(file: string): boolean {
    try {
      return this.d.webOnly?.(file) ?? false;
    } catch {
      return false;
    }
  }

  private async installUpdate(file: string, check: UpdateCheck): Promise<void> {
    if (check.kind === 'app' && this.d.applyApp && this.d.relaunch) return this.applyAppUpdate(file, check, this.d.applyApp, this.d.relaunch);
    const restore = this.state.prototypes.filter((p) => p.status === 'running').map((p) => p.id);
    this.notify('Memasang pembaruan…', 'Prototyper akan dimulai ulang.');
    this.stopTimers();
    if (this.state.daemonUp) await this.d.api.shutdown(); // daemon versi lama harus berhenti dulu
    try {
      await this.d.install(file, restore, check);
    } catch (err) {
      this.notify('Gagal memasang pembaruan', errorMessage(err), 'error');
      await this.resumeDaemon(false);
      for (const id of restore) await this.d.api.action(id, 'start').catch(() => undefined);
      this.timers.push(setInterval(() => void this.poll(), this.d.pollMs ?? 2000));
      return;
    }
    this.finish(0);
  }

  /**
   * Paket aplikasi dipasang selagi daemon & prototype tetap berjalan. Bila hanya Web UI yang berubah,
   * selesai di sini (cukup muat ulang browser); bila kode berubah, baru daemon dihentikan & tray dimulai ulang.
   */
  private async applyAppUpdate(
    file: string,
    check: UpdateCheck,
    applyApp: NonNullable<TrayDeps['applyApp']>,
    relaunch: NonNullable<TrayDeps['relaunch']>,
  ): Promise<void> {
    const u = this.state.update;
    let r: AppApplyResult;
    try {
      r = await applyApp(file, check);
    } catch (err) {
      // belum ada yang berubah: daemon & prototype tetap berjalan
      this.notify('Gagal memasang pembaruan', errorMessage(err), 'error');
      u.status = 'available';
      this.downloaded = null;
      this.render();
      return;
    }
    if (r.live) {
      u.current = r.version;
      u.latest = r.version;
      u.status = 'uptodate';
      this.downloaded = null;
      this.check = null;
      this.notify('Prototyper diperbarui', `Versi ${r.version} terpasang tanpa memulai ulang. Muat ulang halaman Prototyper di browser.`);
      this.render();
      return;
    }
    const restore = this.state.prototypes.filter((p) => p.status === 'running').map((p) => p.id);
    this.notify('Memasang pembaruan…', 'Prototyper akan dimulai ulang.');
    this.stopTimers();
    if (this.state.daemonUp) await this.d.api.shutdown().catch(() => undefined);
    relaunch(restore);
    this.finish(0);
  }

  private async quit(): Promise<void> {
    this.stopTimers();
    if (this.state.daemonUp) await this.d.api.shutdown().catch(() => undefined);
    this.finish(0);
  }

  private stopTimers(): void {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
  }

  private finish(code: number): void {
    if (this.stopped) return;
    this.stopped = true;
    this.stopTimers();
    this.d.host.close();
    this.d.exit(code);
  }

  /** Untuk tes: hentikan timer tanpa keluar. */
  dispose(): void {
    this.stopTimers();
    this.stopped = true;
  }

  describe(): string {
    return summary(this.state);
  }

  // ===== Pengaturan =====

  private async loadSettings(): Promise<void> {
    try {
      const s = JSON.parse(await fs.readFile(this.d.settingsFile, 'utf8')) as Partial<Settings>;
      if (typeof s.notifications === 'boolean') this.state.notifications = s.notifications;
      if (s.lanScope === 'all' || s.lanScope === 'prototypes') this.state.lanScope = s.lanScope;
      if (LAN_MODES.includes(s.lanMode as LanMode) && !this.d.lanMode) this.state.lanMode = s.lanMode as LanMode;
    } catch {
      /* belum ada / rusak: pakai default */
    }
  }

  private async saveSettings(): Promise<void> {
    const s: Settings = { notifications: this.state.notifications, lanMode: this.state.lanMode, lanScope: this.state.lanScope };
    await fs.mkdir(path.dirname(this.d.settingsFile), { recursive: true });
    await fs.writeFile(this.d.settingsFile, `${JSON.stringify(s, null, 2)}\n`);
  }
}
