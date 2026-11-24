import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addComment, cleanAnchor, listComments } from '../src/core/comments.js';
import { EMBED_PATH, EMBED_TAG, EMBED_TAG_LIVE, injectEmbedTag, injectViewportMeta, VIEWPORT_META } from '../src/core/embed.js';
import { LOCALES } from '../src/core/i18n.js';
import { buildApp, WEB_DIR } from '../src/server/app.js';
import { makePrototype, testConfig, tmpDir } from './helpers.js';

describe('kamus web/embed.js', () => {
  // embed.js skrip klasik tanpa impor; kamusnya ada di antara penanda // i18n:start … // i18n:end.
  const src = readFileSync(path.join(WEB_DIR, 'embed.js'), 'utf8');
  const block = /\/\/ i18n:start\s*const MESSAGES = (\{[\s\S]*?\});\s*\/\/ i18n:end/.exec(src)?.[1];
  // Hanya literal objek berisi string; dievaluasi tanpa akses ke variabel luar.
  const messages = new Function(`'use strict'; return (${block});`)() as Record<string, Record<string, string>>;

  it('ada dan memuat setiap bahasa aplikasi', () => {
    expect(block).toBeTruthy();
    for (const l of LOCALES) expect(Object.keys(messages)).toContain(l);
  });

  it('kunci setiap bahasa sama dan nilainya tidak kosong', () => {
    const langs = Object.keys(messages);
    const keys = Object.keys(messages[langs[0]!]!).sort();
    expect(keys.length).toBeGreaterThan(0);
    for (const l of langs) {
      expect(Object.keys(messages[l]!).sort(), l).toEqual(keys);
      for (const k of keys) expect(typeof messages[l]![k] === 'string' && messages[l]![k]!.trim().length > 0, `${l}.${k}`).toBe(true);
    }
  });

  it('teks Indonesia tetap seperti semula', () => {
    expect(messages.id!.hintPointer).toBe('Klik elemen atau blok teks untuk dikomentari · Esc untuk batal');
  });
});

describe('injectEmbedTag', () => {
  it('sebelum </body> terakhir, tidak peka huruf besar, tidak dobel', () => {
    expect(injectEmbedTag('<html><body><p>x</p></BODY></html>')).toBe(`<html><body><p>x</p>${EMBED_TAG}</BODY></html>`);
    expect(injectEmbedTag('<p>tanpa body</p>')).toBe(`<p>tanpa body</p>\n${EMBED_TAG}\n`);
    const once = injectEmbedTag('<body></body>');
    expect(injectEmbedTag(once)).toBe(once);
  });
});

describe('injectViewportMeta', () => {
  it('setelah <head>, lalu <html>, lalu doctype; tidak menimpa viewport milik halaman', () => {
    expect(injectViewportMeta('<!doctype html><html lang="id"><HEAD><title>x</title></head></html>')).toBe(
      `<!doctype html><html lang="id"><HEAD>\n${VIEWPORT_META}<title>x</title></head></html>`,
    );
    expect(injectViewportMeta('<html><body>x</body></html>')).toBe(`<html>\n${VIEWPORT_META}<body>x</body></html>`);
    expect(injectViewportMeta('<!DOCTYPE html><p>x</p>')).toBe(`<!DOCTYPE html>\n${VIEWPORT_META}<p>x</p>`);
    expect(injectViewportMeta('<p>x</p>')).toBe(`${VIEWPORT_META}\n<p>x</p>`);
    // <header> bukan <head>
    expect(injectViewportMeta('<html><header>x</header></html>')).toBe(`<html>\n${VIEWPORT_META}<header>x</header></html>`);
    const own = '<head><meta content="width=1024" name=viewport></head>';
    expect(injectViewportMeta(own)).toBe(own);
    // meta viewport di dalam komentar tidak dihitung; <head> di dalam komentar juga tidak
    expect(injectViewportMeta('<!-- <head> --><head><!-- <meta name="viewport" content="x"> --></head>')).toBe(
      `<!-- <head> --><head>\n${VIEWPORT_META}<!-- <meta name="viewport" content="x"> --></head>`,
    );
    const once = injectViewportMeta('<head></head>');
    expect(injectViewportMeta(once)).toBe(once);
  });
});

