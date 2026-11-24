import os from 'node:os';
import path from 'node:path';
import { defineMessages } from './i18n.js';

const t = defineMessages({
  id: {
    badPort: '{name} tidak valid: "{value}" (harus 1-65535)',
    badRange: 'PROTOTYPER_PORT_RANGE tidak valid: "{value}" (format: 4100-4199)',
    rangeReversed: 'PROTOTYPER_PORT_RANGE terbalik: "{value}"',
    badRepo: 'PROTOTYPER_UPDATE_REPO tidak valid: "{value}" (format: pemilik/nama)',
    portClash: 'Port daemon {port} bentrok dengan rentang port prototype {start}-{end}',
  },
  en: {
    badPort: '{name} is invalid: "{value}" (must be 1-65535)',
    badRange: 'PROTOTYPER_PORT_RANGE is invalid: "{value}" (format: 4100-4199)',
    rangeReversed: 'PROTOTYPER_PORT_RANGE is reversed: "{value}"',
    badRepo: 'PROTOTYPER_UPDATE_REPO is invalid: "{value}" (format: owner/name)',
    portClash: 'Daemon port {port} overlaps the prototype port range {start}-{end}',
  },
});

export interface PortRange {
  start: number;
  end: number;
}

/**
 * Mode LAN: `off` = semua hanya dari komputer ini; `prototypes` = hanya server prototype yang bisa dibuka
 * dari perangkat lain (Web UI tetap lokal); `all` = Web UI Prototyper juga.
 */
export type LanMode = 'off' | 'prototypes' | 'all';

export interface Config {
  /** Folder data Prototyper: registry.json, state.json, logs/. */
  home: string;
  /** Host yang dipakai daemon/UI (0.0.0.0 hanya pada mode LAN `all`). */
  host: string;
  /** Host server prototype & placeholder `{host}` (0.0.0.0 pada mode LAN apa pun). */
  prototypeHost: string;
  /** Port daemon (HTTP API + UI). */
  port: number;
  /** Rentang port untuk prototype. */
  portRange: PortRange;
  /** Mode LAN (--lan = `all`, --lan-prototypes = `prototypes`, atau PROTOTYPER_LAN). */
  lanMode: LanMode;
  /** Folder induk default untuk `prototyper new` (prototype). */
  workspace: string;
  /** Folder induk default untuk desain sistem baru (`new -t design-system`). */
  dsWorkspace: string;
  /** Perbarui petunjuk agent di semua prototype saat daemon menyala (PROTOTYPER_AUTO_SYNC=0 mematikan). */
  autoSyncAgents: boolean;
  /** Repo GitHub (`pemilik/nama`) sumber pembaruan untuk tray (PROTOTYPER_UPDATE_REPO). */
  updateRepo: string;
  /** Tray memeriksa pembaruan otomatis saat menyala dan tiap 24 jam (PROTOTYPER_UPDATE_CHECK=0 mematikan). */
  updateCheck: boolean;
  /**
   * Nama host tambahan yang boleh dipakai membuka Web UI/API selain IP, localhost, dan nama komputer
   * (PROTOTYPER_ALLOWED_HOSTS, dipisah koma; mis. nama MagicDNS Tailscale).
   */
  allowedHosts: string[];
}

export interface ConfigOverrides {
  home?: string;
  workspace?: string;
  dsWorkspace?: string;
  port?: number;
  lanMode?: LanMode;
}

/** PROTOTYPER_LAN: `1`/`all` = semua, `prototypes` = prototype saja, lainnya = mati. */
export function parseLanMode(value: string | undefined): LanMode {
  const v = (value ?? '').trim().toLowerCase();
  if (v === '1' || v === 'all' || v === 'true') return 'all';
  if (v === 'prototypes' || v === 'prototype') return 'prototypes';
  return 'off';
}

/** Argumen CLI yang menyalakan daemon dengan mode LAN ini. */
export function lanArgs(mode: LanMode): string[] {
  return mode === 'all' ? ['--lan'] : mode === 'prototypes' ? ['--lan-prototypes'] : [];
}

function parsePort(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new Error(t('badPort', { name, value }));
  }
  return n;
}

function parseRange(value: string | undefined): PortRange {
  if (value === undefined || value === '') return { start: 4100, end: 4199 };
  const m = /^(\d+)-(\d+)$/.exec(value.trim());
  if (!m) throw new Error(t('badRange', { value }));
  const start = parsePort(m[1], 0, 'PROTOTYPER_PORT_RANGE');
  const end = parsePort(m[2], 0, 'PROTOTYPER_PORT_RANGE');
  if (start > end) throw new Error(t('rangeReversed', { value }));
  return { start, end };
}

export const DEFAULT_UPDATE_REPO = 'egateza/Prototyper';

function parseRepo(value: string | undefined): string {
  if (value === undefined || value === '') return DEFAULT_UPDATE_REPO;
  const v = value.trim();
  if (!/^[\w.-]+\/[\w.-]+$/.test(v)) throw new Error(t('badRepo', { value }));
  return v;
}

/** Folder data Prototyper: override (--home) > PROTOTYPER_HOME > ~/.prototyper. */
export function resolveHome(override?: string, env: NodeJS.ProcessEnv = process.env): string {
  return path.resolve(override ?? env.PROTOTYPER_HOME ?? path.join(os.homedir(), '.prototyper'));
}

/**
 * Bangun konfigurasi dari env + override (flag CLI).
 * Prioritas: override > env > default.
 */
export function loadConfig(
  overrides: ConfigOverrides = {},
  env: NodeJS.ProcessEnv = process.env,
): Config {
  const lanMode = overrides.lanMode ?? parseLanMode(env.PROTOTYPER_LAN);
  const home = resolveHome(overrides.home, env);
  const port = overrides.port ?? parsePort(env.PROTOTYPER_PORT, 4000, 'PROTOTYPER_PORT');
  const portRange = parseRange(env.PROTOTYPER_PORT_RANGE);
  // Default mengikuti PROTOTYPER_HOME agar prototype baru ikut di drive yang sama (mis. D:).
  const workspace = path.resolve(overrides.workspace ?? (env.PROTOTYPER_WORKSPACE || path.join(home, 'prototypes')));
  // Desain sistem dipisah dari prototype agar mudah dibedakan di disk.
  const dsWorkspace = path.resolve(overrides.dsWorkspace ?? (env.PROTOTYPER_DS_WORKSPACE || path.join(home, 'design-systems')));

  if (port >= portRange.start && port <= portRange.end) {
    throw new Error(t('portClash', { port, start: portRange.start, end: portRange.end }));
  }

  return {
    home,
    host: lanMode === 'all' ? '0.0.0.0' : '127.0.0.1',
    prototypeHost: lanMode === 'off' ? '127.0.0.1' : '0.0.0.0',
    port,
    portRange,
    lanMode,
    workspace,
    dsWorkspace,
    autoSyncAgents: env.PROTOTYPER_AUTO_SYNC !== '0',
    updateRepo: parseRepo(env.PROTOTYPER_UPDATE_REPO),
    updateCheck: env.PROTOTYPER_UPDATE_CHECK !== '0',
    allowedHosts: (env.PROTOTYPER_ALLOWED_HOSTS ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean),
  };
}
