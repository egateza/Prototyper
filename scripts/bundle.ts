import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { BUNDLE_FILE } from '../src/core/appfiles.js';

/**
 * Buat folder aplikasi rilis: satu file `prototyper.cjs` (semua kode + dependensi) beserta
 * web/, schemas/, dan package.json ringkas. Dipakai untuk rilis portable dan biner tunggal (SEA).
 */
export const ROOT = fileURLToPath(new URL('../', import.meta.url));

export interface PackageInfo {
  name: string;
  version: string;
  description?: string;
  license?: string;
}

export function readPackage(): PackageInfo {
  return JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as PackageInfo;
}

export async function bundleApp(outDir: string): Promise<{ dir: string; bundle: string; version: string }> {
  const pkg = readPackage();
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const bundle = path.join(outDir, BUNDLE_FILE);
  await build({
    entryPoints: [path.join(ROOT, 'src', 'cli', 'index.ts')],
    outfile: bundle,
    bundle: true,
    platform: 'node',
    format: 'cjs', // SEA hanya menerima skrip CommonJS
    target: 'node22',
    define: { __PROTOTYPER_BUNDLE__: 'true' },
    // import.meta hanya dipakai di cabang source/dist (src/core/appfiles.ts)
    logOverride: { 'empty-import-meta': 'silent' },
    legalComments: 'none',
    logLevel: 'warning',
  });
  cpSync(path.join(ROOT, 'web'), path.join(outDir, 'web'), { recursive: true });
  cpSync(path.join(ROOT, 'schemas'), path.join(outDir, 'schemas'), { recursive: true });
  const meta = { name: pkg.name, version: pkg.version, description: pkg.description, license: pkg.license };
  writeFileSync(path.join(outDir, 'package.json'), `${JSON.stringify(meta, null, 2)}\n`);
  return { dir: outDir, bundle, version: pkg.version };
}
