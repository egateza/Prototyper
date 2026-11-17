import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { undoReplyText } from '../src/core/agent.js';
import { checkpointRepoDir, Checkpoints, parseNameStatus, removeCheckpoints } from '../src/core/checkpoint.js';
import { addComment, listComments, noteUndo, replyComment, resolveComment } from '../src/core/comments.js';
import { buildApp } from '../src/server/app.js';
import { makePrototype, testConfig, tmpDir } from './helpers.js';

const FAKE_EDIT = fileURLToPath(new URL('./fixtures/fake-edit-agent.mjs', import.meta.url));
const read = (dir: string, f: string) => readFileSync(path.join(dir, f), 'utf8');
const git = (cwd: string, ...args: string[]) => spawnSync('git', args, { cwd, encoding: 'utf8' }).stdout.trim();

describe('parseNameStatus', () => {
  it('memetakan status dan path (termasuk spasi)', () => {
    expect(parseNameStatus('M\0a b.html\0A\0x/y.css\0D\0old.js\0T\0link\0')).toEqual([
      { status: 'modified', path: 'a b.html' },
      { status: 'added', path: 'x/y.css' },
      { status: 'deleted', path: 'old.js' },
      { status: 'modified', path: 'link' },
    ]);
    expect(parseNameStatus('')).toEqual([]);
  });
});

describe('Checkpoints', () => {
  const home = tmpDir('prototyper-home-');
  const cps = new Checkpoints(home);

  function proto() {
    return makePrototype({ id: 'cp', name: 'cp', type: 'static' }, {
      'index.html': '<p>asli</p>',
      'lama.css': 'a{}',
      'tetap.txt': 'tetap',
      '.gitignore': 'dist/\n',
      'dist/out.js': 'build',
      'node_modules/x/i.js': 'dep',
      '.prototyper/comments.json': '[]',
    });
  }

  it('snapshot, diff, undo; .prototyper, node_modules & .gitignore pengguna dikecualikan', async () => {
    const dir = proto();
    const before = await cps.snapshot('cp1', dir, 'sebelum');
    expect(await cps.snapshot('cp1', dir, 'tanpa perubahan')).toBe(before);
    const tracked = git(dir, `--git-dir=${cps.repoDir('cp1')}`, 'ls-tree', '-r', '--name-only', before).split('\n');
    expect(tracked.sort()).toEqual(['.gitignore', 'index.html', 'lama.css', 'prototyper.json', 'tetap.txt']);

    writeFileSync(path.join(dir, 'index.html'), '<p>agent</p>');
    mkdirSync(path.join(dir, 'baru', 'dalam'), { recursive: true });
    writeFileSync(path.join(dir, 'baru', 'dalam', 'x.html'), 'x');
    rmSync(path.join(dir, 'lama.css'));
    writeFileSync(path.join(dir, '.prototyper', 'comments.json'), '[1]');
    writeFileSync(path.join(dir, 'dist', 'out.js'), 'build 2');
    const after = await cps.snapshot('cp1', dir, 'sesudah');
    expect(await cps.diff('cp1', dir, before, after)).toEqual([
      { status: 'added', path: 'baru/dalam/x.html' },
      { status: 'modified', path: 'index.html' },
      { status: 'deleted', path: 'lama.css' },
    ]);

    // Pengguna lalu mengedit file lain: tidak bentrok dan tidak ikut dikembalikan.
    writeFileSync(path.join(dir, 'tetap.txt'), 'diedit pengguna');
    const res = await cps.undo('cp1', dir, before, after);
    expect(res).toEqual({ restored: ['index.html', 'lama.css'], removed: ['baru/dalam/x.html'] });
    expect(read(dir, 'index.html')).toBe('<p>asli</p>');
    expect(read(dir, 'lama.css')).toBe('a{}');
    expect(existsSync(path.join(dir, 'baru'))).toBe(false);
    expect(read(dir, 'tetap.txt')).toBe('diedit pengguna');
    expect(read(dir, '.prototyper/comments.json')).toBe('[1]');
    expect(read(dir, 'dist/out.js')).toBe('build 2');
  });

  it('file yang diedit lagi setelah run → CONFLICT, kecuali force', async () => {
    const dir = proto();
    const before = await cps.snapshot('cp2', dir, 'sebelum');
    writeFileSync(path.join(dir, 'index.html'), '<p>agent</p>');
    const after = await cps.snapshot('cp2', dir, 'sesudah');
    writeFileSync(path.join(dir, 'index.html'), '<p>pengguna</p>');
    await expect(cps.undo('cp2', dir, before, after)).rejects.toMatchObject({ code: 'CONFLICT', details: ['index.html'] });
    expect(read(dir, 'index.html')).toBe('<p>pengguna</p>');
    await cps.undo('cp2', dir, before, after, true);
    expect(read(dir, 'index.html')).toBe('<p>asli</p>');
  });

  it('repo git milik pengguna di folder yang sama tidak tersentuh', async () => {
    const dir = proto();
    const id = ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false'];
    git(dir, 'init', '-q');
    git(dir, ...id, 'add', '-A');
    git(dir, ...id, 'commit', '-q', '-m', 'awal');
    const head = git(dir, 'rev-parse', 'HEAD');
    expect(head).toMatch(/^[0-9a-f]{40}$/);
    writeFileSync(path.join(dir, 'index.html'), '<p>belum di-stage</p>');
    const status = git(dir, 'status', '--porcelain');
    const before = await cps.snapshot('cp3', dir, 'sebelum');
    writeFileSync(path.join(dir, 'tetap.txt'), 'agent');
    const after = await cps.snapshot('cp3', dir, 'sesudah');
    await cps.undo('cp3', dir, before, after);
    expect(git(dir, 'rev-parse', 'HEAD')).toBe(head);
    expect(git(dir, 'status', '--porcelain')).toBe(status);
    expect(git(dir, 'stash', 'list')).toBe('');
    expect(read(dir, 'index.html')).toBe('<p>belum di-stage</p>');
  });

  it('git tidak ada → error yang jelas', async () => {
    const bad = new Checkpoints(tmpDir('prototyper-home-'), { git: path.join(tmpDir(), 'tidak-ada-git') });
    await expect(bad.snapshot('x', tmpDir(), 'm')).rejects.toThrow(/git tidak ditemukan/);
  });
});

