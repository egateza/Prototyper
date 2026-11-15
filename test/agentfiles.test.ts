import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MARK_END, MARK_START, prototyperSection, syncAgentFiles, upsertBlock } from '../src/core/agentfiles.js';
import { parseManifest, type Manifest } from '../src/core/manifest.js';
import { buildApp } from '../src/server/app.js';
import { makePrototype, testConfig, tmpDir } from './helpers.js';

const staticManifest = (id = 'pos-sembako', extra: Record<string, unknown> = {}): Manifest =>
  parseManifest({ id, name: 'POS Sembako', type: 'static', static: { index: 'Main.dc.html', spa: true }, ...extra });
const read = (dir: string, f: string) => readFileSync(path.join(dir, f), 'utf8');

describe('syncAgentFiles', () => {
  it('membuat AGENTS.md dan CLAUDE.md bila belum ada; kedua kali tidak berubah', async () => {
    const dir = tmpDir();
    const m = staticManifest();
    const r1 = await syncAgentFiles(dir, m);
    expect(r1).toEqual([{ file: 'AGENTS.md', action: 'created' }, { file: 'CLAUDE.md', action: 'created' }]);
    const agents = read(dir, 'AGENTS.md');
    expect(agents).toContain('# POS Sembako');
    expect(agents).toContain('prototyper comments pos-sembako --waiting agent --json');
    expect(agents).toContain('Titik masuk: `Main.dc.html` (SPA)');
    expect(read(dir, 'CLAUDE.md').trim()).toBe('@AGENTS.md');

    const r2 = await syncAgentFiles(dir, m);
    expect(r2.map((r) => r.action)).toEqual(['unchanged', 'unchanged']);
  });

  it('AGENTS.md milik pengguna: isi dipertahankan, bagian ditambahkan lalu diperbarui di tempat', async () => {
    const dir = tmpDir();
    writeFileSync(path.join(dir, 'AGENTS.md'), '# Catatan saya\n\nJangan pakai framework.\n');
    writeFileSync(path.join(dir, 'CLAUDE.md'), 'Gunakan bahasa Indonesia.\n');
    await syncAgentFiles(dir, staticManifest('lama'));
    let agents = read(dir, 'AGENTS.md');
    expect(agents.startsWith('# Catatan saya\n\nJangan pakai framework.\n\n<!-- prototyper:start -->')).toBe(true);
    expect(read(dir, 'CLAUDE.md')).toBe(`Gunakan bahasa Indonesia.\n\n${MARK_START}\n@AGENTS.md\n${MARK_END}\n`);

    writeFileSync(path.join(dir, 'AGENTS.md'), `${agents}\nTambahan setelah bagian.\n`);
    const r = await syncAgentFiles(dir, staticManifest('baru'));
    expect(r.map((x) => x.action)).toEqual(['updated', 'unchanged']);
    agents = read(dir, 'AGENTS.md');
    expect(agents).toContain('prototyper start baru');
    expect(agents).not.toContain('prototyper start lama');
    expect(agents).toContain('Jangan pakai framework.');
    expect(agents).toContain('Tambahan setelah bagian.');
    expect(agents.split(MARK_START)).toHaveLength(2); // tidak dobel
  });

  it('CLAUDE.md yang sudah mengimpor AGENTS.md tidak disentuh', async () => {
    const dir = tmpDir();
    writeFileSync(path.join(dir, 'CLAUDE.md'), 'Halo\n@AGENTS.md\n');
    const r = await syncAgentFiles(dir, staticManifest());
    expect(r[1]).toEqual({ file: 'CLAUDE.md', action: 'unchanged' });
  });

  it('menghormati agent.instructions dan agent.syncInstructions: false', async () => {
    const dir = tmpDir();
    await syncAgentFiles(dir, staticManifest('x-y', { agent: { instructions: 'docs/AGENT.md' } }));
    expect(read(dir, 'docs/AGENT.md')).toContain(MARK_START);
    expect(read(dir, 'CLAUDE.md').trim()).toBe('@docs/AGENT.md');

    const off = tmpDir();
    const r = await syncAgentFiles(off, staticManifest('x-z', { agent: { syncInstructions: false } }));
    expect(r).toEqual([{ file: 'AGENTS.md', action: 'skipped' }]);
    expect(existsSync(path.join(off, 'AGENTS.md'))).toBe(false);
  });

  it('mode command menyebut perintah run dan install', () => {
    const m = parseManifest({ id: 'vite-x', name: 'V', type: 'command', command: { run: 'npm run dev -- --port {port}', install: 'npm install' } });
    const s = prototyperSection(m);
    expect(s).toContain('`npm run dev -- --port {port}`');
    expect(s).toContain('prototyper install vite-x');
  });

  it('agent diminta membalas, bukan menutup komentar', () => {
    const s = prototyperSection(parseManifest({ id: 'vite-x', name: 'V', type: 'command', command: { run: 'npm run dev' } }));
    expect(s).toContain('prototyper comments reply vite-x <commentId> "<ringkasan perubahan>"');
    expect(s).toContain('**Jangan menutup komentar**');
    expect(s).not.toContain('resolve vite-x');
  });

  it('upsertBlock', () => {
    expect(upsertBlock('', 'B')).toBe('B\n');
    expect(upsertBlock('a\n\n\n', 'B')).toBe('a\n\nB\n');
    expect(upsertBlock(`a\n${MARK_START}\nlama\n${MARK_END}\nz`, `${MARK_START}\nbaru\n${MARK_END}`)).toBe(`a\n${MARK_START}\nbaru\n${MARK_END}\nz`);
  });
});

describe('API memasang petunjuk agent', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    ({ app } = await buildApp({ config: testConfig() }));
  });
  afterAll(async () => {
    await app.close();
  });

  it('POST /api/prototypes membuat AGENTS.md + CLAUDE.md; PUT manifest memperbarui id di petunjuk', async () => {
    const dir = makePrototype({ id: 'daftar-ui', name: 'Daftar UI', type: 'static' }, { 'index.html': 'x' });
    const res = await app.inject({ method: 'POST', url: '/api/prototypes', payload: { path: dir } });
    expect(res.statusCode).toBe(201);
    expect(res.json().agentFiles.map((f: { action: string }) => f.action)).toEqual(['created', 'created']);
    expect(res.json().instructions.exists).toBe(true);

    const put = await app.inject({
      method: 'PUT',
      url: '/api/prototypes/daftar-ui/manifest',
      payload: { manifest: { id: 'daftar-baru', name: 'Daftar UI', type: 'static' } },
    });
    expect(put.statusCode).toBe(200);
    expect(read(dir, 'AGENTS.md')).toContain('prototyper comments daftar-baru');
  });
});
