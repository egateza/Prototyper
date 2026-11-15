import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addComment, cleanAnchor, listComments } from '../src/core/comments.js';
import { EMBED_PATH, EMBED_TAG, EMBED_TAG_LIVE, injectEmbedTag } from '../src/core/embed.js';
import { buildApp } from '../src/server/app.js';
import { makePrototype, testConfig, tmpDir } from './helpers.js';

describe('injectEmbedTag', () => {
  it('sebelum </body> terakhir, tidak peka huruf besar, tidak dobel', () => {
    expect(injectEmbedTag('<html><body><p>x</p></BODY></html>')).toBe(`<html><body><p>x</p>${EMBED_TAG}</BODY></html>`);
    expect(injectEmbedTag('<p>tanpa body</p>')).toBe(`<p>tanpa body</p>\n${EMBED_TAG}\n`);
    const once = injectEmbedTag('<body></body>');
    expect(injectEmbedTag(once)).toBe(once);
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

  beforeAll(async () => {
    ({ app } = await buildApp({ config: testConfig() }));
    for (const dir of [on, off]) await app.inject({ method: 'POST', url: '/api/prototypes', payload: { path: dir } });
  });
  afterAll(async () => {
    await app.close();
  });

  it('HTML (index, file lain, fallback SPA) disisipi; aset lain tidak; skrip tersedia', async () => {
    const { url } = (await app.inject({ method: 'POST', url: '/api/prototypes/embed-on/start' })).json() as { url: string };
    const index = await fetch(`${url}/`);
    const html = await index.text();
    expect(html).toBe(`<!doctype html><html><body><h1>Halo</h1>${EMBED_TAG_LIVE}</body></html>`);
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
