import type { LanMode } from '../core/config.js';
import type { LangSetting } from '../core/i18n.js';
import type { PrototypeView } from '../core/views.js';
import type { IconState } from './host.js';
import { t } from './messages.js';

/** State tray + turunan sederhana (ikon, notifikasi). Popup klik kiri & menu klik kanan digambar dari popup.ts. */

export type UpdateStatus = 'idle' | 'checking' | 'uptodate' | 'available' | 'downloading' | 'ready' | 'error';

export interface UpdateState {
  status: UpdateStatus;
  current: string;
  latest: string | null;
  /** 0..1 saat mengunduh. */
  progress: number;
  checkedAt: Date | null;
  error: string | null;
  /** true bila pembaruan bisa diunduh & dipasang dari tray (biner tunggal Windows). */
  selfUpdate: boolean;
  /** Saat `ready`: false bila paket yang diunduh hanya mengubah Web UI (dipasang tanpa mulai ulang). */
  restart: boolean;
}

export type LanScope = Exclude<LanMode, 'off'>;

export interface TrayState {
  url: string;
  daemonUp: boolean;
  /** Daemon sedang dinyalakan/dihentikan dari tray. */
  daemonBusy: 'starting' | 'stopping' | null;
  prototypes: PrototypeView[];
  /** Jumlah baris prototype yang tampil di popup; bertambah lewat "Tampilkan lagi". */
  listLimit: number;
  /** Sedang memuat baris lagi / meringkas daftar: tombolnya menampilkan spinner sebentar. */
  listBusy: 'more' | 'less' | null;
  /** null: status startup tidak diketahui / tidak didukung. */
  startup: boolean | null;
  notifications: boolean;
  /** Mode LAN daemon: `prototypes` = hanya prototype yang terbuka ke LAN, `all` = Web UI juga. */
  lanMode: LanMode;
  /** Lingkup LAN terakhir yang dipilih; dipakai saat toggle Mode LAN dinyalakan. */
  lanScope: LanScope;
  /** Alamat IPv4 LAN mesin ini, yang paling mungkin dipakai lebih dulu. */
  lanAddrs: string[];
  update: UpdateState;
  /** Tema aplikasi Windows; menu klik kanan mengikutinya (seperti prototype mengikuti prefers-color-scheme). */
  theme: 'light' | 'dark';
  /** Pengaturan bahasa (`fromEnv`: dikunci PROTOTYPER_LANG, tidak bisa diganti dari tray). */
  lang: { setting: LangSetting; fromEnv: boolean };
  /** Pilihan bahasa di menu klik kanan sedang dibuka. */
  langOpen: boolean;
}


/** URL Web UI dari perangkat lain (alamat LAN pertama), atau null bila Web UI tidak terbuka ke LAN / tanpa jaringan. */
export function lanUrl(s: Pick<TrayState, 'url' | 'lanMode' | 'lanAddrs'>): string | null {
  const addr = s.lanMode === 'all' ? s.lanAddrs[0] : undefined;
  if (!addr) return null;
  const port = new URL(s.url).port;
  return `http://${addr}${port ? `:${port}` : ''}`;
}

const runningOnPort = (s: Pick<TrayState, 'prototypes'>) => s.prototypes.filter((p) => p.status === 'running' && p.port);

/**
 * Teks yang disalin tombol "Salin": URL Web UI (mode `all`), atau URL LAN prototype yang berjalan
 * (mode `prototypes`; satu baris "Nama: URL" per prototype bila lebih dari satu). null = tidak ada yang disalin.
 */
export function lanCopyText(s: Pick<TrayState, 'url' | 'lanMode' | 'lanAddrs' | 'prototypes'>): string | null {
  const addr = s.lanMode !== 'off' ? s.lanAddrs[0] : undefined;
  if (!addr) return null;
  if (s.lanMode === 'all') return lanUrl(s);
  const running = runningOnPort(s);
  if (running.length === 1) return `http://${addr}:${running[0]!.port}`;
  return running.length ? running.map((p) => `${p.name}: http://${addr}:${p.port}`).join('\r\n') : null;
}

/** Baris keterangan di bawah toggle Mode LAN. */
export function lanNote(s: Pick<TrayState, 'url' | 'lanMode' | 'lanAddrs' | 'prototypes' | 'daemonUp'>): string {
  if (!s.daemonUp) return t('lanNoteResume');
  const addr = s.lanAddrs[0];
  if (!addr) return t('lanNoteNoNetwork');
  if (s.lanMode === 'all') return lanUrl(s)!.replace(/^http:\/\//, '');
  const running = runningOnPort(s);
  if (running.length === 1) return `${addr}:${running[0]!.port}`;
  return running.length ? t('lanNoteRunning', { addr, n: running.length }) : t('lanNoteStartFirst', { addr });
}

export const isLive = (p: PrototypeView) => p.status === 'running' || p.status === 'starting';

export function summary(s: TrayState): string {
  if (s.daemonBusy === 'starting') return t('daemonStarting');
  if (s.daemonBusy === 'stopping') return t('daemonStopping');
  if (!s.daemonUp) return t('daemonPaused');
  const running = s.prototypes.filter((p) => p.status === 'running').length;
  return t('summaryActive', { running, total: s.prototypes.length });
}

export function iconState(s: TrayState): IconState {
  const running = s.prototypes.filter((p) => p.status === 'running').length;
  const updateReady = s.update.status === 'available' || s.update.status === 'ready';
  return {
    badge: s.daemonUp ? running : 0,
    dot: updateReady,
    paused: !s.daemonUp,
    tooltip: `Prototyper — ${s.daemonUp ? `${t('tooltipRunning', { n: running })}${s.lanMode === 'all' ? t('tooltipLanAll') : s.lanMode === 'prototypes' ? t('tooltipLanPrototypes') : ''}` : t('tooltipPaused')}${updateReady ? t('tooltipUpdate') : ''}`,
  };
}

export interface Notice {
  title: string;
  text: string;
}

/** Notifikasi untuk perubahan status prototype antar dua polling. */
export function statusNotices(prev: PrototypeView[], next: PrototypeView[]): Notice[] {
  const before = new Map(prev.map((p) => [p.id, p.status]));
  const out: Notice[] = [];
  for (const p of next) {
    const was = before.get(p.id);
    if (was === undefined || was === p.status) continue;
    if (p.status === 'running') {
      out.push({ title: p.name, text: t('noticeRunningAt', { where: p.url?.replace(/^https?:\/\//, '') ?? t('noticePort', { port: p.port }) }) });
    } else if (p.status === 'crashed' || p.status === 'failed') {
      out.push({ title: p.name, text: `${t(p.status === 'failed' ? 'noticeFailed' : 'noticeCrashed')}${p.error ? `: ${p.error}` : ''}`.slice(0, 200) });
    }
  }
  return out;
}
