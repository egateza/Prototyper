import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EMBED_TAG, EMBED_TAG_LIVE, injectEmbedTag } from '../src/core/embed.js';
import { isIgnoredChange, LIVERELOAD_PATH, reloadKind } from '../src/core/livereload.js';
import { buildApp } from '../src/server/app.js';
import { makePrototype, testConfig } from './helpers.js';

describe('aturan live-reload', () => {
  it('file yang diabaikan', () => {
    for (const f of ['.prototyper/comments.json', 'a\\.git\\index', 'node_modules/x/y.js', 'NODE_MODULES/z', 'index.html~', '.index.html.swp', 'x.tmp', '.#index.html', '#a.html#']) {
      expect(isIgnoredChange(f), f).toBe(true);
    }
    for (const f of ['index.html', 'css/app.css', 'img/logo.png', 'prototyper.json', '.well-known/x']) expect(isIgnoredChange(f), f).toBe(false);
  });

  it('css saja → ganti stylesheet; selain itu muat ulang penuh', () => {
    expect(reloadKind(['a.css', 'b/C.CSS'])).toBe('css');
    expect(reloadKind(['a.css', 'index.html'])).toBe('reload');
    expect(reloadKind(['a.css', null])).toBe('reload');
    expect(reloadKind([])).toBe('reload');
  });

  it('tag embed membawa data-livereload bila diminta', () => {
    expect(injectEmbedTag('<body></body>', { liveReload: true })).toBe(`<body>${EMBED_TAG_LIVE}</body>`);
    expect(injectEmbedTag('<body></body>')).toBe(`<body>${EMBED_TAG}</body>`);
  });
});

/** Baca aliran SSE sampai `pred` terpenuhi atau batas waktu habis. */
async function openStream(url: string) {
  const ctrl = new AbortController();
  const res = await fetch(url, { signal: ctrl.signal });
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  const readUntil = async (pred: (s: string) => boolean, ms = 4000): Promise<string> => {
    const deadline = Date.now() + ms;
    while (!pred(buf)) {
      const left = deadline - Date.now();
      if (left <= 0) throw new Error(`timeout; diterima: ${JSON.stringify(buf)}`);
      const r = await Promise.race([reader.read(), new Promise<null>((res) => setTimeout(() => res(null), left))]);
      if (r === null) continue;
      if (r.done) break;
      buf += decoder.decode(r.value, { stream: true });
    }
    return buf;
  };
  return {
    res,
    readUntil,
    take: () => {
      const s = buf;
      buf = '';
      return s;
    },
    close: () => ctrl.abort(),
    ended: async () => {
      for (;;) {
        const r = await reader.read();
        if (r.done) return true;
      }
    },
  };
}

describe('server static: live-reload', () => {
  let app: FastifyInstance;
  const on = makePrototype(
    { id: 'lr-on', name: 'LR', type: 'static' },
    { 'index.html': '<!doctype html><html><body><h1>Halo</h1></body></html>', 'style.css': 'body{}' },
  );
  const off = makePrototype({ id: 'lr-off', name: 'LR off', type: 'static', static: { liveReload: false } }, { 'index.html': '<body>x</body>' });

  beforeAll(async () => {
    ({ app } = await buildApp({ config: testConfig() }));
    for (const dir of [on, off]) await app.inject({ method: 'POST', url: '/api/prototypes', payload: { path: dir } });
  });
  afterAll(async () => {
    await app.close();
  });

  it('perubahan file dikirim lewat SSE; .prototyper diabaikan; stop menutup aliran', async () => {
    const { url } = (await app.inject({ method: 'POST', url: '/api/prototypes/lr-on/start' })).json() as { url: string };
    expect(await (await fetch(`${url}/`)).text()).toContain(EMBED_TAG_LIVE);

    const s = await openStream(`${url}${LIVERELOAD_PATH}`);
    expect(s.res.headers.get('content-type')).toContain('text/event-stream');
    await s.readUntil((b) => b.includes('retry:'));
    s.take();

    // Data Prototyper tidak memicu apa pun; perubahan HTML memicu muat ulang penuh.
    mkdirSync(path.join(on, '.prototyper'), { recursive: true });
    writeFileSync(path.join(on, '.prototyper', 'comments.json'), '[]');
    await new Promise((r) => setTimeout(r, 400));
    expect(s.take()).not.toContain('event:');

    writeFileSync(path.join(on, 'index.html'), '<body><h1>Baru</h1></body>');
    const ev = await s.readUntil((b) => b.includes('\n\n') && b.includes('event:'));
    expect(ev).toContain('event: reload');
    expect(ev).toContain('index.html');
    expect(ev).not.toContain('.prototyper');
    await new Promise((r) => setTimeout(r, 300));
    s.take();

    writeFileSync(path.join(on, 'style.css'), 'body{color:red}');
    expect(await s.readUntil((b) => b.includes('event:'))).toContain('event: css');

    const logs = (await app.inject({ method: 'GET', url: '/api/prototypes/lr-on/logs?tail=50' })).json();
    expect(logs.lines.map((l: { line: string }) => l.line).join('\n')).toMatch(/live-reload.*index\.html/);

    await app.inject({ method: 'POST', url: '/api/prototypes/lr-on/stop' });
    expect(await Promise.race([s.ended(), new Promise((r) => setTimeout(() => r(false), 3000))])).toBe(true);
  });

  it('static.liveReload: false → tag tanpa data-livereload, endpoint tidak ada', async () => {
    const { url } = (await app.inject({ method: 'POST', url: '/api/prototypes/lr-off/start' })).json() as { url: string };
    const html = await (await fetch(`${url}/`)).text();
    expect(html).toContain(EMBED_TAG);
    expect(html).not.toContain('data-livereload');
    expect((await fetch(`${url}${LIVERELOAD_PATH}`)).status).toBe(404);
    await app.inject({ method: 'POST', url: '/api/prototypes/lr-off/stop' });
  });
});
