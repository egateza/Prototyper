import net from 'node:net';
import type { PortRange } from './config.js';
import { AppError } from './errors.js';

function canListen(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.unref();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen({ port, host, exclusive: true });
  });
}

/** Port bebas bila bisa di-bind di semua host yang diberikan. */
export async function isPortFree(port: number, hosts: string[]): Promise<boolean> {
  for (const h of hosts) if (!(await canListen(port, h))) return false;
  return true;
}

/** Host yang dicek saat alokasi. Dicek 127.0.0.1 dan 0.0.0.0 karena Windows mengizinkan bind ganda. */
export function probeHosts(host: string): string[] {
  return [...new Set(['127.0.0.1', '0.0.0.0', host])];
}

export interface AllocateOptions {
  range: PortRange;
  preferred?: number | undefined;
  exclude?: ReadonlySet<number>;
  hosts: string[];
}

export async function allocatePort({ range, preferred, exclude = new Set(), hosts }: AllocateOptions): Promise<number> {
  const inRange = (p: number) => p >= range.start && p <= range.end;
  const candidates: number[] = [];
  if (preferred !== undefined && inRange(preferred)) candidates.push(preferred);
  for (let p = range.start; p <= range.end; p++) if (p !== preferred) candidates.push(p);
  for (const p of candidates) {
    if (exclude.has(p)) continue;
    if (await isPortFree(p, hosts)) return p;
  }
  throw new AppError('CONFLICT', `Tidak ada port bebas di rentang ${range.start}-${range.end}`);
}

function connect(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect({ port, host });
    const done = (ok: boolean) => {
      s.destroy();
      resolve(ok);
    };
    s.once('connect', () => done(true));
    s.once('error', () => done(false));
    s.setTimeout(500, () => done(false));
  });
}

/** true bila ada yang menerima koneksi di port ini (IPv4 atau IPv6 loopback). */
export async function probePort(port: number): Promise<boolean> {
  return (await connect(port, '127.0.0.1')) || (await connect(port, '::1'));
}
