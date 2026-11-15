import { realpathSync } from 'node:fs';
import path from 'node:path';
import { getAsset, isSea } from 'node:sea';
import { fileURLToPath } from 'node:url';
import { BUNDLE_FILE, extractFiles, HOST_GLOBAL, SEA_MANIFEST_ASSET, seaExtractDir, type HostInfo, type SeaManifest } from './apphost.js';

export { BUNDLE_FILE, extractFiles, SEA_MANIFEST_ASSET, seaExtractDir, type HostInfo, type SeaManifest } from './apphost.js';

/**
 * Lokasi file aplikasi (web/, schemas/, package.json) dan cara memanggil CLI, untuk setiap
 * bentuk distribusi Prototyper:
 *
 * - `source`: dijalankan dari repo lewat tsx (`npm run cli`, `npm run dev`).
 * - `dist`:   hasil `npm run build` / paket npm (`dist/cli/index.js`).
 * - `bundle`: satu file `prototyper.cjs` hasil esbuild (rilis portable), aset di sebelahnya.
 * - `sea`:    biner tunggal (Node Single Executable Application). Bootstrap exe (src/boot/sea.ts)
 *             memilih aplikasi di `<PROTOTYPER_HOME>/app/<id>/` (bawaan exe atau hasil pembaruan),
 *             lalu memuat `prototyper.cjs` di sana. Lihat src/core/apphost.ts.
 */
export type AppMode = 'sea' | 'bundle' | 'dist' | 'source';

/** Diisi `true` oleh esbuild saat membuat bundle rilis (lihat scripts/bundle.ts). */
declare const __PROTOTYPER_BUNDLE__: boolean | undefined;

/** Titipan bootstrap exe; null bila tidak dimuat oleh bootstrap (source/dist/bundle, atau exe ≤ 0.2). */
export const APP_HOST: HostInfo | null = ((globalThis as Record<string, unknown>)[HOST_GLOBAL] as HostInfo | undefined) ?? null;

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

/** Exe lama (≤ 0.2): bundle sendiri adalah main SEA, aset diekstrak di sini. */
function legacySeaAppDir(): string {
  const manifest = JSON.parse(getAsset(SEA_MANIFEST_ASSET, 'utf8')) as SeaManifest;
  const dir = seaExtractDir(manifest.id);
  extractFiles(dir, manifest.files, (name) => getAsset(name));
  return dir;
}

function resolveAppDir(mode: AppMode): string {
  switch (mode) {
    case 'sea':
      return APP_HOST ? APP_HOST.appDir : legacySeaAppDir();
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
