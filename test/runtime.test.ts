import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { probePort } from '../src/core/ports.js';
import type { PrototypeView } from '../src/core/views.js';
import { buildApp } from '../src/server/app.js';
import { copyExample, makePrototype, testConfig } from './helpers.js';

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe('menjalankan prototype lewat API', () => {
  let app: FastifyInstance;
  const post = (url: string, payload?: unknown) =>
    app.inject({ method: 'POST', url, ...(payload !== undefined ? { payload: payload as object } : {}) });

  beforeAll(async () => {
    ({ app } = await buildApp({ config: testConfig() }));
  });
  afterAll(async () => {
    await app.close();
  });

  it('validasi body saat mendaftarkan', async () => {
    expect((await post('/api/prototypes', {})).json().error.code).toBe('BAD_REQUEST');
    expect((await post('/api/prototypes/tidak-ada/start')).statusCode).toBe(404);
  });

  it('mode static: daftar, start, akses, stop', async () => {
    const add = await post('/api/prototypes', { path: copyExample('hello-static') });
    expect(add.statusCode).toBe(201);
    expect(add.json<PrototypeView>()).toMatchObject({ id: 'hello-static', status: 'stopped', valid: true });

    const v = (await post('/api/prototypes/hello-static/start')).json<PrototypeView>();
    expect(v.status).toBe('running');
    expect(v.url).toMatch(/^http:\/\/localhost:471\d\d$/);
    expect(v.instructions.exists).toBe(true);

    const res = await fetch(`${v.url}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.text()).toContain('Hello dari prototype static');
    expect((await fetch(`${v.url}/tidak-ada.js`)).status).toBe(404);

    // start ulang saat berjalan bersifat idempoten
    expect((await post('/api/prototypes/hello-static/start')).json<PrototypeView>().port).toBe(v.port);

    const stopped = (await post('/api/prototypes/hello-static/stop')).json<PrototypeView>();
    expect(stopped).toMatchObject({ status: 'stopped', url: null });
    expect(await probePort(v.port!)).toBe(false);

    const logs = (await app.inject({ method: 'GET', url: '/api/prototypes/hello-static/logs?tail=50' })).json();
    expect(logs.lines.some((l: { line: string }) => l.line.includes('GET / 200'))).toBe(true);
  });

  it('mode command: start, akses, restart memakai port sticky, stop membunuh proses', async () => {
    await post('/api/prototypes', { path: copyExample('hello-command') });
    const v = (await post('/api/prototypes/hello-command/start')).json<PrototypeView>();
    expect(v.status).toBe('running');
    expect(v.pid).toBeTypeOf('number');
    expect(await (await fetch(v.url!)).text()).toContain(`port ${v.port}`);

    const r = (await post('/api/prototypes/hello-command/restart')).json<PrototypeView>();
    expect(r).toMatchObject({ status: 'running', port: v.port });
    expect(r.pid).not.toBe(v.pid);
    expect(isAlive(v.pid!)).toBe(false);

    const s = (await post('/api/prototypes/hello-command/stop')).json<PrototypeView>();
    expect(s.status).toBe('stopped');
    expect(isAlive(r.pid!)).toBe(false);
    expect(await probePort(v.port!)).toBe(false);
  });

  it('proses yang langsung keluar → START_FAILED dan status failed', async () => {
    const dir = makePrototype({ id: 'langsung-keluar', name: 'x', type: 'command', command: { run: 'node -e "process.exit(3)"' } });
    await post('/api/prototypes', { path: dir });
    const res = await post('/api/prototypes/langsung-keluar/start');
    expect(res.statusCode).toBe(500);
    expect(res.json().error.code).toBe('START_FAILED');
    const v = (await app.inject({ method: 'GET', url: '/api/prototypes/langsung-keluar' })).json<PrototypeView>();
    expect(v).toMatchObject({ status: 'failed', exitCode: 3 });
  });

  it('tidak siap sebelum timeout → proses dibunuh', async () => {
    const dir = makePrototype({
      id: 'lambat',
      name: 'x',
      type: 'command',
      command: { run: 'node -e "setInterval(() => {}, 1000)"', readyPattern: 'tidak-akan-muncul', readyTimeoutSec: 1 },
    });
    await post('/api/prototypes', { path: dir });
    const res = await post('/api/prototypes/lambat/start');
    expect(res.json().error.message).toMatch(/tidak siap dalam 1 detik/);
    const logs = (await app.inject({ method: 'GET', url: '/api/prototypes/lambat/logs' })).json();
    expect(logs.lines.some((l: { line: string }) => /proses keluar/.test(l.line))).toBe(true);
  });

  it('menghapus prototype yang berjalan ikut menghentikannya', async () => {
    const v = (await post('/api/prototypes/hello-command/start')).json<PrototypeView>();
    const del = await app.inject({ method: 'DELETE', url: '/api/prototypes/hello-command' });
    expect(del.json()).toMatchObject({ removed: { id: 'hello-command' } });
    expect(isAlive(v.pid!)).toBe(false);
    expect((await app.inject({ method: 'GET', url: '/api/prototypes/hello-command' })).statusCode).toBe(404);
  });

  it('manifest rusak → INVALID_MANIFEST saat start', async () => {
    const dir = makePrototype({ id: 'akan-rusak', name: 'x', type: 'static' });
    await post('/api/prototypes', { path: dir });
    const { writeFileSync } = await import('node:fs');
    writeFileSync(path.join(dir, 'prototyper.json'), '{}');
    const res = await post('/api/prototypes/akan-rusak/start');
    expect(res.json().error.code).toBe('INVALID_MANIFEST');
  });
});

describe('mendaftarkan folder tanpa prototyper.json (alur Web UI)', () => {
  let app: FastifyInstance;
  const post = (url: string, payload: unknown) => app.inject({ method: 'POST', url, payload: payload as object });

  beforeAll(async () => {
    ({ app } = await buildApp({ config: testConfig() }));
  });
  afterAll(async () => {
    await app.close();
  });

  it('detect: folder static tanpa manifest → hasil deteksi, belum ada file', async () => {
    const { tmpDir } = await import('./helpers.js');
    const { writeFileSync, existsSync } = await import('node:fs');
    const dir = tmpDir();
    writeFileSync(path.join(dir, 'index.html'), '<h1>baru</h1>');
    const d = (await post('/api/manifest/detect', { path: dir })).json();
    expect(d).toMatchObject({ exists: false, valid: true, detected: true, manifest: { type: 'static' } });
    expect(existsSync(path.join(dir, 'prototyper.json'))).toBe(false);

    // simpan manifest yang sudah diedit pengguna
    const manifest = { ...d.manifest, id: 'dari-ui', name: 'Dari UI' };
    const res = await post('/api/prototypes', { path: dir, manifest });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ id: 'dari-ui', valid: true });
    expect(JSON.parse((await import('node:fs')).readFileSync(path.join(dir, 'prototyper.json'), 'utf8')).id).toBe('dari-ui');

    // sekarang detect melaporkan manifest yang ada
    expect((await post('/api/manifest/detect', { path: dir })).json()).toMatchObject({ exists: true, valid: true });
  });

  it('detect: folder kosong → contoh static yang bisa disesuaikan; pilihan command memakai npm run dev', async () => {
    const { tmpDir } = await import('./helpers.js');
    const dir = tmpDir();
    const d = (await post('/api/manifest/detect', { path: dir })).json();
    expect(d).toMatchObject({ exists: false, detected: false, manifest: { type: 'static' } });
    expect(d.notes[0]).toMatch(/tidak terdeteksi/);
    const c = (await post('/api/manifest/detect', { path: dir, type: 'command' })).json();
    expect(c.manifest).toMatchObject({ type: 'command', command: { run: 'npm run dev' } });
  });

  it('manifest tidak valid ditolak dengan details, dan file tidak ditulis', async () => {
    const { tmpDir } = await import('./helpers.js');
    const { existsSync } = await import('node:fs');
    const dir = tmpDir();
    const res = await post('/api/prototypes', { path: dir, manifest: { id: 'X', type: 'static' } });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.details.length).toBeGreaterThan(0);
    expect(existsSync(path.join(dir, 'prototyper.json'))).toBe(false);
  });

  it('id bentrok ditolak sebelum menulis file; file yang ada butuh overwrite', async () => {
    const { tmpDir } = await import('./helpers.js');
    const { existsSync, writeFileSync } = await import('node:fs');
    const a = tmpDir();
    await post('/api/prototypes', { path: a, manifest: { id: 'kembar', name: 'A', type: 'static' } });
    const b = tmpDir();
    const res = await post('/api/prototypes', { path: b, manifest: { id: 'kembar', name: 'B', type: 'static' } });
    expect(res.json().error.code).toBe('CONFLICT');
    expect(existsSync(path.join(b, 'prototyper.json'))).toBe(false);

    const c = tmpDir();
    writeFileSync(path.join(c, 'prototyper.json'), '{ rusak');
    const d = (await post('/api/manifest/detect', { path: c })).json();
    expect(d).toMatchObject({ exists: true, valid: false, raw: '{ rusak' });
    const good = { id: 'diperbaiki', name: 'C', type: 'static' };
    expect((await post('/api/prototypes', { path: c, manifest: good })).json().error.code).toBe('CONFLICT');
    expect((await post('/api/prototypes', { path: c, manifest: good, overwrite: true })).statusCode).toBe(201);
  });

  it('PUT manifest: memperbaiki prototype terdaftar yang manifest-nya rusak, termasuk ganti id', async () => {
    const { readFileSync, writeFileSync } = await import('node:fs');
    const put = (id: string, payload: unknown) =>
      app.inject({ method: 'PUT', url: `/api/prototypes/${id}/manifest`, payload: payload as object });
    const dir = makePrototype({ id: 'akan-diedit', name: 'E', type: 'static' });
    await post('/api/prototypes', { path: dir });
    writeFileSync(path.join(dir, 'prototyper.json'), '{ rusak');
    const broken = (await app.inject({ method: 'GET', url: '/api/prototypes/akan-diedit' })).json();
    expect(broken).toMatchObject({ valid: false });

    // manifest tidak valid → 422, file tidak berubah
    const bad = await put('akan-diedit', { manifest: { id: 'X', type: 'static' } });
    expect(bad.statusCode).toBe(422);
    expect(readFileSync(path.join(dir, 'prototyper.json'), 'utf8')).toBe('{ rusak');

    // id yang dipakai prototype lain → CONFLICT
    await post('/api/prototypes', { path: makePrototype({ id: 'sudah-ada', name: 'S', type: 'static' }) });
    expect((await put('akan-diedit', { manifest: { id: 'sudah-ada', name: 'E', type: 'static' } })).json().error.code).toBe(
      'CONFLICT',
    );

    const ok = await put('akan-diedit', { manifest: { id: 'sudah-diedit', name: 'E2', type: 'static' } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ id: 'sudah-diedit', name: 'E2', valid: true });
    expect((await app.inject({ method: 'GET', url: '/api/prototypes/akan-diedit' })).statusCode).toBe(404);
    expect((await put('sudah-diedit', {})).json().error.code).toBe('BAD_REQUEST');
  });

  it('folder yang tidak ada → BAD_REQUEST', async () => {
    const res = await post('/api/manifest/detect', { path: '/tidak/ada/sama/sekali' });
    expect(res.json().error.code).toBe('BAD_REQUEST');
  });
});
