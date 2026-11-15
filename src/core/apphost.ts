import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compareVersions } from './semver.js';

/**
 * Pemisahan runtime dan aplikasi pada biner tunggal (SEA).
 *
 * Exe = runtime: Node + bootstrap kecil (`src/boot/sea.ts`) + salinan aplikasi bawaan sebagai aset.
 * Aplikasi = `prototyper.cjs` + web/ + schemas/ + assets/ + package.json + app.json, disimpan di
 * `<PROTOTYPER_HOME>/app/<id>/`. Pembaruan aplikasi cukup menambah folder baru dan mengganti
 * `app/current.json`; exe hanya perlu diganti bila RUNTIME naik.
 *
 * Modul ini dipakai bootstrap dan aplikasi, jadi harus murni: tanpa import.meta dan tanpa efek samping.
 */

/**
 * Nomor versi "mesin" (runtime). Naikkan bila aplikasi butuh exe baru: versi mayor Node berganti,
 * bootstrap atau kontrak HostInfo berubah, atau aplikasi memakai API Node yang belum ada di exe lama.
 * Paket aplikasi hanya dipasang pada exe dengan nomor yang sama.
 */
export const RUNTIME = 1;

/** Nama file bundle di folder aplikasi. */
export const BUNDLE_FILE = 'prototyper.cjs';
/** Aset SEA berisi daftar file aplikasi yang tertanam (lihat scripts/release.ts). */
export const SEA_MANIFEST_ASSET = 'sea-manifest.json';
/** Identitas aplikasi di dalam foldernya. */
export const APP_INFO_FILE = 'app.json';
/** Penunjuk aplikasi aktif hasil pembaruan, di folder app store. */
export const CURRENT_FILE = 'current.json';
/** Penanda: aplikasi ini gagal dimuat, jangan dipakai lagi. */
export const BROKEN_MARK = '.broken';
/** Nama global tempat bootstrap menitipkan HostInfo untuk aplikasi. */
export const HOST_GLOBAL = '__PROTOTYPER_HOST__';

export interface AppInfo {
  /** `<versi>-<hash>`: nama folder unik per build. */
  id: string;
  version: string;
  /** RUNTIME yang dibutuhkan aplikasi ini. */
  runtime: number;
}

export interface SeaManifest extends AppInfo {
  /** Path relatif (pemisah `/`), sekaligus nama aset. */
  files: string[];
}

export interface CurrentPointer extends AppInfo {
  /** Aplikasi yang aktif sebelum pembaruan (untuk dipertahankan saat pembersihan). */
  previous: AppInfo | null;
}

/** Informasi dari bootstrap exe untuk aplikasi yang dimuatnya. */
export interface HostInfo {
  /** RUNTIME milik exe. */
  runtime: number;
  /** Folder aplikasi yang sedang berjalan. */
  appDir: string;
  /** Aplikasi yang sedang berjalan. */
  app: AppInfo;
  /** Aplikasi bawaan exe. */
  embedded: AppInfo;
  /** Folder app store (`<PROTOTYPER_HOME>/app`). */
  root: string;
}

/** Folder app store. Mengikuti PROTOTYPER_HOME (flag --home sengaja tidak dipakai: satu exe = satu app store). */
export function appStoreDir(env: NodeJS.ProcessEnv = process.env, home: string = os.homedir()): string {
  const base = env.PROTOTYPER_HOME ? path.resolve(env.PROTOTYPER_HOME) : path.join(home, '.prototyper');
  return path.join(base, 'app');
}

/** Folder ekstraksi satu aplikasi. */
export function seaExtractDir(id: string, env: NodeJS.ProcessEnv = process.env, home: string = os.homedir()): string {
  return path.join(appStoreDir(env, home), id);
}

/** Tulis aset yang belum ada; aman bila beberapa proses (CLI + daemon) mengekstrak bersamaan. */
export function extractFiles(dir: string, files: string[], read: (name: string) => ArrayBuffer): void {
  for (const f of files) {
    const target = path.join(dir, ...f.split('/'));
    if (existsSync(target)) continue;
    mkdirSync(path.dirname(target), { recursive: true });
    const tmp = `${target}.${process.pid}.tmp`;
    writeFileSync(tmp, new Uint8Array(read(f)));
    try {
      renameSync(tmp, target);
    } catch (err) {
      rmSync(tmp, { force: true });
      if (!existsSync(target)) throw err;
    }
  }
}

/** Id aman dipakai sebagai nama folder (tanpa pemisah path / `..`). */
export function isSafeId(id: unknown): id is string {
  return typeof id === 'string' && /^[0-9A-Za-z][0-9A-Za-z.+_-]*$/.test(id) && !id.includes('..');
}