describe('noteUndo', () => {
  it('membalas komentar yang dikerjakan run; yang di-resolve dibuka lagi; lainnya tidak disentuh', async () => {
    const dir = tmpDir();
    for (const t of ['dibalas', 'diselesaikan', 'diminta', 'lama', 'tidak terkait']) await addComment(dir, { text: t });
    await replyComment(dir, 'c4', { text: 'balasan lama', role: 'agent' });
    // Jeda di kedua sisi `since`: tanpa ini balasan lama bisa jatuh di milidetik yang sama (runner cepat).
    await new Promise((r) => setTimeout(r, 20));
    const since = new Date().toISOString();
    await new Promise((r) => setTimeout(r, 20));
    await replyComment(dir, 'c1', { text: 'sudah diubah', role: 'agent' });
    await resolveComment(dir, 'c2', { note: 'beres' });
    const until = new Date().toISOString();
    expect(await noteUndo(dir, { since, until, ids: ['c3'] }, 'dibatalkan')).toEqual(['c1', 'c2', 'c3']);
    const all = await listComments(dir);
    const by = (id: string) => all.find((c) => c.id === id)!;
    for (const id of ['c1', 'c2', 'c3']) {
      expect(by(id).status).toBe('open');
      expect(by(id).replies.at(-1)).toMatchObject({ text: 'dibatalkan', role: 'agent', author: 'prototyper' });
      expect(by(id).waitingFor).toBe('user');
    }
    expect(by('c2').resolution).toBeNull();
    expect(by('c4').replies).toHaveLength(1);
    expect(by('c5').replies).toHaveLength(0);
  });

  it('tanpa comments.json → tidak membuat file', async () => {
    const dir = tmpDir();
    const now = new Date().toISOString();
    expect(await noteUndo(dir, { since: now, until: now }, 'x')).toEqual([]);
    expect(existsSync(path.join(dir, '.prototyper'))).toBe(false);
  });

  it('isi balasan menyebut agent dan file, dipotong bila banyak', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ status: 'modified' as const, path: `f${i}.html` }));
    const t = undoReplyText('Claude Code', many);
    expect(t).toContain('Claude Code');
    expect(t).toContain('10 file');
    expect(t).toContain('f7.html, +2 lainnya');
  });
});

async function waitFor<T>(fn: () => Promise<T>, ok: (v: T) => boolean, ms = 30_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (ok(v) || Date.now() > end) return v;
    await new Promise((r) => setTimeout(r, 150));
  }
}

