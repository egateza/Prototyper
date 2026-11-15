import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadManifest } from '../src/core/manifest.js';
import { Registry } from '../src/core/registry.js';
import { createPrototype, renderTemplate, TEMPLATES } from '../src/core/scaffold.js';
import { buildApp } from '../src/server/app.js';
import { testConfig, tmpDir } from './helpers.js';

describe('createPrototype', () => {
  it('template static: membuat file, manifest valid, dan terdaftar di workspace/<id>', async () => {
    const reg = new Registry(tmpDir());
    const workspace = tmpDir('prototyper-ws-');
    const r = await createPrototype(reg, { id: 'kasir-grosir', name: 'Kasir Grosir', workspace });
    const dir = path.join(workspace, 'kasir-grosir');
    expect(r.prototype.path).toBe(dir);
    expect(r.files).toEqual(['AGENTS.md', 'CLAUDE.md', 'app.js', 'index.html', 'prototyper.json', 'style.css']);
    expect(readFileSync(path.join(dir, 'AGENTS.md'), 'utf8')).toContain('prototyper comments kasir-grosir --waiting agent');
    expect((await loadManifest(dir)).type).toBe('static');
    expect(readFileSync(path.join(dir, 'index.html'), 'utf8')).toContain('<title>Kasir Grosir</title>');
    expect((await reg.require('kasir-grosir')).manifest?.name).toBe('Kasir Grosir');
  });

  it('impor HTML menjadi index.html (tanpa file contoh)', async () => {
    const reg = new Registry(tmpDir());
    const dir = path.join(tmpDir('prototyper-ws-'), 'dari-artifact');
    const html = '<!doctype html><title>Artifact</title><p>halo</p>';
    const r = await createPrototype(reg, { id: 'dari-artifact', dir, html, workspace: 'tidak-dipakai' });
    expect(r.files).toEqual(['AGENTS.md', 'CLAUDE.md', 'index.html', 'prototyper.json']);
    expect(readFileSync(path.join(dir, 'index.html'), 'utf8')).toBe(html);
  });

  it('template vite: manifest command dengan {port}/{host} dan install', () => {
    for (const t of ['vite-vanilla', 'vite-react'] as const) {
      const { manifest, files } = renderTemplate(t, { id: 'abc', name: 'A`b${c}' });
      expect(manifest).toMatchObject({ type: 'command', command: { install: 'npm install' } });
      expect((manifest as { command: { run: string } }).command.run).toContain('{port}');
      expect(JSON.parse(files['package.json'] ?? '{}').devDependencies.vite).toBeTruthy();
      expect(files['AGENTS.md']).toContain(`Catatan template (${t})`);
    }
    expect(TEMPLATES).toContain('vite-react');
  });

  it('menolak id tidak valid, id ganda, folder tidak kosong, dan HTML untuk template vite', async () => {
    const reg = new Registry(tmpDir());
    const workspace = tmpDir('prototyper-ws-');
    await expect(createPrototype(reg, { id: 'X Salah', workspace })).rejects.toMatchObject({ code: 'INVALID_MANIFEST' });
    expect(existsSync(path.join(workspace, 'X Salah'))).toBe(false);

    await createPrototype(reg, { id: 'satu', workspace });
    await expect(createPrototype(reg, { id: 'satu', workspace, dir: path.join(workspace, 'lain') })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(existsSync(path.join(workspace, 'lain'))).toBe(false);

    const busy = path.join(workspace, 'isi');
    mkdirSync(busy);
    writeFileSync(path.join(busy, 'catatan.txt'), 'x');
    await expect(createPrototype(reg, { id: 'dua', workspace, dir: busy })).rejects.toMatchObject({ code: 'CONFLICT' });

    await expect(createPrototype(reg, { id: 'tiga', workspace, template: 'vite-react', html: '<p>x</p>' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('folder kosong yang sudah ada boleh dipakai', async () => {
    const reg = new Registry(tmpDir());
    const dir = tmpDir('prototyper-empty-');
    const r = await createPrototype(reg, { id: 'kosong', dir, workspace: dir });
    expect(r.prototype.path).toBe(path.resolve(dir));
  });
});

describe('POST /api/prototypes/new', () => {
  let app: FastifyInstance;
  const config = testConfig();

  beforeAll(async () => {
    ({ app } = await buildApp({ config }));
  });
  afterAll(async () => {
    await app.close();
  });

  it('membuat prototype static di workspace dan mengembalikan view', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/prototypes/new', payload: { id: 'api-baru', name: 'API Baru' } });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toMatchObject({ id: 'api-baru', name: 'API Baru', template: 'static', install: null, valid: true });
    expect(body.path).toBe(path.join(config.workspace, 'api-baru'));
    const list = await app.inject({ method: 'GET', url: '/api/prototypes' });
    expect(list.json().map((p: { id: string }) => p.id)).toContain('api-baru');
  });

  it('template vite dengan install: false tidak menjalankan npm', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/prototypes/new',
      payload: { id: 'api-vite', template: 'vite-vanilla', install: false },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ type: 'command', template: 'vite-vanilla', install: null });
    expect(existsSync(path.join(config.workspace, 'api-vite', 'node_modules'))).toBe(false);
  });

  it('validasi input', async () => {
    const noId = await app.inject({ method: 'POST', url: '/api/prototypes/new', payload: {} });
    expect(noId.statusCode).toBe(400);
    const badTpl = await app.inject({ method: 'POST', url: '/api/prototypes/new', payload: { id: 'x-y', template: 'angular' } });
    expect(badTpl.statusCode).toBe(400);
    const lan = await app.inject({ method: 'POST', url: '/api/prototypes/new', remoteAddress: '192.168.1.5', payload: { id: 'lan-x' } });
    expect(lan.statusCode).toBe(403);
  });

  it('GET /api/health menyertakan workspace', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.json().workspace).toBe(config.workspace);
  });
});
