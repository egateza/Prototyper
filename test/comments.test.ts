import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addComment,
  AGENT_SOURCE,
  commentsPath,
  countComments,
  deleteComment,
  deleteReply,
  editComment,
  editReply,
  getComment,
  listComments,
  normalizePage,
  reopenComment,
  replyComment,
  resolveComment,
} from '../src/core/comments.js';
import { buildApp } from '../src/server/app.js';
import { makePrototype, testConfig, tmpDir } from './helpers.js';

describe('comments (core)', () => {
  it('tambah, balas, selesai, buka lagi, hapus; id berurutan dan tidak dipakai ulang', async () => {
    const dir = tmpDir();
    expect(await listComments(dir)).toEqual([]);
    expect(countComments(dir)).toEqual({ open: 0, resolved: 0, waitingUser: 0 });

    const a = await addComment(dir, { text: '  Tombol bayar terlalu kecil ', page: 'kasir' });
    expect(a).toMatchObject({ id: 'c1', page: '/kasir', text: 'Tombol bayar terlalu kecil', status: 'open', author: 'pengguna' });
    const b = await addComment(dir, { text: 'Warna header', page: 'http://localhost:4101/?x=1' }, AGENT_SOURCE);
    expect(b).toMatchObject({ id: 'c2', page: '/?x=1', author: 'agent' });

    const r = await replyComment(dir, 'c1', { text: 'Seberapa besar?', author: 'agent' });
    expect(r.replies).toEqual([expect.objectContaining({ id: 'c1-r1', author: 'agent', text: 'Seberapa besar?' })]);

    const done = await resolveComment(dir, 'c1', { note: 'Diperbesar 2x', author: 'agent' });
    expect(done).toMatchObject({ status: 'resolved', resolution: 'Diperbesar 2x', resolvedBy: 'agent' });
    expect(countComments(dir)).toEqual({ open: 1, resolved: 1, waitingUser: 1 }); // c2 dari agent -> menunggu pengguna
    expect((await listComments(dir, { status: 'open' })).map((c) => c.id)).toEqual(['c2']);
    expect((await listComments(dir, { page: '/kasir' })).map((c) => c.id)).toEqual(['c1']);

    expect(await reopenComment(dir, 'c1')).toMatchObject({ status: 'open', resolution: null, resolvedAt: null });
    await deleteComment(dir, 'c2', { force: true }); // ditulis agent: hanya dengan force
    expect((await addComment(dir, { text: 'baru' })).id).toBe('c3');

    // file bisa dibaca langsung oleh agent tanpa Prototyper
    const raw = JSON.parse(readFileSync(path.join(dir, '.prototyper', 'comments.json'), 'utf8'));
    expect(raw.comments.map((c: { id: string }) => c.id)).toEqual(['c1', 'c3']);
  });

  it('validasi dan error', async () => {
    const dir = tmpDir();
    await expect(addComment(dir, { text: '   ' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(addComment(dir, { text: 'x'.repeat(5001) })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(resolveComment(dir, 'c9')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    mkdirSync(path.join(dir, '.prototyper'));
    writeFileSync(commentsPath(dir), '{rusak');
    await expect(listComments(dir)).rejects.toMatchObject({ code: 'INTERNAL' });
    expect(countComments(dir)).toEqual({ open: 0, resolved: 0, waitingUser: 0 });
  });

  it('penulisan bersamaan tidak saling menimpa', async () => {
    const dir = tmpDir();
    await Promise.all(Array.from({ length: 10 }, (_, i) => addComment(dir, { text: `k${i}` })));
    const list = await listComments(dir);
    expect(list).toHaveLength(10);
    expect(new Set(list.map((c) => c.id)).size).toBe(10);
  });

  it('pertanyaan berpilihan: jawaban, pertanyaan balik, dan giliran', async () => {
    const dir = tmpDir();
    await addComment(dir, { text: 'Perbesar tombol bayar' });
    expect((await getComment(dir, 'c1')).waitingFor).toBe('agent');

    const q = await replyComment(dir, 'c1', { text: 'Seberapa besar?', options: ['Selebar panel', '56px', 'Menempel di bawah'] }, AGENT_SOURCE);
    expect(q.replies[0]).toMatchObject({ id: 'c1-r1', role: 'agent', options: ['Selebar panel', '56px', 'Menempel di bawah'], answer: null });
    expect(q).toMatchObject({ waitingFor: 'user', pendingQuestions: ['c1-r1'] });
    expect(countComments(dir).waitingUser).toBe(1);

    // pertanyaan balik (tanpa memilih): pertanyaan tetap tertunda, giliran agent
    const back = await replyComment(dir, 'c1', { text: 'Apa bedanya opsi 1 dan 3 di HP?' });
    expect(back).toMatchObject({ waitingFor: 'agent', pendingQuestions: ['c1-r1'] });

    // jawaban: pilihan + catatan
    const ans = await replyComment(dir, 'c1', { answerTo: 'c1-r1', choices: ['Menempel di bawah'], text: 'khusus tablet' });
    expect(ans.replies[0]?.answer).toMatchObject({ replyId: 'c1-r3', choices: ['Menempel di bawah'], text: 'khusus tablet' });
    expect(ans).toMatchObject({ waitingFor: 'agent', pendingQuestions: [] });
    expect((await listComments(dir, { waitingFor: 'agent' })).map((c) => c.id)).toEqual(['c1']);
    expect(await listComments(dir, { waitingFor: 'user' })).toEqual([]);

    // multi: urutan pilihan mengikuti urutan opsi
    const m = await replyComment(dir, 'c1', { text: 'Metode bayar?', options: ['Tunai', 'QRIS', 'Transfer'], multi: true }, AGENT_SOURCE);
    const multiAns = await replyComment(dir, 'c1', { answerTo: m.replies[3]?.id, choices: ['Transfer', 'Tunai'] });
    expect(multiAns.replies[3]?.answer?.choices).toEqual(['Tunai', 'Transfer']);
  });

  it('pertanyaan berpilihan: validasi', async () => {
    const dir = tmpDir();
    await addComment(dir, { text: 'x' });
    const bad = (input: Record<string, unknown>) => replyComment(dir, 'c1', input, AGENT_SOURCE);
    await expect(bad({ text: 'q', options: ['a'] })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(bad({ text: 'q', options: ['a', 'A'] })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(bad({ text: 'q', options: ['a', ''] })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(bad({ options: ['a', 'b'] })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(bad({ text: 'q', options: ['a', 'b'], answerTo: 'c1-r1' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await replyComment(dir, 'c1', { text: 'q', options: ['a', 'b'] }, AGENT_SOURCE);
    await expect(replyComment(dir, 'c1', { answerTo: 'c1-r1', choices: ['a', 'b'] })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(replyComment(dir, 'c1', { answerTo: 'c1-r1', choices: ['z'] })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(replyComment(dir, 'c1', { answerTo: 'c1-r1', choices: [] })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(replyComment(dir, 'c1', { answerTo: 'c1-r9', choices: ['a'] })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('data lama tanpa role: disimpulkan dari author', async () => {
    const dir = tmpDir();
    mkdirSync(path.join(dir, '.prototyper'));
    const t = '2026-11-15T08:00:00.000Z';
    writeFileSync(commentsPath(dir), JSON.stringify({
      version: 1, nextId: 2,
      comments: [{ id: 'c1', page: '/', author: 'pengguna', text: 'x', status: 'open', createdAt: t, updatedAt: t,
        replies: [{ id: 'c1-r1', author: 'agent', text: 'tanya', createdAt: t }] }],
    }));
    const [c] = await listComments(dir);
    expect(c).toMatchObject({ role: 'user', waitingFor: 'user', replies: [{ role: 'agent' }] });
    expect(countComments(dir)).toEqual({ open: 1, resolved: 0, waitingUser: 1 });
  });

  it('edit & hapus hanya untuk komentar yang belum dikerjakan agent', async () => {
    const dir = tmpDir();
    const a = await addComment(dir, { text: 'Tombol kecil' });
    expect(a.editable).toBe(true);
    const e = await editComment(dir, 'c1', { text: '  Tombol bayar terlalu kecil ' });
    expect(e).toMatchObject({ text: 'Tombol bayar terlalu kecil', editable: true, editedAt: expect.any(String) });
    // teks sama: tidak menulis ulang
    expect((await editComment(dir, 'c1', { text: 'Tombol bayar terlalu kecil' })).editedAt).toBe(e.editedAt);
    await expect(editComment(dir, 'c1', { text: ' ' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    // balasan pengguna sendiri tidak mengunci
    expect((await replyComment(dir, 'c1', { text: 'tambahan' })).editable).toBe(true);

    // sedang dikerjakan agent (run berjalan)
    const working = { working: (c: { id: string }) => c.id === 'c1' };
    await expect(editComment(dir, 'c1', { text: 'x' }, working)).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(deleteComment(dir, 'c1', working)).rejects.toMatchObject({ code: 'CONFLICT' });

    // sudah dibalas agent
    expect((await replyComment(dir, 'c1', { text: 'Sudah diperbesar' }, AGENT_SOURCE)).editable).toBe(false);
    await expect(editComment(dir, 'c1', { text: 'x' })).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(deleteComment(dir, 'c1')).rejects.toMatchObject({ code: 'CONFLICT' });

    // ditulis agent / sudah selesai
    await addComment(dir, { text: 'dari agent' }, AGENT_SOURCE);
    await expect(deleteComment(dir, 'c2')).rejects.toMatchObject({ code: 'CONFLICT' });
    await addComment(dir, { text: 'selesai sendiri' });
    await resolveComment(dir, 'c3');
    expect((await getComment(dir, 'c3')).editable).toBe(false);
    await expect(editComment(dir, 'c3', { text: 'x' })).rejects.toMatchObject({ code: 'CONFLICT' });

    await addComment(dir, { text: 'salah ketik' });
    await deleteComment(dir, 'c4');
    expect((await listComments(dir)).map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
    await deleteComment(dir, 'c1', { force: true });
    await expect(editComment(dir, 'c9', { text: 'x' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('edit & hapus balasan pengguna yang belum ditanggapi agent; id balasan tidak dipakai ulang', async () => {
    const dir = tmpDir();
    await addComment(dir, { text: 'Perbesar tombol' });
    await replyComment(dir, 'c1', { text: 'Pilih ukuran', options: ['Besar', 'Sedang'] }, AGENT_SOURCE); // r1
    await replyComment(dir, 'c1', { answerTo: 'c1-r1', choices: ['Besar'] }); // r2
    await replyComment(dir, 'c1', { text: 'tambahan 1' }); // r3
    const c = await replyComment(dir, 'c1', { text: 'tambahan 2' }); // r4
    expect(c.replies.map((r) => r.editable)).toEqual([false, false, true, true]);

    const e = await editReply(dir, 'c1', 'c1-r3', { text: ' tambahan satu ' });
    expect(e.replies[2]).toMatchObject({ text: 'tambahan satu', editedAt: expect.any(String) });
    await expect(editReply(dir, 'c1', 'c1-r1', { text: 'x' })).rejects.toMatchObject({ code: 'CONFLICT' }); // dari agent
    await expect(editReply(dir, 'c1', 'c1-r2', { text: 'x' })).rejects.toMatchObject({ code: 'CONFLICT' }); // jawaban
    await expect(editReply(dir, 'c1', 'c1-r9', { text: 'x' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(editReply(dir, 'c1', 'c1-r3', { text: '' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(deleteReply(dir, 'c1', 'c1-r3', { working: () => true })).rejects.toMatchObject({ code: 'CONFLICT' });

    // hapus balasan terakhir: id berikutnya tetap baru
    expect((await deleteReply(dir, 'c1', 'c1-r4')).replies.map((r) => r.id)).toEqual(['c1-r1', 'c1-r2', 'c1-r3']);
    expect((await replyComment(dir, 'c1', { text: 'lagi' })).replies.at(-1)?.id).toBe('c1-r5');

    // setelah agent membalas, balasan pengguna sebelumnya terkunci
    const after = await replyComment(dir, 'c1', { text: 'Sudah' }, AGENT_SOURCE);
    expect(after.replies.map((r) => r.editable)).toEqual([false, false, false, false, false]);
    await expect(deleteReply(dir, 'c1', 'c1-r3')).rejects.toMatchObject({ code: 'CONFLICT' });
    // komentar selesai: terkunci
    await replyComment(dir, 'c1', { text: 'terakhir' });
    await resolveComment(dir, 'c1');
    await expect(editReply(dir, 'c1', 'c1-r7', { text: 'x' })).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('normalizePage', () => {
    expect(normalizePage(undefined)).toBe('/');
    expect(normalizePage('')).toBe('/');
    expect(normalizePage('laporan')).toBe('/laporan');
    expect(normalizePage('https://x.test/a/b#c')).toBe('/a/b#c');
  });
});

describe('API komentar', () => {
  let app: FastifyInstance;
  const dir = makePrototype({ id: 'komen', name: 'Komen', type: 'static' }, { 'index.html': '<p>x</p>' });
  const base = '/api/prototypes/komen/comments';

  beforeAll(async () => {
    ({ app } = await buildApp({ config: testConfig() }));
    expect((await app.inject({ method: 'POST', url: '/api/prototypes', payload: { path: dir } })).statusCode).toBe(201);
  });
  afterAll(async () => {
    await app.close();
  });

  it('alur lengkap + jumlah komentar di view', async () => {
    const add = await app.inject({ method: 'POST', url: base, payload: { text: 'Perbesar font', page: '/kasir' } });
    expect(add.statusCode).toBe(201);
    expect(add.json()).toMatchObject({ id: 'c1', page: '/kasir', author: 'Pengguna (PC ini)' });
    expect(add.json()).not.toHaveProperty('deviceId');

    expect((await app.inject({ method: 'POST', url: `${base}/c1/replies`, payload: { text: 'oke', author: 'agent' } })).statusCode).toBe(201);

    const view = await app.inject({ method: 'GET', url: '/api/prototypes/komen' });
    expect(view.json().comments).toEqual({ open: 1, resolved: 0, waitingUser: 0 });

    const res = await app.inject({ method: 'POST', url: `${base}/c1/resolve`, payload: { note: 'selesai' } });
    expect(res.json()).toMatchObject({ status: 'resolved', resolution: 'selesai' });

    const open = await app.inject({ method: 'GET', url: `${base}?status=open` });
    expect(open.json()).toMatchObject({ id: 'komen', counts: { open: 0, resolved: 1 }, comments: [] });
    const all = await app.inject({ method: 'GET', url: base });
    expect(all.json().comments[0].replies).toHaveLength(1);

    expect((await app.inject({ method: 'POST', url: `${base}/c1/reopen` })).json().status).toBe('open');
    // balasan tanpa role = pengguna (walau author "agent"): masih bisa diedit
    expect((await app.inject({ method: 'PATCH', url: `${base}/c1`, payload: { text: 'Perbesar font judul' } })).statusCode).toBe(200);
    // sudah dibalas agent: tidak bisa diedit/dihapus
    await app.inject({ method: 'POST', url: `${base}/c1/replies`, payload: { text: 'sudah', role: 'agent', author: 'agent' } });
    expect((await app.inject({ method: 'PATCH', url: `${base}/c1`, payload: { text: 'x' } })).statusCode).toBe(409);
    expect((await app.inject({ method: 'DELETE', url: `${base}/c1` })).statusCode).toBe(409);
    await deleteComment(dir, 'c1', { force: true });
  });

  it('edit & hapus komentar lewat API', async () => {
    const c = (await app.inject({ method: 'POST', url: base, payload: { text: 'Typo' } })).json();
    expect(c.editable).toBe(true);
    const e = await app.inject({ method: 'PATCH', url: `${base}/${c.id}`, payload: { text: 'Perbaiki typo di judul' } });
    expect(e.statusCode).toBe(200);
    expect(e.json()).toMatchObject({ id: c.id, text: 'Perbaiki typo di judul', editedAt: expect.any(String) });
    expect((await app.inject({ method: 'PATCH', url: `${base}/${c.id}`, payload: { text: '' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PATCH', url: `${base}/c99`, payload: { text: 'x' } })).statusCode).toBe(404);
    // balasan
    await app.inject({ method: 'POST', url: `${base}/${c.id}/replies`, payload: { text: 'lupa satu' } });
    const re = await app.inject({ method: 'PATCH', url: `${base}/${c.id}/replies/${c.id}-r1`, payload: { text: 'lupa satu hal' } });
    expect(re.statusCode).toBe(200);
    expect(re.json().replies[0]).toMatchObject({ text: 'lupa satu hal', editable: true });
    const rd = await app.inject({ method: 'DELETE', url: `${base}/${c.id}/replies/${c.id}-r1` });
    expect(rd.json().replies).toEqual([]);
    expect((await app.inject({ method: 'DELETE', url: `${base}/${c.id}/replies/${c.id}-r1` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `${base}/${c.id}` })).json()).toEqual({ removed: { id: c.id } });
  });

  it('pertanyaan berpilihan lewat API + filter waiting', async () => {
    const c = (await app.inject({ method: 'POST', url: base, payload: { text: 'Warna header?' } })).json();
    const q = await app.inject({
      method: 'POST', url: `${base}/${c.id}/replies`,
      payload: { text: 'Pilih warna', options: ['Ungu', 'Hijau'], role: 'agent', author: 'agent' },
    });
    expect(q.statusCode).toBe(201);
    const waiting = (await app.inject({ method: 'GET', url: `${base}?waiting=user` })).json();
    expect(waiting.comments.map((x: { id: string }) => x.id)).toEqual([c.id]);
    const a = await app.inject({ method: 'POST', url: `${base}/${c.id}/replies`, payload: { answerTo: `${c.id}-r1`, choices: ['Hijau'] } });
    expect(a.json()).toMatchObject({ waitingFor: 'agent', pendingQuestions: [] });
    expect((await app.inject({ method: 'GET', url: `${base}?waiting=x` })).statusCode).toBe(400);
  });

  it('error: prototype/komentar tidak ada, teks kosong, status salah, dari LAN', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/prototypes/tidak-ada/comments' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `${base}/c99/resolve` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: base, payload: { text: '' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: `${base}?status=x` })).statusCode).toBe(400);
    const lan = await app.inject({ method: 'POST', url: base, remoteAddress: '192.168.1.9', payload: { text: 'x' } });
    expect(lan.statusCode).toBe(403);
    // perangkat LAN yang belum dipasangkan tidak bisa membaca komentar (lihat devices.test.ts)
    expect((await app.inject({ method: 'GET', url: base, remoteAddress: '192.168.1.9' })).statusCode).toBe(401);
  });

  it('server static tidak menyajikan .prototyper/comments.json', async () => {
    await addComment(dir, { text: 'rahasia' });
    const start = await app.inject({ method: 'POST', url: '/api/prototypes/komen/start' });
    const { url } = start.json() as { url: string };
    const res = await fetch(`${url}/.prototyper/comments.json`);
    expect(res.status).toBe(404);
    expect((await fetch(`${url}/%2Eprototyper/comments.json`)).status).toBe(404);
    expect((await fetch(`${url}/.PROTOTYPER/comments.json`)).status).toBe(404);
    expect((await fetch(`${url}/index.html`)).status).toBe(200);
    await app.inject({ method: 'POST', url: '/api/prototypes/komen/stop' });
  });
});
