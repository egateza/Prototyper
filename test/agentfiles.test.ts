import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { describeAgentFiles, MARK_END, MARK_START, prototyperSection, shimCommand, syncAgentFiles, upsertBlock } from '../src/core/agentfiles.js';
import { autoSyncAgentFiles, describeAutoSync } from '../src/core/autosync.js';
import { setLocale, withLocale } from '../src/core/i18n.js';
import { parseManifest, type Manifest } from '../src/core/manifest.js';
import { Registry } from '../src/core/registry.js';
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
    expect(s).toContain("prototyper comments reply vite-x <commentId> --file - <<'EOF'");
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

  it('POST /api/prototypes/:id/instructions/sync dan /api/instructions/sync (Web UI)', async () => {
    const dir = makePrototype({ id: 'sync-ui', name: 'Sync UI', type: 'static' }, { 'index.html': 'x' });
    expect((await app.inject({ method: 'POST', url: '/api/prototypes', payload: { path: dir } })).statusCode).toBe(201);
    writeFileSync(path.join(dir, 'AGENTS.md'), `# Catatan\n\n${MARK_START}\nlama\n${MARK_END}\n`);

    const one = await app.inject({ method: 'POST', url: '/api/prototypes/sync-ui/instructions/sync' });
    expect(one.statusCode).toBe(200);
    expect(one.json()).toMatchObject({
      id: 'sync-ui',
      agentFiles: [{ file: 'AGENTS.md', action: 'updated' }, { file: 'CLAUDE.md', action: 'unchanged' }],
      prototype: { id: 'sync-ui', instructions: { exists: true } },
    });
    expect(read(dir, 'AGENTS.md')).toContain('prototyper comments sync-ui');
    expect(read(dir, 'AGENTS.md').startsWith('# Catatan\n')).toBe(true);

    const all = await app.inject({ method: 'POST', url: '/api/instructions/sync' });
    expect(all.statusCode).toBe(200);
    expect(all.json().results).toContainEqual({ id: 'sync-ui', agentFiles: [{ file: 'AGENTS.md', action: 'unchanged' }, { file: 'CLAUDE.md', action: 'unchanged' }], error: null });

    expect((await app.inject({ method: 'POST', url: '/api/prototypes/tidak-ada/instructions/sync' })).statusCode).toBe(404);
  });
});

describe('sinkron otomatis petunjuk agent', () => {
  it('onlyExisting: hanya memperbarui bagian yang sudah ada; tidak membuat file baru', async () => {
    const home = tmpDir('prototyper-home-');
    const none = tmpDir();
    expect(await syncAgentFiles(none, staticManifest(), { home, onlyExisting: true })).toEqual([{ file: 'AGENTS.md', action: 'missing' }]);
    expect(existsSync(path.join(none, 'AGENTS.md'))).toBe(false);

    const removed = tmpDir();
    writeFileSync(path.join(removed, 'AGENTS.md'), '# Catatan saya\n');
    expect(await syncAgentFiles(removed, staticManifest(), { home, onlyExisting: true })).toEqual([{ file: 'AGENTS.md', action: 'missing' }]);
    expect(read(removed, 'AGENTS.md')).toBe('# Catatan saya\n');

    const old = tmpDir();
    writeFileSync(path.join(old, 'AGENTS.md'), `# Catatan\n\n${MARK_START}\nversi lama, id salah: hello-command\n${MARK_END}\n\nekor\n`);
    const r = await syncAgentFiles(old, staticManifest('pos-sembako'), { home, onlyExisting: true });
    expect(r).toEqual([{ file: 'AGENTS.md', action: 'updated' }]);
    const text = read(old, 'AGENTS.md');
    expect(text).toContain('prototyper comments pos-sembako');
    expect(text).not.toContain('hello-command');
    expect(text.startsWith('# Catatan\n\n')).toBe(true);
    expect(text.endsWith('\n\nekor\n')).toBe(true);
    expect(existsSync(path.join(old, 'CLAUDE.md'))).toBe(false);
  });

  it('petunjuk menunjuk shim di folder data (sama untuk exe, portable, npm, source)', () => {
    expect(shimCommand(String.raw`D:\prototyper-data`, 'win32')).toBe(String.raw`D:\prototyper-data\bin\prototyper.cmd`);
    expect(shimCommand('/home/u/.prototyper', 'linux')).toBe('/home/u/.prototyper/bin/prototyper');
    const home = tmpDir('prototyper-home-');
    expect(prototyperSection(staticManifest(), home)).toContain(`"${shimCommand(home)}" <perintah>`);
  });

  it('autoSyncAgentFiles: semua prototype terdaftar disesuaikan dan shim ditulis', async () => {
    const config = testConfig();
    const registry = new Registry(config.home);
    const a = makePrototype({ id: 'auto-a', name: 'A', type: 'static' }, { 'index.html': 'x' });
    const b = makePrototype({ id: 'auto-b', name: 'B', type: 'static' }, { 'index.html': 'x' });
    await registry.add(a);
    await registry.add(b);
    writeFileSync(path.join(a, 'AGENTS.md'), `${MARK_START}\nlama\n${MARK_END}\n`);

    const r = await autoSyncAgentFiles(config, registry);
    expect(r.shimError).toBeNull();
    expect(r.results).toEqual([
      { id: 'auto-a', path: expect.any(String), files: [{ file: 'AGENTS.md', action: 'updated' }] },
      { id: 'auto-b', path: expect.any(String), files: [{ file: 'AGENTS.md', action: 'missing' }] },
    ]);
    expect(existsSync(path.join(config.home, 'bin', 'prototyper.cmd'))).toBe(true);
    expect(describeAutoSync(r)).toEqual(['Petunjuk agent diperbarui: auto-a']);
    expect(describeAutoSync(await autoSyncAgentFiles(config, registry))).toEqual([]);
  });
});

