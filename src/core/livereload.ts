import { watch, type FSWatcher } from 'node:fs';
import type { ServerResponse } from 'node:http';
import { errorMessage } from './errors.js';

/**
 * Live-reload untuk prototype static. Halaman (lewat embed.js) membuka EventSource ke
 * LIVERELOAD_PATH; saat file di folder root berubah, server mengirim event dan halaman dimuat
 * ulang (atau hanya stylesheet-nya diganti bila yang berubah cuma file .css).
 *
 * Folder hanya diawasi selama ada halaman yang terhubung, agar prototype yang tidak dibuka tidak
 * memegang handle folder (di Windows handle watcher bisa menghalangi folder dihapus/diganti nama).
 */
export const LIVERELOAD_PATH = '/__prototyper/livereload';

/** Segmen path yang tidak memicu muat ulang. */
const IGNORED_SEGMENTS = new Set(['.prototyper', '.git', 'node_modules', '.svn', '.hg']);

/** File yang diabaikan: data Prototyper, VCS, dependensi, dan file sementara editor. */
export function isIgnoredChange(rel: string): boolean {
  const segs = rel.split(/[\\/]/).filter(Boolean);
  if (segs.some((s) => IGNORED_SEGMENTS.has(s.toLowerCase()))) return true;
  const base = segs.at(-1) ?? '';
  return base.endsWith('~') || /\.(swp|swx|tmp|crdownload)$/i.test(base) || base.startsWith('.#') || /^#.*#$/.test(base);
}

export type ReloadKind = 'reload' | 'css';

/** Jenis muat ulang: 'css' bila semua yang berubah adalah stylesheet, selain itu halaman penuh. */
export function reloadKind(files: readonly (string | null)[]): ReloadKind {
  return files.length > 0 && files.every((f) => f !== null && /\.css$/i.test(f)) ? 'css' : 'reload';
}

export interface LiveReloadOptions {
  /** Jeda pengumpulan perubahan sebelum event dikirim (ms). */
  debounceMs?: number;
  /** Interval komentar SSE agar koneksi tidak dianggap mati oleh proxy/browser (ms). */
  heartbeatMs?: number;
  /** Dipanggil tiap kali event dikirim ke minimal satu halaman. */
  onBroadcast?: (kind: ReloadKind, files: string[]) => void;
  /** Dipanggil bila watcher gagal (folder dihapus, batas handle, dsb.). */
  onError?: (message: string) => void;
}

export class LiveReload {
  private readonly clients = new Set<ServerResponse>();
  private watcher: FSWatcher | null = null;
  private timer: NodeJS.Timeout | null = null;
  private heartbeat: NodeJS.Timeout | null = null;
  private pending: (string | null)[] = [];
  private closed = false;

  constructor(
    private readonly root: string,
    private readonly opts: LiveReloadOptions = {},
  ) {}

  get clientCount(): number {
    return this.clients.size;
  }

  get watching(): boolean {
    return this.watcher !== null;
  }

  /** Jadikan respons ini aliran SSE. Respons mentah sudah di-hijack oleh pemanggil. */
  attach(res: ServerResponse): void {
    if (this.closed) {
      res.writeHead(503).end();
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 1000\n\n');
    this.clients.add(res);
    res.on('close', () => {
      this.clients.delete(res);
      if (this.clients.size === 0) this.stopWatching();
    });
    this.startWatching();
  }

  close(): void {
    this.closed = true;
    this.stopWatching();
    for (const res of this.clients) res.end();
    this.clients.clear();
  }

  /** Catat perubahan (dipanggil watcher; publik agar bisa diuji tanpa sistem file). */
  notify(file: string | null): void {
    if (file !== null && isIgnoredChange(file)) return;
    this.pending.push(file === null ? null : file.replaceAll('\\', '/'));
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.opts.debounceMs ?? 120);
  }

  private flush(): void {
    this.timer = null;
    const changed = this.pending;
    this.pending = [];
    if (this.clients.size === 0 || changed.length === 0) return;
    const kind = reloadKind(changed);
    const files = [...new Set(changed.filter((f): f is string => f !== null))];
    const msg = `event: ${kind}\ndata: ${JSON.stringify({ files })}\n\n`;
    for (const res of this.clients) res.write(msg);
    this.opts.onBroadcast?.(kind, files);
  }

  private startWatching(): void {
    if (this.watcher || this.closed) return;
    try {
      const w = watch(this.root, { recursive: true }, (_event, filename) => this.notify(filename ? String(filename) : null));
      w.on('error', (err) => {
        this.opts.onError?.(errorMessage(err));
        this.stopWatching();
      });
      this.watcher = w;
    } catch (err) {
      this.opts.onError?.(errorMessage(err));
      return;
    }
    this.heartbeat = setInterval(() => {
      for (const res of this.clients) res.write(': ping\n\n');
    }, this.opts.heartbeatMs ?? 25_000);
    this.heartbeat.unref();
  }

  private stopWatching(): void {
    this.watcher?.close();
    this.watcher = null;
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending = [];
  }
}
