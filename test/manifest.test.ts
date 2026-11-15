import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectManifest, devRunFor, slugify } from '../src/core/detect.js';
import { AppError } from '../src/core/errors.js';
import { loadManifest, manifestJsonSchemaText, parseManifest } from '../src/core/manifest.js';
import { tmpDir } from './helpers.js';

function issuesOf(fn: () => unknown): string[] {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    return (err as AppError).details ?? [];
  }
  throw new Error('seharusnya gagal');
}

describe('parseManifest', () => {
  it('mengisi default mode static', () => {
    const m = parseManifest({ id: 'ab', name: 'A', type: 'static' });
    expect(m).toMatchObject({ type: 'static', tags: [], static: { root: '.', index: 'index.html', spa: false } });
  });

  it('mengisi default mode command', () => {
    const m = parseManifest({ id: 'ab', name: 'A', type: 'command', command: { run: 'npm run dev' } });
    if (m.type !== 'command') throw new Error('type');
    expect(m.command).toEqual({ run: 'npm run dev', cwd: '.', env: {}, portEnv: 'PORT', readyTimeoutSec: 60 });
  });

  it('menolak id, path keluar folder, regex rusak, dan field tak dikenal', () => {
    expect(issuesOf(() => parseManifest({ id: 'A_B', name: 'x', type: 'static' }))[0]).toMatch(/^id:/);
    expect(issuesOf(() => parseManifest({ id: 'ab', name: 'x', type: 'static', static: { root: '../x' } }))[0]).toMatch(
      /static\.root/,
    );
    expect(issuesOf(() => parseManifest({ id: 'ab', name: 'x', type: 'static', static: { root: 'C:\\x' } })).length).toBe(1);
    expect(
      issuesOf(() => parseManifest({ id: 'ab', name: 'x', type: 'command', command: { run: 'x', readyPattern: '(' } }))[0],
    ).toMatch(/readyPattern/);
    expect(issuesOf(() => parseManifest({ id: 'ab', name: 'x', type: 'static', foo: 1 })).length).toBeGreaterThan(0);
    expect(issuesOf(() => parseManifest({ id: 'ab', name: 'x', type: 'command' })).length).toBeGreaterThan(0);
  });
});

describe('loadManifest', () => {
  it('memberi pesan jelas bila manifest tidak ada', async () => {
    await expect(loadManifest(tmpDir())).rejects.toThrow(/prototyper init/);
  });

  it('menerima file dengan BOM (umum di Windows)', async () => {
    const dir = tmpDir();
    writeFileSync(path.join(dir, 'prototyper.json'), '\uFEFF{"id":"ab","name":"A","type":"static"}');
    expect((await loadManifest(dir)).id).toBe('ab');
  });

  it('menolak JSON rusak', async () => {
    const dir = tmpDir();
    writeFileSync(path.join(dir, 'prototyper.json'), '{ id: }');
    await expect(loadManifest(dir)).rejects.toThrow(/bukan JSON/);
  });
});

describe('detectManifest', () => {
  it('mendeteksi static dari index.html', async () => {
    const dir = tmpDir();
    writeFileSync(path.join(dir, 'index.html'), '<h1>x</h1>');
    const { manifest } = await detectManifest(dir);
    expect(manifest).toMatchObject({ type: 'static', static: { root: '.' } });
    parseManifest(manifest);
  });

  it('mendeteksi Vite dan meneruskan {port}', async () => {
    const dir = tmpDir();
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ scripts: { dev: 'vite' } }));
    writeFileSync(path.join(dir, 'index.html'), '');
    const { manifest } = await detectManifest(dir, { id: 'my-vite' });
    expect(manifest).toMatchObject({ id: 'my-vite', type: 'command', command: { install: 'npm install' } });
    if (manifest.type !== 'command') throw new Error('type');
    expect(manifest.command.run).toContain('{port}');
    parseManifest(manifest);
  });

  it('gagal dengan petunjuk bila tidak terdeteksi', async () => {
    await expect(detectManifest(tmpDir())).rejects.toThrow(/--type/);
    await expect(detectManifest(tmpDir(), { type: 'command' })).rejects.toThrow(/--run/);
  });

  it('slugify dan devRunFor', () => {
    expect(slugify('POS Sembako UI')).toBe('pos-sembako-ui');
    expect(slugify('x')).toBe('proto-x');
    expect(devRunFor('next dev')).toContain('-p {port}');
    expect(devRunFor('nodemon app.js')).toBe('npm run dev');
  });
});

describe('JSON Schema', () => {
  it('schemas/prototyper.schema.json sinkron dengan zod (jalankan: npm run schema)', () => {
    const file = new URL('../schemas/prototyper.schema.json', import.meta.url);
    expect(readFileSync(file, 'utf8')).toBe(manifestJsonSchemaText());
  });
});