describe('petunjuk agent multibahasa', () => {
  afterEach(() => setLocale('id'));

  it('bagian Prototyper dalam bahasa Inggris setara dengan versi Indonesia', () => {
    const home = tmpDir('prototyper-home-');
    const m = staticManifest('pos-sembako', { designSystem: { use: 'sembako-ds' } });
    const en = prototyperSection(m, home, 'en');
    const id = prototyperSection(m, home, 'id');
    expect(en.startsWith(`${MARK_START}\n## Prototyper\n`)).toBe(true);
    expect(en.endsWith(MARK_END)).toBe(true);
    expect(en).toContain('### Comments from the user');
    expect(en).toContain('### Design system');
    expect(en).toContain('**Do not close comments**');
    expect(en).toContain('Write comment replies and questions in English.');
    expect(en).toContain(`"${shimCommand(home)}" <command>`);
    expect(en).not.toMatch(/Komentar|pengguna|Jangan/);
    expect(id).toContain('### Komentar dari pengguna');
    // Perintah yang sama, jumlah baris sama.
    const cmds = (s: string) => [...s.matchAll(/`(prototyper [^`<"]+)/g)].map((x) => x[1]?.trim());
    expect(cmds(en)).toEqual(cmds(id));
    expect(en.split('\n')).toHaveLength(id.split('\n').length);
  });

  it('bahasa default = bahasa proses (pengaturan), bukan bahasa request', async () => {
    const dir = tmpDir();
    await withLocale('en', () => syncAgentFiles(dir, staticManifest()));
    expect(read(dir, 'AGENTS.md')).toContain('### Komentar dari pengguna');
    setLocale('en');
    const r = await syncAgentFiles(dir, staticManifest());
    expect(r.map((x) => x.action)).toEqual(['updated', 'unchanged']);
    expect(read(dir, 'AGENTS.md')).toContain('### Comments from the user');
    expect(read(dir, 'CLAUDE.md').trim()).toBe('@AGENTS.md');
  });

  it('ganti bahasa id → en → id menulis ulang bagian yang sama tanpa menggandakannya', async () => {
    const config = testConfig();
    const registry = new Registry(config.home);
    const a = makePrototype({ id: 'lang-a', name: 'A', type: 'static' }, { 'index.html': 'x' });
    await registry.add(a);
    writeFileSync(path.join(a, 'AGENTS.md'), '# Catatan saya\n\nJangan pakai framework.\n');
    await syncAgentFiles(a, (await registry.get('lang-a'))!.manifest!, { home: config.home });
    const idText = read(a, 'AGENTS.md');
    expect(idText).toContain('### Komentar dari pengguna');

    // Daemon: pengaturan diganti → autoSyncAgentFiles di dalam withLocale(<bahasa baru>).
    const toEn = await withLocale('en', () => autoSyncAgentFiles(config, registry));
    expect(toEn.results[0]?.files).toEqual([{ file: 'AGENTS.md', action: 'updated' }]);
    const enText = read(a, 'AGENTS.md');
    expect(enText).toContain('### Comments from the user');
    expect(enText).not.toContain('### Komentar dari pengguna');
    expect(enText.split(MARK_START)).toHaveLength(2);
    expect(enText.startsWith('# Catatan saya\n\nJangan pakai framework.\n\n')).toBe(true);
    expect(withLocale('en', () => describeAutoSync(toEn))).toEqual(['Agent instructions updated: lang-a']);
    expect((await withLocale('en', () => autoSyncAgentFiles(config, registry))).results[0]?.files[0]?.action).toBe('unchanged');

    await withLocale('id', () => autoSyncAgentFiles(config, registry));
    expect(read(a, 'AGENTS.md')).toBe(idText);
  });

  it('describeAgentFiles mengikuti bahasa peminta', () => {
    expect(withLocale('en', () => describeAgentFiles([{ file: 'AGENTS.md', action: 'unchanged' }]))).toEqual(['AGENTS.md already up to date']);
    expect(describeAgentFiles([{ file: 'AGENTS.md', action: 'created' }])).toEqual(['AGENTS.md dibuat']);
  });
});
