import { spawn } from 'node:child_process';
import { mkdirSync, openSync } from 'node:fs';
import path from 'node:path';
import { APP_MODE } from '../core/appfiles.js';
import { lanArgs, type Config } from '../core/config.js';
import { AppError, errorMessage, type ErrorBody, type ErrorCode } from '../core/errors.js';
import { samePath } from '../core/fsutil.js';
import type { LogLine } from '../core/logs.js';
import type { HealthResponse } from '../server/routes/health.js';

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Klien HTTP ke daemon Prototyper; bisa menyalakan daemon otomatis. */
export class DaemonClient {
  readonly base: string;

  constructor(private readonly config: Config) {
    this.base = `http://127.0.0.1:${config.port}`;
  }

  async health(): Promise<HealthResponse | null> {
    try {
      const r = await fetch(`${this.base}/api/health`, { signal: AbortSignal.timeout(1500) });
      if (!r.ok) return null;
      const h = (await r.json()) as HealthResponse;
      return h.status === 'ok' ? h : null;
    } catch {
      return null;
    }
  }

  /** Pastikan daemon berjalan; nyalakan di background bila belum. */
  async ensure(): Promise<HealthResponse> {
    const h = await this.health();
    if (h) {
      this.warnHomeMismatch(h);
      return h;
    }
    const logFile = this.spawnDaemon();
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      await delay(300);
      const h2 = await this.health();
      if (h2) return h2;
    }
    throw new AppError('DAEMON_UNAVAILABLE', `Daemon gagal dinyalakan dalam 15 detik. Cek log: ${logFile}`);
  }

  private warnHomeMismatch(h: HealthResponse): void {
    if (h.home && !samePath(h.home, this.config.home)) {
      process.stderr.write(
        `Peringatan: daemon di port ${this.config.port} memakai data ${h.home}, bukan ${this.config.home}\n`,
      );
    }
  }

  /** Log daemon yang dinyalakan di background. */
  get logFile(): string {
    return path.join(this.config.home, 'daemon.log');
  }

  private spawnDaemon(): string {
    mkdirSync(this.config.home, { recursive: true });
    const logFile = this.logFile;
    const out = openSync(logFile, 'a');
    const entry = process.argv[1];
    if (APP_MODE !== 'sea' && !entry) throw new AppError('INTERNAL', 'Tidak bisa menentukan lokasi CLI untuk menyalakan daemon');
    const args = [
      // biner tunggal: execPath sudah = CLI; selain itu ikut membawa loader tsx saat dijalankan dari source
      ...(APP_MODE === 'sea' ? [] : [...process.execArgv, entry as string]),
      'serve',
      '--port',
      String(this.config.port),
      '--home',
      this.config.home,
      ...lanArgs(this.config.lanMode),
    ];
    const child = spawn(process.execPath, args, {
      detached: true,
      stdio: ['ignore', out, out],
      windowsHide: true,
      env: process.env,
    });
    child.unref();
    process.stderr.write(`Daemon dinyalakan di background (log: ${logFile})\n`);
    return logFile;
  }

  async request<T>(method: string, urlPath: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(this.base + urlPath, {
        method,
        ...(body !== undefined ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
      });
    } catch (err) {
      throw new AppError('DAEMON_UNAVAILABLE', `Tidak bisa menghubungi daemon di ${this.base}: ${errorMessage(err)}`);
    }
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      /* bukan JSON */
    }
    if (!res.ok) {
      const e = (data as ErrorBody | null)?.error;
      throw new AppError((e?.code ?? 'INTERNAL') as ErrorCode, e?.message ?? `HTTP ${res.status}`, e?.details);
    }
    return data as T;
  }

  /** Ikuti log via SSE; resolve saat koneksi ditutup. */
  async followLogs(id: string, tail: number, onLine: (l: LogLine) => void): Promise<void> {
    let res: Response;
    try {
      res = await fetch(`${this.base}/api/prototypes/${encodeURIComponent(id)}/logs/stream?tail=${tail}`);
    } catch (err) {
      throw new AppError('DAEMON_UNAVAILABLE', `Tidak bisa menghubungi daemon: ${errorMessage(err)}`);
    }
    if (!res.ok || !res.body) {
      const e = ((await res.json().catch(() => null)) as ErrorBody | null)?.error;
      throw new AppError((e?.code ?? 'INTERNAL') as ErrorCode, e?.message ?? `HTTP ${res.status}`);
    }
    const decoder = new TextDecoder();
    let buf = '';
    for await (const chunk of res.body) {
      buf += decoder.decode(chunk as Uint8Array, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const event = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        for (const line of event.split('\n')) {
          if (line.startsWith('data: ')) onLine(JSON.parse(line.slice(6)) as LogLine);
        }
      }
    }
  }
}
