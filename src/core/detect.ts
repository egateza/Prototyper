import path from 'node:path';
import { AppError } from './errors.js';
import { fileExists, readJsonFile } from './fsutil.js';
import { SCHEMA_URL, type ManifestInput } from './manifest.js';

export interface InitOptions {
  type?: 'static' | 'command';
  id?: string;
  name?: string;
  run?: string;
}

export interface DetectResult {
  manifest: ManifestInput;
  notes: string[];
}

interface PackageJson {
  description?: unknown;
  scripts?: Record<string, string>;
}

export function slugify(name: string): string {
  const s = name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
    .replace(/-+$/, '');
  return s.length >= 2 ? s : `proto-${s || 'baru'}`;
}

/** Perintah dev yang meneruskan port/host untuk dev server populer. */
export function devRunFor(devScript: string): string {
  if (/\bvite\b/.test(devScript)) return 'npm run dev -- --port {port} --host {host} --strictPort';
  if (/\bnext\b/.test(devScript)) return 'npm run dev -- -p {port} -H {host}';
  if (/\bastro\b/.test(devScript)) return 'npm run dev -- --port {port} --host {host}';
  return 'npm run dev';
}

async function findStaticRoot(dir: string): Promise<string | null> {
  for (const cand of ['.', 'dist', 'build', 'public']) {
    if (await fileExists(path.join(dir, cand, 'index.html'))) return cand;
  }
  return null;
}

/** Tebak isi prototyper.json dari isi folder. */
export async function detectManifest(dir: string, opts: InitOptions = {}): Promise<DetectResult> {
  const notes: string[] = [];
  const base = path.basename(path.resolve(dir));
  const pkg = await readJsonFile<PackageJson>(path.join(dir, 'package.json')).catch(() => undefined);
  const scripts = pkg?.scripts ?? {};
  const staticRoot = await findStaticRoot(dir);

  const head = {
    $schema: SCHEMA_URL,
    id: opts.id ?? slugify(base),
    name: opts.name ?? base,
    ...(typeof pkg?.description === 'string' && pkg.description ? { description: pkg.description } : {}),
  };

  const autoCommand = !!pkg && (!!scripts.dev || (!staticRoot && !!scripts.start));
  const wantCommand = opts.type === 'command' || (opts.type === undefined && (opts.run !== undefined || autoCommand));

  if (wantCommand) {
    let run = opts.run;
    if (!run) {
      if (scripts.dev) {
        run = devRunFor(scripts.dev);
        notes.push(`run diambil dari script "dev" (${scripts.dev})`);
      } else if (scripts.start) {
        run = 'npm start';
        notes.push('run memakai "npm start"; pastikan aplikasi membaca env PORT');
      } else {
        throw new AppError(
          'BAD_REQUEST',
          'Tidak ada script "dev"/"start" di package.json. Tentukan perintah dengan --run "<perintah>"',
        );
      }
    }
    if (!run.includes('{port}')) {
      notes.push('perintah tidak memakai {port}; aplikasi harus membaca env PORT agar port dari Prototyper dipakai');
    }
    const command = pkg ? { run, install: 'npm install' } : { run };
    return { manifest: { ...head, type: 'command' as const, command }, notes };
  }

  if (opts.type === undefined && !staticRoot) {
    throw new AppError(
      'BAD_REQUEST',
      `Jenis prototype di ${dir} tidak terdeteksi (tidak ada index.html atau script dev/start). ` +
        'Pakai --type static, atau --type command --run "<perintah>"',
    );
  }
  if (!staticRoot) notes.push('index.html belum ada; buat file itu agar prototype bisa dibuka');
  return {
    manifest: { ...head, type: 'static' as const, static: { root: staticRoot ?? '.', index: 'index.html', spa: false } },
    notes,
  };
}