export function parseAppInfo(data: unknown): AppInfo | null {
  const d = data as Partial<AppInfo> | null;
  if (!d || !isSafeId(d.id) || typeof d.version !== 'string' || !Number.isInteger(d.runtime)) return null;
  return { id: d.id, version: d.version, runtime: d.runtime as number };
}

export function readCurrent(root: string): CurrentPointer | null {
  try {
    const data = JSON.parse(readFileSync(path.join(root, CURRENT_FILE), 'utf8')) as Partial<CurrentPointer>;
    const info = parseAppInfo(data);
    return info ? { ...info, previous: parseAppInfo(data.previous) } : null;
  } catch {
    return null;
  }
}

/** Tulis `current.json` secara atomik (tulis ke file sementara lalu rename). */
export function writeCurrent(root: string, pointer: CurrentPointer): void {
  mkdirSync(root, { recursive: true });
  const file = path.join(root, CURRENT_FILE);
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(pointer, null, 2)}\n`);
  renameSync(tmp, file);
}

/** Aplikasi di app store bisa dipakai oleh exe dengan `runtime` ini. */
export function isUsableApp(root: string, info: AppInfo, runtime: number): boolean {
  if (info.runtime !== runtime || !isSafeId(info.id)) return false;
  const dir = path.join(root, info.id);
  return existsSync(path.join(dir, BUNDLE_FILE)) && existsSync(path.join(dir, 'package.json')) && !existsSync(path.join(dir, BROKEN_MARK));
}

/**
 * Pilih aplikasi yang dijalankan: hasil pembaruan (`current.json`) bila cocok dengan runtime dan
 * lebih baru dari aplikasi bawaan exe; selain itu aplikasi bawaan. Setelah exe diganti dengan versi
 * yang lebih baru, aplikasi bawaannya otomatis menang.
 */
export function chooseApp(root: string, embedded: AppInfo, runtime: number): AppInfo {
  const current = readCurrent(root);
  if (current && isUsableApp(root, current, runtime) && compareVersions(current.version, embedded.version) > 0) {
    return { id: current.id, version: current.version, runtime: current.runtime };
  }
  return embedded;
}

export interface BootOptions {
  manifest: SeaManifest;
  /** Baca aset tertanam. */
  read: (name: string) => ArrayBuffer;
  root: string;
  runtime?: number;
  /** Muat bundle aplikasi (createRequire di exe asli). */
  load: (bundleFile: string) => void;
  warn?: (message: string) => void;
}

/** Inti bootstrap exe: pilih aplikasi, titipkan HostInfo, muat bundle-nya; gagal → aplikasi bawaan. */
export function bootApp(o: BootOptions): HostInfo {
  const runtime = o.runtime ?? RUNTIME;
  const embedded: AppInfo = { id: o.manifest.id, version: o.manifest.version, runtime: o.manifest.runtime };
  const start = (app: AppInfo, dir: string): HostInfo => {
    const host: HostInfo = { runtime, appDir: dir, app, embedded, root: o.root };
    (globalThis as Record<string, unknown>)[HOST_GLOBAL] = host;
    o.load(path.join(dir, BUNDLE_FILE));
    return host;
  };
  const picked = chooseApp(o.root, embedded, runtime);
  if (picked.id !== embedded.id) {
    const dir = path.join(o.root, picked.id);
    try {
      return start(picked, dir);
    } catch (err) {
      const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
      try {
        writeFileSync(path.join(dir, BROKEN_MARK), `${new Date().toISOString()}\n${message}\n`);
      } catch {
        /* folder tidak bisa ditulis: tetap lanjut ke aplikasi bawaan */
      }
      o.warn?.(`Prototyper ${picked.version} gagal dimuat, kembali ke ${embedded.version}: ${message}`);
    }
  }
  const dir = path.join(o.root, embedded.id);
  extractFiles(dir, o.manifest.files, o.read);
  return start(embedded, dir);
}

/** Hapus folder aplikasi di app store kecuali `keep` (dan current.json). Diam bila ada yang terkunci. */
export function pruneAppStore(root: string, keep: string[]): string[] {
  const removed: string[] = [];
  let names: string[];
  try {
    names = readdirSync(root);
  } catch {
    return removed;
  }
  for (const name of names) {
    if (name === CURRENT_FILE || keep.includes(name) || name.endsWith('.tmp')) continue;
    if (!existsSync(path.join(root, name, APP_INFO_FILE)) && !existsSync(path.join(root, name, 'package.json'))) continue;
    try {
      rmSync(path.join(root, name), { recursive: true, force: true });
      removed.push(name);
    } catch {
      /* sedang dipakai proses lain */
    }
  }
  return removed;
}
