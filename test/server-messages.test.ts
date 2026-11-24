import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseExportQuery } from '../src/core/capture.js';
import { loadConfig } from '../src/core/config.js';
import { DeviceStore } from '../src/core/devices.js';
import { setLocale, withLocale } from '../src/core/i18n.js';
import { parseManifest } from '../src/core/manifest.js';
import { pickerCommands } from '../src/core/picker.js';
import { TEMPLATE_INFO } from '../src/core/scaffold.js';
import { writeSettings } from '../src/core/settings.js';
import { parseRelease } from '../src/core/update.js';
import { buildApp } from '../src/server/app.js';
import { makePrototype, testConfig, tmpDir } from './helpers.js';

describe('pesan core dalam bahasa Inggris (fungsi murni)', () => {
  afterEach(() => setLocale('id'));

  it('manifest: pesan zod kustom & ringkasan mengikuti bahasa saat validasi', () => {
    const bad = { id: 'X Y', name: 'x', type: 'static' };
    expect(() => withLocale('en', () => parseManifest(bad))).toThrow(/prototyper\.json is invalid: id: id must be lowercase/);
    expect(() => parseManifest(bad)).toThrow(/prototyper\.json tidak valid: id: id harus huruf kecil/);
    const ds = { id: 'abc', name: 'x', type: 'static', designSystem: { source: true, use: 'x' } };
    expect(() => withLocale('en', () => parseManifest(ds))).toThrow(/choose one: source/);
  });

  it('capture, update, config, picker, template', () => {
    withLocale('en', () => {
      expect(() => parseExportQuery('http://localhost:4100', { format: 'gif' })).toThrow('format must be png, jpg, or pdf');
      expect(() => parseRelease({ message: 'Not Found' })).toThrow('Unrecognized GitHub Releases response');
      expect(pickerCommands('linux', { kind: 'folder' })[0]?.args).toContain('--title=Choose folder');
      expect(TEMPLATE_INFO['vite-react']).toBe('Vite + React 19 (JSX), with HMR');
    });
    expect(TEMPLATE_INFO['vite-react']).toBe('Vite + React 19 (JSX), dengan HMR');
    setLocale('en');
    expect(() => loadConfig({ port: 4150 }, {})).toThrow(/overlaps the prototype port range/);
  });

  it('devices: kode pairing salah', async () => {
    const store = new DeviceStore(tmpDir());
    await store.load();
    store.startPairing();
    await expect(withLocale('en', () => store.pair('000000x'))).rejects.toThrow(/Wrong pairing code|canceled/);
  });
});

describe('pesan API mengikuti Accept-Language', () => {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.PROTOTYPER_LANG;
    delete process.env.PROTOTYPER_LANG;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.PROTOTYPER_LANG;
    else process.env.PROTOTYPER_LANG = saved;
    setLocale('id');
  });

  it('registry, route prototypes, manifest, dan hak akses', async () => {
    const config = testConfig();
    await writeSettings(config.home, { lang: 'auto' });
    const { app } = await buildApp({ config: { ...config, autoSyncAgents: false } });
    const en = { 'accept-language': 'en-US,en;q=0.9' };
    const id = { 'accept-language': 'id-ID' };
    try {
      const nf = await app.inject({ method: 'GET', url: '/api/prototypes/tidak-ada', headers: en });
      expect(nf.statusCode).toBe(404);
      expect(nf.json().error.message).toBe('Prototype "tidak-ada" is not registered. See the list: prototyper list');
      const nfId = await app.inject({ method: 'GET', url: '/api/prototypes/tidak-ada', headers: id });
      expect(nfId.json().error.message).toBe('Prototype "tidak-ada" tidak terdaftar. Lihat daftar: prototyper list');

      const body = await app.inject({ method: 'POST', url: '/api/prototypes', headers: en, payload: {} });
      expect(body.json().error.message).toBe('Body must contain { "path": "<prototype folder>" }');

      const dir = makePrototype({ id: 'pesan-en', name: 'Pesan', type: 'static' }, { 'index.html': '<h1>x</h1>' });
      const add = await app.inject({ method: 'POST', url: '/api/prototypes', headers: en, payload: { path: dir } });
      expect(add.statusCode, add.body).toBeLessThan(300);
      const put = await app.inject({ method: 'PUT', url: '/api/prototypes/pesan-en/manifest', headers: en, payload: { manifest: { id: 'pesan-en', name: 'Pesan', type: 'static', static: { root: '../luar' } } } });
      expect(put.statusCode).toBe(422);
      expect(put.json().error.message).toMatch(/is invalid: static\.root: must be a relative path inside the prototype folder/);

      // Origin dari halaman lain ditolak (hook hak akses), dalam bahasa peminta
      const cross = await app.inject({ method: 'POST', url: '/api/prototypes/pesan-en/stop', headers: { ...en, origin: 'http://evil.example' } });
      expect(cross.statusCode).toBe(403);
      expect(cross.json().error.message).toBe('Requests from other pages are rejected');
    } finally {
      await app.close();
    }
  });
});
