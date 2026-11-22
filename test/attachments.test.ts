import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { agentPrompt, PRESETS, runImages } from '../src/core/agent.js';
import { prototyperSection } from '../src/core/agentfiles.js';
import { parseManifest } from '../src/core/manifest.js';
import {
  ATTACHMENTS_DIR,
  attachmentName,
  cleanAttachments,
  MAX_ATTACHMENT_BYTES,
  saveAttachment,
  sniffImage,
} from '../src/core/attachments.js';
import { addComment, AGENT_SOURCE, deleteComment, readDecisions, replyComment, resolveComment } from '../src/core/comments.js';
import type { ResolvedPrototype } from '../src/core/registry.js';
import { formatComment } from '../src/cli/comments.js';
import { buildApp } from '../src/server/app.js';
import { makePrototype, testConfig, tmpDir } from './helpers.js';

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** "Gambar" PNG kecil: tanda tangan PNG + isi pembeda (cukup untuk deteksi jenis). */
const png = (tag: string) => Buffer.concat([Buffer.from(PNG_SIG), Buffer.from(tag)]);
const b64 = (buf: Buffer) => buf.toString('base64');

describe('lampiran (core)', () => {
  it('mengenali jenis gambar dari isi file (termasuk SVG); teks lain ditolak', () => {
    expect(sniffImage(png('a'))).toBe('png');
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe('jpg');
    expect(sniffImage(Buffer.from('GIF89a......'))).toBe('gif');
    expect(sniffImage(Buffer.from('RIFF\0\0\0\0WEBPVP8 '))).toBe('webp');
    expect(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe('svg');
    expect(sniffImage(Buffer.from('\uFEFF<?xml version="1.0"?>\n<!-- logo -->\n<!DOCTYPE svg>\n<svg viewBox="0 0 1 1"></svg>'))).toBe('svg');
    expect(sniffImage(Buffer.from('<html><svg></svg></html>'))).toBeNull();
    expect(sniffImage(Buffer.from('halo <svg>'))).toBeNull();
    expect(sniffImage(Buffer.from('<svgx/>'))).toBeNull();
  });

  it('nama lampiran: hanya nama hash yang sah, tanpa path traversal', () => {
    expect(attachmentName('0123456789abcdef.png')).toBe('0123456789abcdef.png');
    expect(attachmentName('.prototyper/attachments/0123456789abcdef.webp')).toBe('0123456789abcdef.webp');
    expect(attachmentName('.prototyper\\attachments\\0123456789abcdef.jpg')).toBe('0123456789abcdef.jpg');
    expect(attachmentName('../../etc/passwd')).toBeNull();
    expect(attachmentName('.prototyper/attachments/../comments.json')).toBeNull();
    expect(attachmentName('0123456789abcdef.svg')).toBe('0123456789abcdef.svg');
    expect(attachmentName('0123456789abcdef.html')).toBeNull();
  });

  it('simpan: data URL atau base64, nama = hash isi, gambar sama tidak disimpan dua kali', async () => {
    const dir = tmpDir();
    const a = await saveAttachment(dir, `data:image/png;base64,${b64(png('satu'))}`);
    expect(a).toMatchObject({ type: 'image/png', size: PNG_SIG.length + 4 });
    expect(a.path).toMatch(/^\.prototyper\/attachments\/[a-f0-9]{16}\.png$/);
    expect(readFileSync(path.join(dir, a.path))).toEqual(png('satu'));
    expect((await saveAttachment(dir, b64(png('satu')))).path).toBe(a.path);
    expect((await saveAttachment(dir, b64(png('dua')))).path).not.toBe(a.path);
  });

  it('simpan: validasi', async () => {
    const dir = tmpDir();
    await expect(saveAttachment(dir, undefined)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(saveAttachment(dir, '!!bukan base64!!')).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(saveAttachment(dir, b64(Buffer.from('<p>bukan gambar</p>')))).rejects.toMatchObject({ code: 'BAD_REQUEST', message: expect.stringContaining('Format') });
    const big = Buffer.concat([Buffer.from(PNG_SIG), Buffer.alloc(MAX_ATTACHMENT_BYTES)]);
    await expect(saveAttachment(dir, b64(big))).rejects.toMatchObject({ code: 'BAD_REQUEST', message: expect.stringContaining('terlalu besar') });
    expect(existsSync(path.join(dir, ATTACHMENTS_DIR))).toBe(false);
  });

  it('cleanAttachments: harus sudah diunggah, tanpa duplikat, maks. 6', async () => {
    const dir = tmpDir();
    const a = await saveAttachment(dir, b64(png('x')));
    expect(await cleanAttachments(dir, undefined)).toEqual([]);
    expect(await cleanAttachments(dir, [a.path, a.name])).toEqual([a.path]);
    await expect(cleanAttachments(dir, 'x')).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(cleanAttachments(dir, ['../rahasia.png'])).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(cleanAttachments(dir, ['ffffffffffffffff.png'])).rejects.toMatchObject({ message: expect.stringContaining('tidak ditemukan') });
    const many = await Promise.all([1, 2, 3, 4, 5, 6, 7].map((i) => saveAttachment(dir, b64(png(`n${i}`)))));
    await expect(cleanAttachments(dir, many.map((m) => m.path))).rejects.toMatchObject({ message: expect.stringContaining('Maksimal 6') });
  });

  it('komentar & balasan dengan gambar; teks boleh kosong bila ada gambar', async () => {
    const dir = tmpDir();
    const a = await saveAttachment(dir, b64(png('layar')));
    const c = await addComment(dir, { text: '', attachments: [a.path] });
    expect(c).toMatchObject({ id: 'c1', text: '', attachments: [a.path] });
    await expect(addComment(dir, { text: '' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    const r = await replyComment(dir, 'c1', { text: 'seperti ini', attachments: [a.name] });
    expect(r.replies[0]).toMatchObject({ text: 'seperti ini', attachments: [a.path] });
    await expect(replyComment(dir, 'c1', { text: 'Pilih?', options: ['A', 'B'], attachments: [a.path] }, AGENT_SOURCE))
      .rejects.toMatchObject({ code: 'BAD_REQUEST' });
    const plain = await addComment(dir, { text: 'tanpa gambar' });
    expect(plain).not.toHaveProperty('attachments');

    // Komentar hanya-gambar tetap bermakna di DECISIONS.md.
    await resolveComment(dir, 'c1');
    expect((await readDecisions(dir))[0]?.text).toContain('(gambar)');

    const text = formatComment(c);
    expect(text).toContain(`[gambar] ${a.path}`);
  });

  it('hapus komentar menghapus gambar yang tidak dipakai komentar lain', async () => {
    const dir = tmpDir();
    const shared = await saveAttachment(dir, b64(png('bersama')));
    const own = await saveAttachment(dir, b64(png('sendiri')));
    await addComment(dir, { text: 'a', attachments: [shared.path, own.path] });
    await addComment(dir, { text: 'b' });
    await replyComment(dir, 'c2', { text: 'pakai juga', attachments: [shared.path] });
    await deleteComment(dir, 'c1');
    expect(existsSync(path.join(dir, own.path))).toBe(false);
    expect(existsSync(path.join(dir, shared.path))).toBe(true);
  });
});

describe('lampiran untuk agent', () => {
  const proto = (dir: string) => ({ id: 'p', path: dir, manifest: { name: 'P' } }) as unknown as ResolvedPrototype;

  it('prompt & AGENTS.md menyebut lampiran; lampiran pesan dicantumkan', () => {
    const dir = tmpDir();
    const prompt = agentPrompt(proto(dir), { message: 'lihat gambar', attachments: ['.prototyper/attachments/0123456789abcdef.png'] });
    expect(prompt).toContain('`.prototyper/attachments/0123456789abcdef.png`');
    expect(agentPrompt(proto(dir))).toContain('`attachments`');
    expect(prototyperSection(parseManifest({ id: 'pp', name: 'P', type: 'static' }))).toContain('`attachments`');
  });

  it('Codex menerima gambar lewat --image (pesan + komentar yang akan dikerjakan), prompt tetap terakhir', async () => {
    const dir = tmpDir();
    const a = await saveAttachment(dir, b64(png('pesan')));
    const b = await saveAttachment(dir, b64(png('komentar')));
    const c = await saveAttachment(dir, b64(png('lain')));
    await addComment(dir, { text: 'x', attachments: [b.path] });
    await addComment(dir, { text: 'y', attachments: [c.path] });
    await addComment(dir, { text: 'dari agent', attachments: [c.path] }, AGENT_SOURCE); // menunggu pengguna: tidak ikut

    expect(await runImages(dir, { attachments: [a.path] })).toEqual([a.path, b.path, c.path]);
    expect(await runImages(dir, { attachments: [a.path], commentIds: ['c1'] })).toEqual([a.path, b.path]);

    const images = await runImages(dir, { commentIds: ['c1'] });
    const args = PRESETS.codex.args('PROMPT', { apikey: false, env: {}, supports: () => true, images });
    expect(args.slice(-4)).toEqual(['--image', b.path, '--', expect.stringMatching(/^PROMPT/)]);
    expect(PRESETS.codex.args('PROMPT', { apikey: false, env: {}, supports: () => true })).not.toContain('--');
    expect(PRESETS.claude.imageArgs).toBeUndefined();
  });
});

describe('API lampiran', () => {
  let app: FastifyInstance;
  const dir = makePrototype({ id: 'lampir', name: 'Lampir', type: 'static' }, { 'index.html': '<p>x</p>' });
  const base = '/api/prototypes/lampir';

  beforeAll(async () => {
    ({ app } = await buildApp({ config: testConfig() }));
    expect((await app.inject({ method: 'POST', url: '/api/prototypes', payload: { path: dir } })).statusCode).toBe(201);
  });
  afterAll(async () => {
    await app.close();
  });

  it('unggah → lampirkan ke komentar & balasan → sajikan', async () => {
    const up = await app.inject({ method: 'POST', url: `${base}/attachments`, payload: { data: `data:image/png;base64,${b64(png('api'))}` } });
    expect(up.statusCode).toBe(201);
    const a = up.json();
    expect(a.path).toMatch(/^\.prototyper\/attachments\//);

    const c = await app.inject({ method: 'POST', url: `${base}/comments`, payload: { text: '', attachments: [a.path] } });
    expect(c.statusCode).toBe(201);
    expect(c.json()).toMatchObject({ attachments: [a.path] });
    const r = await app.inject({ method: 'POST', url: `${base}/comments/c1/replies`, payload: { text: 'lagi', attachments: [a.path] } });
    expect(r.json().replies[0]).toMatchObject({ attachments: [a.path] });

    const img = await app.inject({ method: 'GET', url: `${base}/attachments/${a.name}` });
    expect(img.statusCode).toBe(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect(img.rawPayload).toEqual(png('api'));
    expect(img.headers['content-security-policy']).toBeUndefined();
  });

  it('SVG: diterima, disajikan sebagai image/svg+xml dengan CSP yang memblokir skrip', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 1"><rect width="1" height="1" fill="#0057b8"/><script>alert(1)</script></svg>';
    const up = await app.inject({ method: 'POST', url: `${base}/attachments`, payload: { data: `data:image/svg+xml;base64,${b64(Buffer.from(svg))}` } });
    expect(up.statusCode).toBe(201);
    expect(up.json()).toMatchObject({ type: 'image/svg+xml', name: expect.stringMatching(/\.svg$/) });
    const res = await app.inject({ method: 'GET', url: `${base}/attachments/${up.json().name}` });
    expect(res.headers['content-type']).toBe('image/svg+xml');
    expect(res.headers['content-security-policy']).toContain('sandbox');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.body).toBe(svg); // isi asli tetap utuh: agent membacanya sebagai teks (kode warna persis)
  });

  it('validasi, 404, dan hanya dari mesin lokal', async () => {
    expect((await app.inject({ method: 'POST', url: `${base}/attachments`, payload: { data: b64(Buffer.from('<p>x</p>')) } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: `${base}/comments`, payload: { text: 'x', attachments: ['../../x.png'] } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: `${base}/attachments/ffffffffffffffff.png` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `${base}/attachments/..%2F..%2Fprototyper.json` })).statusCode).toBe(404);
    const lan = await app.inject({ method: 'POST', url: `${base}/attachments`, remoteAddress: '192.168.1.9', payload: { data: b64(png('lan')) } });
    expect(lan.statusCode).toBe(403);
  });

  it('agent/run menolak lampiran yang belum diunggah', async () => {
    const res = await app.inject({ method: 'POST', url: `${base}/agent/run`, payload: { message: 'x', attachments: ['ffffffffffffffff.png'] } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain('tidak ditemukan');
  });
});
