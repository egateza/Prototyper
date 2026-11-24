import path from 'node:path';
import { AppError } from './errors.js';
import { fileExists, readJsonFile } from './fsutil.js';
import { SCHEMA_URL, type ManifestInput } from './manifest.js';
import { defineMessages } from './i18n.js';

const t = defineMessages({
  id: {
    runFromDev: 'run diambil dari script "dev" ({script})',
    runNpmStart: 'run memakai "npm start"; pastikan aplikasi membaca env PORT',
    noDevStart: 'Tidak ada script "dev"/"start" di package.json. Tentukan perintah dengan --run "<perintah>"',
    noPortPlaceholder: 'perintah tidak memakai {port}; aplikasi harus membaca env PORT agar port dari Prototyper dipakai',
    typeNotDetected:
      'Jenis prototype di {dir} tidak terdeteksi (tidak ada index.html atau script dev/start). Pakai --type static, atau --type command --run "<perintah>"',
    noIndexHtml: 'index.html belum ada; buat file itu agar prototype bisa dibuka',
  },
  en: {
    runFromDev: 'run taken from the "dev" script ({script})',
    runNpmStart: 'run uses "npm start"; make sure the app reads the PORT env variable',
    noDevStart: 'No "dev"/"start" script in package.json. Specify the command with --run "<command>"',
    noPortPlaceholder: 'the command does not use {port}; the app must read the PORT env variable to use the port from Prototyper',
    typeNotDetected:
      'Could not detect the prototype type in {dir} (no index.html or dev/start script). Use --type static, or --type command --run "<command>"',
    noIndexHtml: 'index.html does not exist yet; create it so the prototype can be opened',
  },
});

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
        notes.push(t('runFromDev', { script: scripts.dev }));
      } else if (scripts.start) {
        run = 'npm start';
        notes.push(t('runNpmStart'));
      } else {
        throw new AppError('BAD_REQUEST', t('noDevStart'));
      }
    }
    if (!run.includes('{port}')) {
      notes.push(t('noPortPlaceholder', { port: '{port}' }));
    }
    const command = pkg ? { run, install: 'npm install' } : { run };
    return { manifest: { ...head, type: 'command' as const, command }, notes };
  }

  if (opts.type === undefined && !staticRoot) {
    throw new AppError('BAD_REQUEST', t('typeNotDetected', { dir }));
  }
  if (!staticRoot) notes.push(t('noIndexHtml'));
  return {
    manifest: { ...head, type: 'static' as const, static: { root: staticRoot ?? '.', index: 'index.html', spa: false } },
    notes,
  };
}