describe('anchor komentar', () => {
  it('disimpan bersama komentar; teks dirapikan dan dipotong', async () => {
    const dir = tmpDir();
    const c = await addComment(dir, {
      text: 'Perbesar',
      anchor: { selector: 'main > button:nth-of-type(2)', tag: 'button', text: '  Terima\n  bayar ', quote: 'x'.repeat(1200) },
    });
    expect(c.anchor).toMatchObject({ selector: 'main > button:nth-of-type(2)', tag: 'button', text: 'Terima bayar' });
    expect(c.anchor?.quote).toHaveLength(1000);
    expect((await listComments(dir))[0]?.anchor?.selector).toBe('main > button:nth-of-type(2)');
    expect((await addComment(dir, { text: 'tanpa anchor' })).anchor).toBeUndefined();
  });

  it('validasi', () => {
    expect(cleanAnchor(undefined)).toBeUndefined();
    expect(cleanAnchor(null)).toBeUndefined();
    expect(() => cleanAnchor('button')).toThrow(/anchor/);
    expect(() => cleanAnchor({ selector: '  ' })).toThrow(/selector/);
    expect(() => cleanAnchor({ selector: 'a'.repeat(1001) })).toThrow(/selector/);
  });
});

describe('server static menyisipkan skrip embed', () => {
  let app: FastifyInstance;
  const on = makePrototype(
    { id: 'embed-on', name: 'On', type: 'static', static: { spa: true } },
    { 'index.html': '<!doctype html><html><body><h1>Halo</h1></body></html>', 'style.css': 'body{}', 'sub/page.html': '<p>sub</p>' },
  );
  const off = makePrototype(
    { id: 'embed-off', name: 'Off', type: 'static', static: { inject: false } },
    { 'index.html': '<body>polos</body>' },
  );
  const noVp = makePrototype(
    { id: 'embed-novp', name: 'NoVp', type: 'static', static: { viewport: false } },
    { 'index.html': '<head></head><body>x</body>' },
  );

  beforeAll(async () => {
    ({ app } = await buildApp({ config: testConfig() }));
    for (const dir of [on, off, noVp]) await app.inject({ method: 'POST', url: '/api/prototypes', payload: { path: dir } });
  });
  afterAll(async () => {
    await app.close();
  });

  it('HTML (index, file lain, fallback SPA) disisipi; aset lain tidak; skrip tersedia', async () => {
    const { url } = (await app.inject({ method: 'POST', url: '/api/prototypes/embed-on/start' })).json() as { url: string };
    const index = await fetch(`${url}/`);
    const html = await index.text();
    expect(html).toBe(`<!doctype html><html>\n${VIEWPORT_META}<body><h1>Halo</h1>${EMBED_TAG_LIVE}</body></html>`);
    expect(index.headers.get('cache-control')).toBe('no-store');
    expect(await (await fetch(`${url}/sub/page.html`)).text()).toContain(EMBED_TAG_LIVE);
    expect(await (await fetch(`${url}/rute/spa`)).text()).toContain(EMBED_TAG_LIVE);
    expect(await (await fetch(`${url}/style.css`)).text()).toBe('body{}');
    const js = await fetch(`${url}${EMBED_PATH}`);
    expect(js.status).toBe(200);
    expect(js.headers.get('content-type')).toContain('javascript');
    expect(await js.text()).toContain('prototyper:ready');
    await app.inject({ method: 'POST', url: '/api/prototypes/embed-on/stop' });
  });

  it('static.viewport: false → skrip disisipkan, meta viewport tidak', async () => {
    const { url } = (await app.inject({ method: 'POST', url: '/api/prototypes/embed-novp/start' })).json() as { url: string };
    const html = await (await fetch(`${url}/`)).text();
    expect(html).toContain(EMBED_TAG_LIVE);
    expect(html).not.toContain('viewport');
    await app.inject({ method: 'POST', url: '/api/prototypes/embed-novp/stop' });
  });

  it('static.inject: false → HTML apa adanya', async () => {
    const { url } = (await app.inject({ method: 'POST', url: '/api/prototypes/embed-off/start' })).json() as { url: string };
    expect(await (await fetch(`${url}/`)).text()).toBe('<body>polos</body>');
    expect((await fetch(`${url}${EMBED_PATH}`)).status).toBe(404);
    await app.inject({ method: 'POST', url: '/api/prototypes/embed-off/stop' });
  });

  it('API menerima anchor', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/prototypes/embed-on/comments',
      payload: { text: 'Judul terlalu kecil', page: '/', anchor: { selector: 'h1', tag: 'h1', text: 'Halo' } },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().anchor).toEqual({ selector: 'h1', tag: 'h1', text: 'Halo' });
    const bad = await app.inject({ method: 'POST', url: '/api/prototypes/embed-on/comments', payload: { text: 'x', anchor: { selector: '' } } });
    expect(bad.statusCode).toBe(400);
  });
});
