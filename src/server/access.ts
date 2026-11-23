import os from 'node:os';
import { isIP } from 'node:net';
import type { FastifyRequest } from 'fastify';
import { DEVICE_COOKIE, readCookie, type DeviceStore, type DeviceView } from '../core/devices.js';
import { AppError } from '../core/errors.js';

/**
 * Siapa yang mengirim request:
 * - `local`  : komputer ini (loopback) — semua operasi.
 * - `device` : perangkat yang sudah dipasangkan (mode LAN) — baca semua, ubah terbatas (DEVICE_WRITES).
 * - `none`   : perangkat lain — hanya Web UI statis, /api/health, dan pairing.
 */
export type Access = 'local' | 'device' | 'none';

declare module 'fastify' {
  interface FastifyRequest {
    access: Access;
    device: DeviceView | null;
  }
}

export function isLoopback(ip: string): boolean {
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

/**
 * Operasi non-GET yang boleh dari perangkat terpasang: alur komentar → agent → periksa hasil.
 * Selain ini (hapus/daftarkan prototype, manifest, install, desain sistem, update, shutdown,
 * dialog pilih file, kelola perangkat) tetap hanya dari komputer ini.
 */
export const DEVICE_WRITES: ReadonlySet<string> = new Set([
  'POST /api/prototypes/:id/comments',
  'POST /api/prototypes/:id/comments/:cid/replies',
  'POST /api/prototypes/:id/comments/:cid/resolve',
  'POST /api/prototypes/:id/comments/:cid/reopen',
  'PATCH /api/prototypes/:id/comments/:cid',
  'DELETE /api/prototypes/:id/comments/:cid',
  'PATCH /api/prototypes/:id/comments/:cid/replies/:rid',
  'DELETE /api/prototypes/:id/comments/:cid/replies/:rid',
  'POST /api/prototypes/:id/attachments',
  'POST /api/prototypes/:id/agent/run',
  'POST /api/prototypes/:id/agent/stop',
  'POST /api/prototypes/:id/agent/undo',
  'POST /api/prototypes/:id/start',
  'POST /api/prototypes/:id/stop',
  'POST /api/prototypes/:id/restart',
  'POST /api/prototypes/:id/reload',
  'PUT /api/prototypes/:id/lan',
]);

/** Route /api yang terbuka tanpa pairing (dibutuhkan halaman pairing). */
const PUBLIC_API: ReadonlySet<string> = new Set(['GET /api/health', 'HEAD /api/health', 'POST /api/devices/pair']);

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Nama host dari header Host (tanpa port, huruf kecil). */
export function hostName(host: string | undefined): string {
  const h = (host ?? '').trim().toLowerCase();
  if (h.startsWith('[')) return h.slice(0, h.indexOf(']') + 1);
  const i = h.lastIndexOf(':');
  return i >= 0 && h.indexOf(':') === i ? h.slice(0, i) : h;
}

/**
 * Host yang boleh dipakai mengakses API. Menolak nama domain lain mencegah DNS rebinding
 * (situs jahat yang nama domainnya diarahkan ke 127.0.0.1 lalu memanggil API dari browser).
 */
export function hostAllowed(host: string | undefined, extra: readonly string[] = []): boolean {
  const name = hostName(host);
  if (!name) return false;
  const bare = name.startsWith('[') ? name.slice(1, -1) : name;
  if (isIP(bare)) return true;
  if (name === 'localhost' || name.endsWith('.localhost')) return true;
  const me = os.hostname().toLowerCase();
  if (name === me || name === `${me}.local`) return true;
  return extra.some((x) => x.toLowerCase() === name);
}

/** Origin (bila dikirim browser) harus sama dengan host yang diakses: menolak CSRF dari situs/port lain. */
function originMatches(origin: string, host: string | undefined): boolean {
  try {
    return new URL(origin).host === (host ?? '').toLowerCase();
  } catch {
    return false;
  }
}

/** Hook onRequest: tetapkan req.access dan tolak request yang tidak berhak. */
export function accessHook(devices: DeviceStore, allowedHosts: readonly string[]) {
  return async (req: FastifyRequest) => {
    const url = req.url.split('?')[0] ?? '';
    const isApi = url === '/api' || url.startsWith('/api/');
    const route = `${req.method} ${req.routeOptions.url ?? url}`;
    const local = isLoopback(req.ip);
    req.device = local ? null : devices.verify(readCookie(req.headers.cookie, DEVICE_COOKIE));
    req.access = local ? 'local' : req.device ? 'device' : 'none';

    if (!isApi && url !== '/pair') return; // Web UI statis

    if (!hostAllowed(req.headers.host, allowedHosts)) {
      throw new AppError('FORBIDDEN', `Host "${hostName(req.headers.host)}" tidak dikenal. Tambahkan ke PROTOTYPER_ALLOWED_HOSTS bila memang dipakai.`);
    }
    const origin = req.headers.origin;
    if (!SAFE.has(req.method)) {
      if (origin !== undefined && !originMatches(origin, req.headers.host)) {
        throw new AppError('FORBIDDEN', 'Request dari halaman lain ditolak');
      }
      // Dari perangkat lain browser selalu mengirim Origin pada request non-GET.
      if (!local && origin === undefined) throw new AppError('FORBIDDEN', 'Request tanpa header Origin ditolak');
    }

    if (req.access === 'local' || PUBLIC_API.has(route) || url === '/pair') return;
    if (req.access === 'none') {
      throw new AppError('UNAUTHORIZED', 'Perangkat ini belum dipasangkan. Buka "Hubungkan HP" di Prototyper pada komputer, lalu pindai QR atau masukkan kodenya.');
    }
    if (!SAFE.has(req.method) && !DEVICE_WRITES.has(route)) {
      throw new AppError('FORBIDDEN', 'Operasi ini hanya bisa dilakukan dari komputer tempat Prototyper berjalan');
    }
  };
}
