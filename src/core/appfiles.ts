import { existsSync, mkdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getAsset, isSea } from 'node:sea';
import { fileURLToPath } from 'node:url';

/**
 * Lokasi file aplikasi (web/, schemas/, package.json) dan cara memanggil CLI, untuk setiap
 * bentuk distribusi Prototyper:
 *
 * - `source`: dijalankan dari repo lewat tsx (`npm run cli`, `npm run dev`).
 * - `dist`:   hasil `npm run build` / paket npm (`dist/cli/index.js`).
 * - `bundle`: satu file `prototyper.cjs` hasil esbuild (rilis portable), aset di sebelahnya.
 * - `sea`:    biner tunggal (Node Single Executable Application); aset tertanam di dalam biner
 *             dan diekstrak sekali ke `<PROTOTYPER_HOME>/app/<build-id>/`.
 */
export type AppMode = 'sea' | 'bundle' | 'dist' | 'source';

/** Diisi `true` oleh esbuild saat membuat bundle rilis (lihat scripts/bundle.ts). */
declare const __PROTOTYPER_BUNDLE__: boolean | undefined;

/** Nama file bundle di folder aplikasi rilis portable. */
export const BUNDLE_FILE = 'prototyper.cjs';
/** Aset SEA berisi daftar file aplikasi yang tertanam (lihat scripts/release.ts). */
export const SEA_MANIFEST_ASSET = 'sea-manifest.json';

export interface SeaManifest {
  /** `<versi>-<hash>`: folder ekstraksi unik per build. */
  id: string;
  /** Path relatif (pemisah `/`), sekaligus nama aset. */
  files: string[];
}

function detectMode(): AppMode {
  if (isSea()) return 'sea';
  if (typeof __PROTOTYPER_BUNDLE__ !== 'undefined' && __PROTOTYPER_BUNDLE__) return 'bundle';
  return fileURLToPath(import.meta.url).endsWith('.ts') ? 'source' : 'dist';
}

function normalize(dir: string): string {
  try {
    return realpathSync.native(dir); // normalkan huruf drive (d:\ → D:\) di Windows
  } catch {
    return dir;
  }
}

/** Folder tempat aset SEA diekstrak. Mengikuti PROTOTYPER_HOME (flag --home belum terbaca di sini). */
export function seaExtractDir(id: string, env: NodeJS.ProcessEnv = process.env, home: string = os.homedir()): string {
  const base = env.PROTOTYPER_HOME ? path.resolve(env.PROTOTYPER_HOME) : path.join(home, '.prototyper');
  return path.join(base, 'app', id);
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

function seaAppDir(): string {
  const manifest = JSON.parse(getAsset(SEA_MANIFEST_ASSET, 'utf8')) as SeaManifest;
  const dir = seaExtractDir(manifest.id);
  extractFiles(dir, manifest.files, (name) => getAsset(name));
  return dir;
}

function resolveAppDir(mode: AppMode): string {
  switch (mode) {
    case 'sea':
      return seaAppDir();
    case 'bundle':
      return normalize(path.dirname(__filename)); // bundle CJS: __filename = <app>/prototyper.cjs
    default:
      return normalize(fileURLToPath(new URL('../../', import.meta.url))); // src/core atau dist/core → root
  }
}

export const APP_MODE: AppMode = detectMode();
/** Folder berisi web/, schemas/, package.json (di mode source/dist: root repo/paket). */
export const APP_DIR: string = resolveAppDir(APP_MODE);

/** Perintah (exe + argumen awal) untuk memanggil CLI Prototyper yang sedang berjalan. */
export function cliCommand(mode: AppMode = APP_MODE, appDir: string = APP_DIR, execPath: string = process.execPath): string[] {
  switch (mode) {
    case 'sea':
      return [execPath];
    case 'bundle':
      return [execPath, path.join(appDir, BUNDLE_FILE)];
    case 'dist':
      return [execPath, path.join(appDir, 'dist', 'cli', 'index.js')];
    case 'source':
      return [execPath, path.join(appDir, 'node_modules', 'tsx', 'dist', 'cli.mjs'), path.join(appDir, 'src', 'cli', 'index.ts')];
  }
}
