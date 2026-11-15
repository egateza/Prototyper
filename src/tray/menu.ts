import type { RunStatus } from '../core/runtime.js';
import type { PrototypeView } from '../core/views.js';
import type { IconState } from './host.js';

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

export interface TrayState {
  url: string;
  daemonUp: boolean;
  /** Daemon sedang dinyalakan/dihentikan dari tray. */
  daemonBusy: 'starting' | 'stopping' | null;
  prototypes: PrototypeView[];
  /** null: status startup tidak diketahui / tidak didukung. */
  startup: boolean | null;
  notifications: boolean;
  update: UpdateState;
  /** Tema aplikasi Windows; menu klik kanan mengikutinya (seperti prototype mengikuti prefers-color-scheme). */
  theme: 'light' | 'dark';
}

export const STATUS_LABEL: Record<RunStatus, string> = {
  stopped: 'Berhenti',
  starting: 'Memulai…',
  running: 'Berjalan',
  stopping: 'Menghentikan…',
  crashed: 'Berhenti tak terduga',
  failed: 'Gagal',
};

export const isLive = (p: PrototypeView) => p.status === 'running' || p.status === 'starting';

export function summary(s: TrayState): string {
  if (s.daemonBusy === 'starting') return 'Menyalakan daemon…';
  if (s.daemonBusy === 'stopping') return 'Menghentikan daemon…';
  if (!s.daemonUp) return 'Daemon dijeda';
  const running = s.prototypes.filter((p) => p.status === 'running').length;
  return `Daemon aktif · ${running} dari ${s.prototypes.length} prototype berjalan`;
}

export function iconState(s: TrayState): IconState {
  const running = s.prototypes.filter((p) => p.status === 'running').length;
  const updateReady = s.update.status === 'available' || s.update.status === 'ready';
  return {
    badge: s.daemonUp ? running : 0,
    dot: updateReady,
    paused: !s.daemonUp,
    tooltip: `Prototyper — ${s.daemonUp ? `${running} prototype berjalan` : 'daemon dijeda'}${updateReady ? ' · ada pembaruan' : ''}`,
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
    if (p.status === 'running') out.push({ title: p.name, text: `Berjalan di ${p.url?.replace(/^https?:\/\//, '') ?? `port ${p.port}`}` });
    else if (p.status === 'crashed' || p.status === 'failed') {
      out.push({ title: p.name, text: `${p.status === 'failed' ? 'Gagal dijalankan' : 'Berhenti tak terduga'}${p.error ? `: ${p.error}` : ''}`.slice(0, 200) });
    }
  }
  return out;
}
