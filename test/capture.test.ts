import http from 'node:http';
import zlib from 'node:zlib';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  browserCandidates,
  createCapturer,
  exportFileName,
  findBrowser,
  parseExportQuery,
  parsePageState,
  type CaptureRequest,
  type Capturer,
} from '../src/core/capture.js';
import { buildApp } from '../src/server/app.js';
import type { PrototypeView } from '../src/core/views.js';
import { copyExample, testConfig } from './helpers.js';

const BASE = 'http://localhost:47100';

describe('findBrowser', () => {
  it('Windows: Edge di Program Files (x86) diutamakan, lalu Chrome', () => {
    const env = { 'PROGRAMFILES(X86)': 'C:\\PF86', PROGRAMFILES: 'C:\\PF', LOCALAPPDATA: 'C:\\U\\AppData\\Local' };
    const c = browserCandidates('win32', env);
    expect(c[0]).toBe('C:\\PF86\\Microsoft\\Edge\\Application\\msedge.exe');
    expect(c).toContain('C:\\U\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe');
    const has = new Set(['C:\\PF\\Google\\Chrome\\Application\\chrome.exe']);
    expect(findBrowser(env, 'win32', (p) => has.has(p))).toBe('C:\\PF\\Google\\Chrome\\Application\\chrome.exe');
    expect(findBrowser(env, 'win32', () => false)).toBeNull();
  });

  it('PROTOTYPER_BROWSER menimpa pencarian; Linux mencari di PATH', () => {
    expect(findBrowser({ PROTOTYPER_BROWSER: ' /opt/x/chrome ' }, 'linux', () => false)).toBe('/opt/x/chrome');
    const env = { PATH: ['/usr/bin', '/snap/bin'].join(path.delimiter) };
    expect(findBrowser(env, 'linux', (p) => p === '/snap/bin/chromium')).toBe('/snap/bin/chromium');
  });
});

describe('parseExportQuery', () => {
  it('default: PNG seluruh halaman 1280×800 pada 2×', () => {
    expect(parseExportQuery(BASE, {})).toEqual({
      page: '/',
      url: `${BASE}/`,
      format: 'png',
      width: 1280,
      height: 800,
      fullPage: true,
      scale: 2,
      mobile: false,
      paper: 'screen',
      wait: 500,
      colorScheme: null,
      state: null,
    });
  });

  it('jpg = jpeg, path & hash ikut, angka dibatasi', () => {
    const r = parseExportQuery(BASE, { format: 'JPG', path: '/kasir/#/bayar', width: '99999', height: '10', full: '0', mobile: 'true', scale: '9' });
    expect(r).toMatchObject({ format: 'jpeg', url: `${BASE}/kasir/#/bayar`, width: 3840, height: 240, fullPage: false, mobile: true, scale: 3 });
    expect(parseExportQuery(BASE, { format: 'pdf' }).scale).toBe(1);
  });

  it('menolak format/paper tak dikenal dan path di luar prototype', () => {
    expect(() => parseExportQuery(BASE, { format: 'gif' })).toThrow(/format/);
    expect(() => parseExportQuery(BASE, { paper: 'letter' })).toThrow(/paper/);
    expect(() => parseExportQuery(BASE, { width: 'abc' })).toThrow(/width/);
    for (const p of ['kasir', '//evil.test/x', '/\\evil.test', 'http://evil.test/']) {
      expect(() => parseExportQuery(BASE, { path: p }), p).toThrow(/path/);
    }
  });
});

describe('scheme & state', () => {
  it('scheme light/dark; state hanya class/style/data-* dan localStorage kecil', () => {
    const r = parseExportQuery(BASE, {
      scheme: 'dark',
      state: JSON.stringify({ html: { 'data-theme': 'dark', class: 'a b' }, body: {}, storage: { theme: 'dark' } }),
    });
    expect(r.colorScheme).toBe('dark');
    expect(r.state).toEqual({ html: { 'data-theme': 'dark', class: 'a b' }, body: {}, storage: { theme: 'dark' } });
    expect(() => parseExportQuery(BASE, { scheme: 'sepia' })).toThrow(/scheme/);
    expect(parsePageState(undefined)).toBeNull();
    expect(() => parsePageState('{x')).toThrow(/JSON/);
    expect(() => parsePageState(JSON.stringify({ html: { onload: 'alert(1)' } }))).toThrow(/onload/);
    expect(() => parsePageState(JSON.stringify({ storage: { a: 1 } }))).toThrow(/string/);
    expect(() => parsePageState(JSON.stringify({ storage: { a: 'x'.repeat(9000) } }))).toThrow(/besar/);
    expect(() => parsePageState(JSON.stringify({ storage: { a: 'x'.repeat(5000) }, session: { b: 'y'.repeat(5000) } }))).toThrow(/besar/);
    expect(parsePageState(JSON.stringify({ session: { 'pid-role': 'admin' } }))).toEqual({ session: { 'pid-role': 'admin' } });
  });
});

describe('exportFileName', () => {
  it('id + slug halaman + lebar', () => {
    expect(exportFileName('kasir-grosir', '/', 1280, 'png')).toBe('kasir-grosir_index_1280px.png');
    expect(exportFileName('kasir-grosir', '/Kasir/Bayar.html', 390, 'jpeg')).toBe('kasir-grosir_kasir-bayar_390px.jpg');
    expect(exportFileName('a', '/#/laporan?x=1', 820, 'pdf')).toBe('a_laporan-x-1_820px.pdf');
  });
});

