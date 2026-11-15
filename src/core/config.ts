import os from 'node:os';
import path from 'node:path';

export interface PortRange {
  start: number;
  end: number;
}

export interface Config {
  /** Folder data Prototyper: registry.json, state.json, logs/. */
  home: string;
  /** Host yang dipakai daemon/UI dan server prototype. */
  host: string;
  /** Port daemon (HTTP API + UI). */
  port: number;
  /** Rentang port untuk prototype. */
  portRange: PortRange;
  /** true bila dijalankan dengan --lan. */
  lan: boolean;
  /** Folder induk default untuk `prototyper new`. */
  workspace: string;
  /** Perbarui petunjuk agent di semua prototype saat daemon menyala (PROTOTYPER_AUTO_SYNC=0 mematikan). */
  autoSyncAgents: boolean;
  /** Repo GitHub (`pemilik/nama`) sumber pembaruan untuk tray (PROTOTYPER_UPDATE_REPO). */
  updateRepo: string;
  /** Tray memeriksa pembaruan otomatis saat menyala dan tiap 24 jam (PROTOTYPER_UPDATE_CHECK=0 mematikan). */
  updateCheck: boolean;
}

export interface ConfigOverrides {
  home?: string;
  workspace?: string;
  port?: number;
  lan?: boolean;
}

function parsePort(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new Error(`${name} tidak valid: "${value}" (harus 1-65535)`);
  }
  return n;
}

function parseRange(value: string | undefined): PortRange {
  if (value === undefined || value === '') return { start: 4100, end: 4199 };
  const m = /^(\d+)-(\d+)$/.exec(value.trim());
  if (!m) throw new Error(`PROTOTYPER_PORT_RANGE tidak valid: "${value}" (format: 4100-4199)`);
  const start = parsePort(m[1], 0, 'PROTOTYPER_PORT_RANGE');
  const end = parsePort(m[2], 0, 'PROTOTYPER_PORT_RANGE');
  if (start > end) throw new Error(`PROTOTYPER_PORT_RANGE terbalik: "${value}"`);
  return { start, end };
}

export const DEFAULT_UPDATE_REPO = 'egateza/Prototyper';

function parseRepo(value: string | undefined): string {
  if (value === undefined || value === '') return DEFAULT_UPDATE_REPO;
  const v = value.trim();
  if (!/^[\w.-]+\/[\w.-]+$/.test(v)) throw new Error(`PROTOTYPER_UPDATE_REPO tidak valid: "${value}" (format: pemilik/nama)`);
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
  const lan = overrides.lan ?? env.PROTOTYPER_LAN === '1';
  const home = resolveHome(overrides.home, env);
  const port = overrides.port ?? parsePort(env.PROTOTYPER_PORT, 4000, 'PROTOTYPER_PORT');
  const portRange = parseRange(env.PROTOTYPER_PORT_RANGE);
  // Default mengikuti PROTOTYPER_HOME agar prototype baru ikut di drive yang sama (mis. D:).
  const workspace = path.resolve(overrides.workspace ?? (env.PROTOTYPER_WORKSPACE || path.join(home, 'prototypes')));

  if (port >= portRange.start && port <= portRange.end) {
    throw new Error(`Port daemon ${port} bentrok dengan rentang port prototype ${portRange.start}-${portRange.end}`);
  }

  return {
    home,
    host: lan ? '0.0.0.0' : '127.0.0.1',
    port,
    portRange,
    lan,
    workspace,
    autoSyncAgents: env.PROTOTYPER_AUTO_SYNC !== '0',
    updateRepo: parseRepo(env.PROTOTYPER_UPDATE_REPO),
    updateCheck: env.PROTOTYPER_UPDATE_CHECK !== '0',
  };
}
