import { EventEmitter } from 'node:events';
import { createWriteStream, promises as fs, type WriteStream } from 'node:fs';
import path from 'node:path';

export type LogStream = 'stdout' | 'stderr' | 'system';

export interface LogLine {
  ts: string;
  stream: LogStream;
  line: string;
}

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07]*(\x07|\x1b\\)/g;
const LINE_RE = /^(\S+) \[(stdout|stderr|system)\] (.*)$/;

export interface LogStoreOptions {
  max?: number;
  rotateBytes?: number;
}

/** Ring buffer log per prototype + file log. Event 'line' untuk streaming. */
export class LogStore extends EventEmitter {
  private readonly lines: LogLine[] = [];
  private readonly partial: Record<'stdout' | 'stderr', string> = { stdout: '', stderr: '' };
  private closed = false;

  private constructor(
    readonly file: string,
    private readonly out: WriteStream,
    private readonly max: number,
  ) {
    super();
    this.setMaxListeners(0);
  }

  static async open(file: string, { max = 1000, rotateBytes = 5 * 1024 * 1024 }: LogStoreOptions = {}): Promise<LogStore> {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const st = await fs.stat(file).catch(() => null);
    if (st && st.size > rotateBytes) await fs.rename(file, `${file}.1`).catch(() => undefined);
    const out = createWriteStream(file, { flags: 'a' });
    out.on('error', () => undefined);
    return new LogStore(file, out, max);
  }

  write(stream: 'stdout' | 'stderr', chunk: string): void {
    const parts = (this.partial[stream] + chunk).split(/\r?\n/);
    this.partial[stream] = parts.pop() ?? '';
    for (const p of parts) this.push(stream, p);
  }

  flush(): void {
    for (const s of ['stdout', 'stderr'] as const) {
      if (this.partial[s]) {
        this.push(s, this.partial[s]);
        this.partial[s] = '';
      }
    }
  }

  system(msg: string): void {
    this.push('system', `[prototyper] ${msg}`);
  }

  tail(n = 200): LogLine[] {
    return n <= 0 ? [] : this.lines.slice(-n);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.out.end();
  }

  private push(stream: LogStream, raw: string): void {
    // Progress bar memakai \r: ambil segmen terakhir saja.
    const line = (raw.split('\r').pop() ?? '').replace(ANSI, '');
    const entry: LogLine = { ts: new Date().toISOString(), stream, line };
    this.lines.push(entry);
    if (this.lines.length > this.max) this.lines.shift();
    if (!this.closed) this.out.write(`${entry.ts} [${stream}] ${line}\n`);
    this.emit('line', entry);
  }
}

/** Baca N baris terakhir dari file log (dipakai CLI saat daemon tidak berjalan). */
export async function readLogFileTail(file: string, n: number): Promise<LogLine[]> {
  const raw = await fs.readFile(file, 'utf8').catch(() => '');
  const lines = raw.split('\n').filter(Boolean).slice(-Math.max(0, n));
  return lines.map((l) => {
    const m = LINE_RE.exec(l);
    return m ? { ts: m[1] ?? '', stream: m[2] as LogStream, line: m[3] ?? '' } : { ts: '', stream: 'stdout', line: l };
  });
}
