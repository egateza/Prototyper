import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { AppError } from './errors.js';
import { readJsonFile, writeJsonAtomic } from './fsutil.js';

/**
 * Perangkat lain (mis. HP) yang dipasangkan agar bisa mengedit lewat Web UI pada mode LAN.
 *
 * Alur: di komputer ini Web UI meminta kode pairing (6 digit, sekali pakai, berlaku singkat);
 * HP membuka URL di QR (atau mengetik kodenya) lalu mendapat token acak yang disimpan di cookie.
 * Daemon hanya menyimpan hash token di `<home>/devices.json`.
 */
export interface Device {
  id: string;
  name: string;
  /** sha256(secret) dalam hex. */
  tokenHash: string;
  createdAt: string;
  lastSeenAt: string;
}

export type DeviceView = Omit<Device, 'tokenHash'>;

export interface Pairing {
  code: string;
  expiresAt: number;
}

interface DevicesFile {
  version: 1;
  devices: Device[];
}

export const DEVICE_COOKIE = 'prototyper_device';
/** Masa berlaku kode pairing. */
export const PAIRING_TTL_MS = 5 * 60_000;
/** Kode pairing dibatalkan setelah sekian tebakan salah (mencegah menebak 6 digit). */
export const PAIRING_MAX_ATTEMPTS = 5;
/** lastSeenAt hanya ditulis ulang ke disk paling sering sekali per menit. */
const SEEN_SAVE_MS = 60_000;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

function sameHex(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

/** Nama perangkat yang mudah dikenali dari User-Agent, mis. "Android · Chrome". */
export function deviceNameFromUserAgent(ua: string | undefined): string {
  const s = ua ?? '';
  const os = /iPhone/.test(s) ? 'iPhone'
    : /iPad/.test(s) ? 'iPad'
    : /Android/.test(s) ? 'Android'
    : /Windows/.test(s) ? 'Windows'
    : /Mac OS X|Macintosh/.test(s) ? 'Mac'
    : /Linux/.test(s) ? 'Linux'
    : '';
  const browser = /EdgA?\//.test(s) ? 'Edge'
    : /SamsungBrowser\//.test(s) ? 'Samsung Internet'
    : /Firefox\/|FxiOS\//.test(s) ? 'Firefox'
    : /Chrome\/|CriOS\//.test(s) ? 'Chrome'
    : /Safari\//.test(s) ? 'Safari'
    : '';
  return [os, browser].filter(Boolean).join(' · ') || 'Perangkat';
}

export class DeviceStore {
  readonly file: string;
  private devices: Device[] = [];
  private pairing: (Pairing & { attempts: number }) | null = null;
  private saving: Promise<void> = Promise.resolve();
  private lastSaved = 0;

  constructor(home: string, private readonly now: () => number = Date.now) {
    this.file = path.join(home, 'devices.json');
  }

  async load(): Promise<void> {
    const d = await readJsonFile<Partial<DevicesFile>>(this.file).catch(() => undefined);
    this.devices = Array.isArray(d?.devices)
      ? d.devices.filter((x): x is Device => !!x && typeof x.id === 'string' && typeof x.tokenHash === 'string')
      : [];
  }

  list(): DeviceView[] {
    return this.devices.map(({ tokenHash: _h, ...v }) => v);
  }

  /** Buat kode pairing baru (menggantikan kode yang masih aktif). */
  startPairing(): Pairing {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    this.pairing = { code, expiresAt: this.now() + PAIRING_TTL_MS, attempts: 0 };
    return { code, expiresAt: this.pairing.expiresAt };
  }

  /** Kode pairing yang masih berlaku, bila ada. */
  activePairing(): Pairing | null {
    if (this.pairing && this.pairing.expiresAt <= this.now()) this.pairing = null;
    return this.pairing ? { code: this.pairing.code, expiresAt: this.pairing.expiresAt } : null;
  }

  cancelPairing(): void {
    this.pairing = null;
  }

  /** Tukar kode pairing dengan token perangkat. Kode langsung hangus setelah dipakai. */
  async pair(code: string, userAgent?: string): Promise<{ device: DeviceView; token: string }> {
    const p = this.activePairing() ? this.pairing : null;
    if (!p) throw new AppError('FORBIDDEN', 'Tidak ada kode pairing aktif. Buat kode baru di komputer (Hubungkan HP).');
    if (code.trim() !== p.code) {
      p.attempts += 1;
      if (p.attempts >= PAIRING_MAX_ATTEMPTS) {
        this.pairing = null;
        throw new AppError('FORBIDDEN', 'Kode salah terlalu sering; kode dibatalkan. Buat kode baru di komputer.');
      }
      throw new AppError('FORBIDDEN', 'Kode pairing salah');
    }
    this.pairing = null;
    const id = randomBytes(6).toString('hex');
    const secret = randomBytes(32).toString('base64url');
    const at = new Date(this.now()).toISOString();
    const device: Device = { id, name: deviceNameFromUserAgent(userAgent), tokenHash: sha256(secret), createdAt: at, lastSeenAt: at };
    this.devices.push(device);
    await this.save();
    const { tokenHash: _h, ...view } = device;
    return { device: view, token: `${id}.${secret}` };
  }

  /** Perangkat pemilik token, atau null bila token tidak dikenal/sudah dicabut. */
  verify(token: string | undefined): DeviceView | null {
    if (!token) return null;
    const dot = token.indexOf('.');
    if (dot <= 0) return null;
    const id = token.slice(0, dot);
    const d = this.devices.find((x) => x.id === id);
    if (!d || !sameHex(d.tokenHash, sha256(token.slice(dot + 1)))) return null;
    const t = this.now();
    d.lastSeenAt = new Date(t).toISOString();
    if (t - this.lastSaved >= SEEN_SAVE_MS) void this.save();
    const { tokenHash: _h, ...view } = d;
    return view;
  }

  async revoke(id: string): Promise<void> {
    const before = this.devices.length;
    this.devices = this.devices.filter((d) => d.id !== id);
    if (this.devices.length === before) throw new AppError('NOT_FOUND', `Perangkat "${id}" tidak ditemukan`);
    await this.save();
  }

  async rename(id: string, name: string): Promise<DeviceView> {
    const d = this.devices.find((x) => x.id === id);
    if (!d) throw new AppError('NOT_FOUND', `Perangkat "${id}" tidak ditemukan`);
    const n = name.trim().slice(0, 60);
    if (!n) throw new AppError('BAD_REQUEST', 'Nama perangkat tidak boleh kosong');
    d.name = n;
    await this.save();
    const { tokenHash: _h, ...view } = d;
    return view;
  }

  flush(): Promise<void> {
    return this.saving;
  }

  private save(): Promise<void> {
    this.lastSaved = this.now();
    const data: DevicesFile = { version: 1, devices: this.devices };
    this.saving = this.saving.then(() => writeJsonAtomic(this.file, data)).catch(() => undefined);
    return this.saving;
  }
}

/** Ambil nilai satu cookie dari header Cookie. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/** Header Set-Cookie untuk token perangkat (HttpOnly, SameSite=Strict, 1 tahun). */
export function deviceCookie(token: string): string {
  return `${DEVICE_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${365 * 24 * 3600}`;
}