describe('API: checkpoint run agent & undo', () => {
  let app: FastifyInstance;
  const dir = makePrototype({ id: 'cp-api', name: 'CP', type: 'static' }, { 'index.html': '<p>asli</p>', 'lama.css': 'a{}' });
  const base = '/api/prototypes/cp-api/agent';
  const config = testConfig();
  const state = async () => (await app.inject({ method: 'GET', url: base })).json();
  const runOnce = async (payload: object = {}) => {
    expect((await app.inject({ method: 'POST', url: `${base}/run`, payload })).statusCode).toBe(202);
    return waitFor(state, (s) => !s.running);
  };

  beforeAll(async () => {
    ({ app } = await buildApp({ config, agentCommands: { claude: { bin: process.execPath, prefixArgs: [FAKE_EDIT] } } }));
    await app.inject({ method: 'POST', url: '/api/prototypes', payload: { path: dir } });
  });
  afterAll(async () => {
    await app.close();
  });

  it('run mencatat file yang diubah; undo mengembalikannya sekali saja dan membalas komentar', async () => {
    await app.inject({ method: 'POST', url: '/api/prototypes/cp-api/comments', payload: { text: 'Ubah judul' } });
    const st = await runOnce({ commentIds: ['c1'] });
    expect(st.run.status).toBe('done');
    expect(st.run.checkpointError).toBeNull();
    expect(st.run.checkpoint.changes).toEqual([
      { status: 'added', path: 'halaman/baru/a.html' },
      { status: 'modified', path: 'index.html' },
      { status: 'deleted', path: 'lama.css' },
    ]);
    expect(read(dir, 'index.html')).toBe('<p>diubah agent</p>');
    expect(st.resume).toMatchObject({ resumable: true, session: { sessionId: st.run.sessionId } });

    const undo = await app.inject({ method: 'POST', url: `${base}/undo` });
    expect(undo.statusCode).toBe(200);
    expect(undo.json()).toMatchObject({ restored: ['index.html', 'lama.css'], removed: ['halaman/baru/a.html'] });
    expect(undo.json().run.checkpoint.undoneAt).toBeTruthy();
    expect(undo.json().comments).toEqual(['c1']);
    // sesi berisi perubahan yang sudah dibatalkan: run berikutnya mulai sesi baru
    expect((await app.inject({ method: 'GET', url: base })).json().resume).toMatchObject({ resumable: false, reason: expect.stringMatching(/dibatalkan/) });
    const c1 = (await app.inject({ method: 'GET', url: '/api/prototypes/cp-api/comments' })).json().comments[0];
    expect(c1.waitingFor).toBe('user');
    expect(c1.replies.at(-1).text).toMatch(/dibatalkan pengguna: 3 file dikembalikan/);
    expect(read(dir, 'index.html')).toBe('<p>asli</p>');
    expect(read(dir, 'lama.css')).toBe('a{}');
    expect(existsSync(path.join(dir, 'halaman'))).toBe(false);
    expect(read(dir, '.prototyper/catatan.txt')).toContain('tidak ikut');

    expect((await app.inject({ method: 'POST', url: `${base}/undo` })).statusCode).toBe(400);
    const logs = (await app.inject({ method: 'GET', url: `${base}/logs` })).json().lines.map((l: { line: string }) => l.line).join('\n');
    expect(logs).toMatch(/checkpoint [0-9a-f]{8}/);
    expect(logs).toContain('3 file diubah agent');
    expect(logs).toContain('perubahan agent dibatalkan');
  });

  it('bentrok → 409 dengan daftar file; force menimpa; dari LAN ditolak', async () => {
    await runOnce();
    writeFileSync(path.join(dir, 'index.html'), '<p>diedit pengguna</p>');
    const res = await app.inject({ method: 'POST', url: `${base}/undo` });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.details).toEqual(['index.html']);
    expect((await app.inject({ method: 'POST', url: `${base}/undo`, remoteAddress: '192.168.1.7', payload: { force: true } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: `${base}/undo`, payload: { force: true } })).statusCode).toBe(200);
    expect(read(dir, 'index.html')).toBe('<p>asli</p>');
  });

  it('hapus dari daftar → repo checkpoint ikut dihapus, folder prototype tetap', async () => {
    const repo = checkpointRepoDir(config.home, 'cp-api');
    expect(existsSync(repo)).toBe(true);
    expect((await app.inject({ method: 'DELETE', url: '/api/prototypes/cp-api' })).statusCode).toBe(200);
    expect(existsSync(repo)).toBe(false);
    expect(read(dir, 'index.html')).toBe('<p>asli</p>');
    expect(await removeCheckpoints(config.home, 'cp-api')).toBe(false);
  });
});