describe('GET /api/prototypes/:id/export', () => {
  const calls: CaptureRequest[] = [];
  const fake: Capturer = async (r) => {
    calls.push(r);
    return { data: Buffer.from(`hasil-${r.format}`), truncated: r.format === 'pdf' };
  };
  let app: Awaited<ReturnType<typeof buildApp>>['app'];
  afterAll(async () => app?.close());

  it('butuh prototype berjalan, lalu merender halaman di port prototype', async () => {
    ({ app } = await buildApp({ config: testConfig(), capture: fake }));
    expect((await app.inject({ method: 'GET', url: '/api/prototypes/tidak-ada/export' })).statusCode).toBe(404);
    await app.inject({ method: 'POST', url: '/api/prototypes', payload: { path: copyExample('hello-static') } });

    const stopped = await app.inject({ method: 'GET', url: '/api/prototypes/hello-static/export' });
    expect(stopped.statusCode).toBe(409);
    expect(stopped.json().error.code).toBe('CONFLICT');

    const v = (await app.inject({ method: 'POST', url: '/api/prototypes/hello-static/start' })).json<PrototypeView>();
    const res = await app.inject({ method: 'GET', url: '/api/prototypes/hello-static/export?format=png&path=/kasir&width=390&height=844&mobile=1' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['content-disposition']).toBe('attachment; filename="hello-static_kasir_390px.png"');
    expect(res.headers['x-prototyper-truncated']).toBe('0');
    expect(res.body).toBe('hasil-png');
    expect(calls.at(-1)).toMatchObject({ url: `http://localhost:${v.port}/kasir`, width: 390, height: 844, mobile: true });

    const pdf = await app.inject({ method: 'GET', url: '/api/prototypes/hello-static/export?format=pdf&paper=a4' });
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.headers['x-prototyper-truncated']).toBe('1');

    const bad = await app.inject({ method: 'GET', url: '/api/prototypes/hello-static/export?path=//evil.test/' });
    expect(bad.statusCode).toBe(400);
  });
});

// Render sungguhan bila ada Edge/Chrome/Chromium di mesin ini (mis. Windows dev, runner CI).
const browser = findBrowser();
describe.skipIf(!browser)('createCapturer (browser sungguhan)', () => {
  const html = '<!doctype html><style>body{margin:0}section{height:700px;background:#5b5bf6}</style><section>Satu</section><section>Dua</section>';
  const tema =
    '<!doctype html><style>html{background:#fff}@media (prefers-color-scheme: dark){html{background:#000}}' +
    'html[data-theme=merah]{background:#f00}html[data-theme=biru]{background:#00f}</style>' +
    '<script>const t = localStorage.getItem("tema") || sessionStorage.getItem("tema"); if (t) document.documentElement.dataset.theme = t;</script><p></p>';
  const srv = http.createServer((q, r) => r.writeHead(200, { 'content-type': 'text/html' }).end(q.url === '/tema' ? tema : html));
  afterAll(() => srv.close());

  it('PNG seluruh halaman, JPG layar saja, dan PDF', async () => {
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
    const cap = createCapturer();
    const png = await cap(parseExportQuery(base, { width: '400', height: '300', scale: '1', wait: '0' }));
    expect(png.data.subarray(1, 4).toString()).toBe('PNG');
    expect(png.data.readUInt32BE(16)).toBe(400); // lebar
    expect(png.data.readUInt32BE(20)).toBeGreaterThanOrEqual(1400); // tinggi = seluruh halaman

    const jpg = await cap(parseExportQuery(base, { format: 'jpg', width: '400', height: '300', full: '0', wait: '0' }));
    expect(jpg.data.subarray(0, 2).toString('hex')).toBe('ffd8');

    const pdf = await cap(parseExportQuery(base, { format: 'pdf', wait: '0' }));
    expect(pdf.data.subarray(0, 5).toString()).toBe('%PDF-');
  }, 90_000);

  it('mengikuti skema warna & tema dari pratinjau', async () => {
    const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
    const cap = createCapturer();
    const color = async (extra: Record<string, string>) =>
      firstPixel((await cap(parseExportQuery(base, { path: '/tema', width: '300', height: '300', scale: '1', full: '0', wait: '0', ...extra }))).data);
    expect(await color({ scheme: 'light' })).toEqual([255, 255, 255]);
    expect(await color({ scheme: 'dark' })).toEqual([0, 0, 0]);
    // atribut tema <html> dari pratinjau dipasang lagi; localStorage tersedia sebelum skrip halaman
    expect(await color({ scheme: 'light', state: JSON.stringify({ html: { 'data-theme': 'merah' } }) })).toEqual([255, 0, 0]);
    expect(await color({ scheme: 'light', state: JSON.stringify({ storage: { tema: 'biru' } }) })).toEqual([0, 0, 255]);
    expect(await color({ scheme: 'light', state: JSON.stringify({ session: { tema: 'merah' } }) })).toEqual([255, 0, 0]);
  }, 90_000);
});

/** Warna RGB piksel kiri-atas dari PNG (8-bit RGB/RGBA, baris pertama). */
function firstPixel(png: Buffer): number[] {
  const idat: Buffer[] = [];
  for (let o = 8; o < png.length; ) {
    const len = png.readUInt32BE(o);
    if (png.toString('latin1', o + 4, o + 8) === 'IDAT') idat.push(png.subarray(o + 8, o + 8 + len));
    o += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  return [...raw.subarray(1, 4)]; // byte 0 = filter baris; piksel pertama tidak terpengaruh filter Sub/None
}
