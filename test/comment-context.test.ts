import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { formatContext } from '../src/cli/comments.js';
import {
  addComment,
  ARCHIVE_DIR,
  cleanAnchor,
  commentContext,
  commentsPath,
  CONTEXT_LIMITS,
  decisionsPath,
  listComments,
  noteUndo,
  parseDecision,
  readArchive,
  readDecisions,
  reopenComment,
  replyComment,
  resolveComment,
} from '../src/core/comments.js';
import { parseManifest } from '../src/core/manifest.js';
import { buildApp } from '../src/server/app.js';
import { makePrototype, testConfig, tmpDir } from './helpers.js';

const BTN = { selector: '#bayar', tag: 'button', text: 'Bayar' };

describe('log keputusan (DECISIONS.md)', () => {
  it('resolve menambah baris: permintaan → catatan, atau laporan agent terakhir bila tanpa catatan', async () => {
    const dir = tmpDir();
    await addComment(dir, { text: 'Tombol bayar\nterlalu kecil', page: '/kasir', anchor: BTN });
    await replyComment(dir, 'c1', { text: 'Tombol diperbesar 2x', role: 'agent', author: 'agent' });
    await resolveComment(dir, 'c1');
    await addComment(dir, { text: 'Judul', page: '/' });
    await resolveComment(dir, 'c2', { note: 'Judul diganti' });

    const raw = readFileSync(decisionsPath(dir), 'utf8');
    expect(raw).toMatch(/^# Keputusan/);
    const ds = await readDecisions(dir);
    expect(ds).toEqual([
      expect.objectContaining({ id: 'c1', page: '/kasir', selector: '#bayar', text: 'Tombol bayar terlalu kecil → Tombol diperbesar 2x' }),
      expect.objectContaining({ id: 'c2', page: '/', selector: null, text: 'Judul → Judul diganti' }),
    ]);
    expect(ds[0]?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('reopen mencatat "dibuka lagi" hanya bila sebelumnya selesai; undo agent tercatat', async () => {
    const dir = tmpDir();
    await addComment(dir, { text: 'Warna header', page: '/' });
    await reopenComment(dir, 'c1'); // masih open: tidak dicatat
    expect(await readDecisions(dir)).toEqual([]);
    await resolveComment(dir, 'c1', { note: 'Ungu' });
    await reopenComment(dir, 'c1');
    expect((await readDecisions(dir)).map((d) => d.text)).toEqual(['Warna header → Ungu', 'Warna header → ↺ dibuka lagi']);

    const since = new Date().toISOString();
    await replyComment(dir, 'c1', { text: 'Header jadi hijau', role: 'agent', author: 'agent' });
    await noteUndo(dir, { since, until: new Date().toISOString() }, 'Perubahan dibatalkan');
    expect((await readDecisions(dir)).at(-1)?.text).toBe('Warna header → ↺ perubahan agent dibatalkan (Header jadi hijau)');
  });

  it('teks berisi pemisah tetap bisa diurai', () => {
    expect(parseDecision('- 2026-11-16 · c3 · /a · - · x → y')).toEqual({ date: '2026-11-16', id: 'c3', page: '/a', selector: null, text: 'x → y' });
    expect(parseDecision('# Keputusan')).toBeNull();
  });
});

describe('commentContext', () => {
  it('related: resolved di halaman sama, anchor sama lebih dulu; decisions difilter dan dibatasi', async () => {
    const dir = tmpDir();
    await addComment(dir, { text: 'lain halaman', page: '/x', anchor: BTN }); // c1
    await addComment(dir, { text: 'tanpa elemen', page: '/kasir' }); // c2
    await addComment(dir, { text: 'tombol: warna', page: '/kasir', anchor: BTN }); // c3
    await addComment(dir, { text: 'masih open', page: '/kasir', anchor: BTN }); // c4
    for (const id of ['c1', 'c3', 'c2']) await resolveComment(dir, id, { note: `selesai ${id}` });
    const target = await addComment(dir, { text: 'tombol: ukuran', page: '/kasir', anchor: BTN }); // c5

    const ctx = await commentContext(dir, target.id);
    expect(ctx.comment.id).toBe('c5');
    expect(ctx.related.map((r) => [r.id, r.sameAnchor])).toEqual([['c3', true], ['c2', false]]);
    expect(ctx.decisions.map((d) => d.id)).toEqual(['c3', 'c2']);
    expect(formatContext(ctx)).toContain('c3 [elemen sama] @ #bayar: tombol: warna');

    for (let i = 0; i < CONTEXT_LIMITS.decisions + 5; i++) {
      await resolveComment(dir, 'c2', { note: `ulang ${i}` });
    }
    const many = await commentContext(dir, 'c5');
    expect(many.decisions).toHaveLength(CONTEXT_LIMITS.decisions);
    expect(many.decisions.at(-1)?.text).toContain(`ulang ${CONTEXT_LIMITS.decisions + 4}`);

    await expect(commentContext(dir, 'c99')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('arsip komentar', () => {
  const old = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
  function seed(dir: string, manifest?: Record<string, unknown>) {
    if (manifest) writeFileSync(path.join(dir, 'prototyper.json'), JSON.stringify(manifest));
    mkdirSync(path.dirname(commentsPath(dir)), { recursive: true });
    const base = { author: 'pengguna', role: 'user', page: '/kasir', replies: [], resolvedBy: 'pengguna', resolution: null };
    const c = (id: string, resolvedAt: string | null) => ({
      ...base, id, text: `t ${id}`, status: resolvedAt ? 'resolved' : 'open',
      createdAt: old(90), updatedAt: resolvedAt ?? old(90), resolvedAt, ...(resolvedAt ? {} : { resolvedBy: null }),
    });
    writeFileSync(commentsPath(dir), JSON.stringify({ version: 1, nextId: 4, comments: [c('c1', old(40)), c('c2', old(5)), c('c3', null)] }));
  }

  it('resolved > 30 hari dipindah saat file ditulis; bisa dibaca lagi dengan includeArchive', async () => {
    const dir = tmpDir();
    seed(dir);
    expect((await listComments(dir)).map((c) => c.id)).toEqual(['c1', 'c2', 'c3']); // baca saja: belum diarsipkan
    await addComment(dir, { text: 'baru', page: '/kasir' });

    expect((await listComments(dir)).map((c) => c.id)).toEqual(['c2', 'c3', 'c4']);
    const month = old(40).slice(0, 7);
    expect(existsSync(path.join(dir, ARCHIVE_DIR, `${month}.json`))).toBe(true);
    expect((await readArchive(dir)).map((c) => c.id)).toEqual(['c1']);

    const all = await listComments(dir, { includeArchive: true });
    expect(all.map((c) => [c.id, c.archived ?? false])).toEqual([['c1', true], ['c2', false], ['c3', false], ['c4', false]]);
    await expect(commentContext(dir, 'c1')).rejects.toThrow(/--include-archive/);
    expect((await commentContext(dir, 'c4', { includeArchive: true })).related.map((r) => r.id)).toEqual(['c2', 'c1']);
  });

  it('comments.archiveDays dari manifest; 0 = tidak diarsipkan', async () => {
    const a = tmpDir();
    seed(a, { id: 'a1', name: 'A', type: 'static', comments: { archiveDays: 3 } });
    await addComment(a, { text: 'x' });
    expect((await readArchive(a)).map((c) => c.id)).toEqual(['c1', 'c2']);

    const b = tmpDir();
    seed(b, { id: 'b1', name: 'B', type: 'static', comments: { archiveDays: 0 } });
    await addComment(b, { text: 'x' });
    expect(await readArchive(b)).toEqual([]);

    expect(() => parseManifest({ id: 'c1x', name: 'C', type: 'static', comments: { archiveDays: -1 } })).toThrow();
  });
});

describe('snapshot elemen di anchor', () => {
  it('html disimpan dan dipotong', () => {
    expect(cleanAnchor({ selector: '#a', html: '<button  id="a">\n Bayar </button>' })).toEqual({ selector: '#a', html: '<button id="a"> Bayar </button>' });
    expect(cleanAnchor({ selector: '#a', html: 'x'.repeat(5000) })?.html).toHaveLength(2000);
  });
});

describe('API konteks komentar', () => {
  let app: FastifyInstance;
  const dir = makePrototype({ id: 'konteks', name: 'Konteks', type: 'static' }, { 'index.html': '<p>x</p>' });
  const base = '/api/prototypes/konteks/comments';

  beforeAll(async () => {
    ({ app } = await buildApp({ config: testConfig() }));
    expect((await app.inject({ method: 'POST', url: '/api/prototypes', payload: { path: dir } })).statusCode).toBe(201);
  });
  afterAll(async () => {
    await app.close();
  });

  it('GET …/:cid/context dan ?archive=1', async () => {
    await app.inject({ method: 'POST', url: base, payload: { text: 'A', page: '/', anchor: BTN } });
    await app.inject({ method: 'POST', url: `${base}/c1/resolve`, payload: { note: 'beres' } });
    await app.inject({ method: 'POST', url: base, payload: { text: 'B', page: '/', anchor: BTN } });

    const r = await app.inject({ method: 'GET', url: `${base}/c2/context` });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      comment: { id: 'c2' },
      related: [{ id: 'c1', sameAnchor: true }],
      decisions: [{ id: 'c1', text: 'A → beres' }],
    });
    expect((await app.inject({ method: 'GET', url: `${base}/c9/context?archive=1` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `${base}?archive=1` })).json().comments).toHaveLength(2);
    expect(existsSync(decisionsPath(dir))).toBe(true);
  });
});
