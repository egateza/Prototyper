import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import QRCode from 'qrcode';
import type { LanMode } from '../../core/config.js';
import { deviceCookie, type DeviceStore, type DeviceView } from '../../core/devices.js';
import { AppError } from '../../core/errors.js';
import { defineMessages } from '../../core/i18n.js';

const t = defineMessages({
  id: {
    localOnly: 'Kelola perangkat hanya dari komputer tempat Prototyper berjalan',
    lanOff: 'Web UI belum terbuka ke jaringan. Nyalakan mode LAN (tray: Mode LAN → Web UI + prototype, atau prototyper serve --lan) lalu coba lagi.',
    noLan: 'Komputer ini tidak terhubung ke jaringan (tidak ada alamat LAN).',
    nameBody: 'Body harus berisi { "name": string }',
    localNoPair: 'Komputer ini tidak perlu dipasangkan',
    codeBody: 'Body harus berisi { "code": string }',
    pairFailed: 'Pairing gagal',
  },
  en: {
    localOnly: 'Devices can only be managed on the computer where Prototyper is running',
    lanOff: 'The Web UI is not open to the network yet. Turn on LAN mode (tray: LAN mode → Web UI + prototypes, or prototyper serve --lan) and try again.',
    noLan: 'This computer is not connected to a network (no LAN address).',
    nameBody: 'Body must contain { "name": string }',
    localNoPair: 'This computer does not need to be paired',
    codeBody: 'Body must contain { "code": string }',
    pairFailed: 'Pairing failed',
  },
});

export interface PairingTarget {
  url: string;
  /** QR (SVG) berisi `url`. */
  qr: string;
}

export interface PairingResponse {
  code: string;
  expiresAt: number;
  /** URL pairing per alamat LAN, urut dari yang paling mungkin dipakai. */
  targets: PairingTarget[];
}

export interface DevicesResponse {
  devices: DeviceView[];
  pairing: { expiresAt: number } | null;
}

export interface DevicesRouteOptions {
  devices: DeviceStore;
  lanMode: LanMode;
  port: number;
  /** Alamat yang dipakai di URL pairing (IP LAN + PROTOTYPER_ALLOWED_HOSTS). */
  addresses: () => string[];
}

function requireLocal(req: FastifyRequest): void {
  if (req.access !== 'local') throw new AppError('FORBIDDEN', t('localOnly'));
}


/**
 * Pairing perangkat lain (HP) untuk mode LAN.
 * - `POST   /api/devices/pairing` (lokal) — buat kode + URL/QR pairing
 * - `DELETE /api/devices/pairing` (lokal) — batalkan kode
 * - `GET    /api/devices` (lokal)         — daftar perangkat terpasang
 * - `PATCH  /api/devices/:id` (lokal)     — ganti nama
 * - `DELETE /api/devices/:id` (lokal)     — cabut akses
 * - `POST   /api/devices/pair` (publik)   — tukar kode dengan cookie token
 * - `GET    /pair?code=…` (publik)        — sama, untuk URL di QR; lalu dialihkan ke Web UI
 */
export const devicesRoutes: FastifyPluginAsync<DevicesRouteOptions> = async (app, opts) => {
  const { devices } = opts;

  app.post('/api/devices/pairing', async (req): Promise<PairingResponse> => {
    requireLocal(req);
    if (opts.lanMode !== 'all') throw new AppError('CONFLICT', t('lanOff'));
    const addrs = opts.addresses();
    if (!addrs.length) throw new AppError('CONFLICT', t('noLan'));
    const p = devices.startPairing();
    const targets = await Promise.all(
      addrs.slice(0, 4).map(async (a) => {
        const url = `http://${a.includes(':') ? `[${a}]` : a}:${opts.port}/pair?code=${p.code}`;
        return { url, qr: await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }) };
      }),
    );
    return { ...p, targets };
  });

  app.delete('/api/devices/pairing', async (req) => {
    requireLocal(req);
    devices.cancelPairing();
    return { ok: true };
  });

  app.get('/api/devices', async (req): Promise<DevicesResponse> => {
    requireLocal(req);
    const p = devices.activePairing();
    return { devices: devices.list(), pairing: p ? { expiresAt: p.expiresAt } : null };
  });

  app.patch<{ Params: { id: string }; Body: { name?: unknown } | null }>('/api/devices/:id', async (req) => {
    requireLocal(req);
    const name = req.body?.name;
    if (typeof name !== 'string') throw new AppError('BAD_REQUEST', t('nameBody'));
    return devices.rename(req.params.id, name);
  });

  app.delete<{ Params: { id: string } }>('/api/devices/:id', async (req) => {
    requireLocal(req);
    await devices.revoke(req.params.id);
    return { ok: true };
  });

  app.post<{ Body: { code?: unknown } | null }>('/api/devices/pair', async (req, reply) => {
    if (req.access === 'local') throw new AppError('BAD_REQUEST', t('localNoPair'));
    const code = req.body?.code;
    if (typeof code !== 'string' || !code.trim()) throw new AppError('BAD_REQUEST', t('codeBody'));
    const { device, token } = await devices.pair(code, req.headers['user-agent']);
    reply.header('set-cookie', deviceCookie(token));
    return { device };
  });

  app.get<{ Querystring: { code?: string } }>('/pair', async (req, reply) => {
    if (req.access !== 'none') return reply.redirect('/');
    try {
      const { token } = await devices.pair(String(req.query.code ?? ''), req.headers['user-agent']);
      reply.header('set-cookie', deviceCookie(token));
      return reply.redirect('/');
    } catch (err) {
      const msg = err instanceof AppError ? err.message : t('pairFailed');
      return reply.redirect(`/?pair-error=${encodeURIComponent(msg)}`);
    }
  });
};
