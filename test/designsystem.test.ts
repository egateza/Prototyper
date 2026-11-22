import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  detachDesignSystem,
  detectLocalCandidates,
  injectImports,
  injectLinks,
  listDesignSystems,
  listLocalDesignSystems,
  setLocalDesignSystem,
  syncDesignSystem,
  useDesignSystem,
} from '../src/core/designsystem.js';
import { dsLabel } from '../src/cli/output.js';
import type { PrototypeView } from '../src/core/views.js';
import { loadManifest, parseManifest } from '../src/core/manifest.js';
import { Registry } from '../src/core/registry.js';
import { createPrototype } from '../src/core/scaffold.js';
import { buildApp } from '../src/server/app.js';
import { designSystemTemplateFiles } from '../src/core/dstemplate.js';
import { copyExample, EXAMPLES, testConfig, tmpDir } from './helpers.js';

const read = (...p: string[]) => readFileSync(path.join(...p), 'utf8');

async function setup() {
  const reg = new Registry(tmpDir());
  const workspace = tmpDir('prototyper-ws-');
  const ds = await createPrototype(reg, { id: 'brand-ds', name: 'Brand DS', template: 'design-system', workspace });
  return { reg, workspace, ds };
}

describe('manifest designSystem', () => {
  const base = { id: 'abc', name: 'A', type: 'static' };
  it('menerima source atau use, menolak kombinasi yang salah', () => {
    expect(parseManifest({ ...base, designSystem: { source: true } }).designSystem?.source).toBe(true);
    expect(parseManifest({ ...base, designSystem: { use: 'brand-ds', dir: 'ds' } }).designSystem?.dir).toBe('ds');
    for (const bad of [
      { source: true, use: 'x-y' },
      { use: 'brand-ds', files: ['a.css'] },
      { source: true, dir: 'ds' },
      {},
      { use: 'brand-ds', dir: '../luar' },
    ]) {
      expect(() => parseManifest({ ...base, designSystem: bad })).toThrow();
    }
  });
});

describe('template design-system', () => {
  it('membuat token, komponen, katalog, dan manifest source', async () => {
    const { ds } = await setup();
    const dir = ds.prototype.path;
    expect(ds.files).toEqual(
      ['AGENTS.md', 'CLAUDE.md', 'catalog.css', 'catalog.js', 'components.css', 'index.html', 'prototyper.json', 'tokens.css'],
    );
    expect((await loadManifest(dir)).designSystem).toEqual({ source: true });
    expect(read(dir, 'tokens.css')).toContain('--color-primary:');
    expect(read(dir, 'tokens.css')).toContain(':root[data-theme="dark"]');
    expect(read(dir, 'components.css')).toContain('.btn-primary');
    expect(read(dir, 'index.html')).toContain('href="tokens.css"');
    const agents = read(dir, 'AGENTS.md');
    expect(agents).toContain('### Desain sistem');
    expect(agents).toContain('prototyper ds sync brand-ds');
  });

  it('folder default: desain sistem di dsWorkspace, prototype di workspace; --dir tetap menang', async () => {
    const reg = new Registry(tmpDir());
    const workspace = tmpDir('prototyper-ws-');
    const dsWorkspace = tmpDir('prototyper-dsws-');
    const ds = await createPrototype(reg, { id: 'pisah-ds', template: 'design-system', workspace, dsWorkspace });
    expect(ds.prototype.path).toBe(path.join(dsWorkspace, 'pisah-ds'));
    const p = await createPrototype(reg, { id: 'pisah-proto', designSystem: 'pisah-ds', workspace, dsWorkspace });
    expect(p.prototype.path).toBe(path.join(workspace, 'pisah-proto'));
    const own = path.join(tmpDir('prototyper-own-'), 'ds-lain');
    const d2 = await createPrototype(reg, { id: 'ds-lain', template: 'design-system', dir: own, workspace, dsWorkspace });
    expect(d2.prototype.path).toBe(own);
  });

  it('menolak --design-system pada template design-system dan desain sistem yang tidak ada', async () => {
    const { reg, workspace } = await setup();
    await expect(createPrototype(reg, { id: 'ds-2', template: 'design-system', designSystem: 'brand-ds', workspace }))
      .rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(createPrototype(reg, { id: 'pakai', designSystem: 'tidak-ada', workspace })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(existsSync(path.join(workspace, 'pakai'))).toBe(false);
  });
});

describe('memakai desain sistem', () => {
  it('prototype baru static: file disalin, <link> sebelum style.css, kelas komponen, petunjuk agent', async () => {
    const { reg, workspace } = await setup();
    const r = await createPrototype(reg, { id: 'kasir', designSystem: 'brand-ds', workspace });
    const dir = r.prototype.path;
    expect(r.files).toContain('design-system/tokens.css');
    expect(r.prototype.manifest?.designSystem).toEqual({ use: 'brand-ds' });
    const tokens = read(dir, 'design-system', 'tokens.css');
    expect(tokens.startsWith('/* Disalin dari desain sistem "brand-ds"')).toBe(true);
    expect(tokens).toContain('--color-primary:');
    const html = read(dir, 'index.html');
    const iTok = html.indexOf('href="design-system/tokens.css"');
    const iCmp = html.indexOf('href="design-system/components.css"');
    expect(iTok).toBeGreaterThan(0);
    expect(iTok).toBeLessThan(iCmp);
    expect(iCmp).toBeLessThan(html.indexOf('href="style.css"'));
    expect(html).toContain('class="btn btn-primary"');
    const agents = read(dir, 'AGENTS.md');
    expect(agents).toContain('memakai desain sistem **brand-ds**');
    expect(agents).toContain('Jangan mengedit file di `design-system/`');
  });

  it('prototype vite: impor CSS di awal entry', async () => {
    const { reg, workspace } = await setup();
    const r = await createPrototype(reg, { id: 'vite-ds', template: 'vite-react', designSystem: 'brand-ds', workspace });
    const main = read(r.prototype.path, 'src', 'main.jsx');
    expect(main.startsWith("import '../design-system/tokens.css';\nimport '../design-system/components.css';\n")).toBe(true);
    expect(read(r.prototype.path, 'src', 'App.jsx')).toContain('className="btn btn-primary"');
    expect(r.designSystem?.link).toMatchObject({ file: 'src/main.jsx', action: 'added' });
  });

  it('ds use pada prototype yang sudah ada: idempoten, --dir, dan validasi', async () => {
    const { reg, workspace } = await setup();
    await createPrototype(reg, { id: 'lama', workspace });
    const a = await useDesignSystem(reg, 'lama', 'brand-ds', { dir: 'ui/ds' });
    expect(a.files.map((f) => [f.file, f.action])).toEqual([['ui/ds/tokens.css', 'created'], ['ui/ds/components.css', 'created']]);
    expect(a.link).toMatchObject({ file: 'index.html', action: 'added' });
    const b = await useDesignSystem(reg, 'lama', 'brand-ds');
    expect(b.dir).toBe('ui/ds'); // dir lama dipertahankan
    expect(b.files.every((f) => f.action === 'unchanged')).toBe(true);
    expect(b.link.action).toBe('present');
    expect((await loadManifest(path.join(workspace, 'lama'))).designSystem).toEqual({ use: 'brand-ds', dir: 'ui/ds' });

    await expect(useDesignSystem(reg, 'brand-ds', 'brand-ds')).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(useDesignSystem(reg, 'lama', 'lama')).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(useDesignSystem(reg, 'lama', 'tidak-ada')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(useDesignSystem(reg, 'lama', 'brand-ds', { dir: '../luar' })).rejects.toMatchObject({ code: 'INVALID_MANIFEST' });
  });

  it('sync: deteksi perubahan, sebarkan ke semua pemakai, lalu detach', async () => {
    const { reg, workspace, ds } = await setup();
    await createPrototype(reg, { id: 'satu', designSystem: 'brand-ds', workspace });
    await createPrototype(reg, { id: 'dua', designSystem: 'brand-ds', workspace });
    let [info] = await listDesignSystems(reg);
    expect(info?.consumers.map((c) => [c.id, c.outdated])).toEqual([['satu', false], ['dua', false]]);

    writeFileSync(path.join(ds.prototype.path, 'tokens.css'), ':root { --color-primary: #e11d48; }\n');
    [info] = await listDesignSystems(reg);
    expect(info?.consumers.every((c) => c.outdated)).toBe(true);
    expect(info?.consumers[0]?.files).toContainEqual({ file: 'design-system/tokens.css', state: 'outdated' });

    const one = await syncDesignSystem(reg, 'satu');
    expect(one.map((r) => r.id)).toEqual(['satu']);
    expect(one[0]?.files.find((f) => f.file === 'design-system/tokens.css')?.action).toBe('updated');

    const all = await syncDesignSystem(reg, 'brand-ds');
    expect(all.map((r) => [r.id, r.files.filter((f) => f.action === 'updated').length])).toEqual([['satu', 0], ['dua', 1]]);
    expect(read(workspace, 'dua', 'design-system', 'tokens.css')).toContain('#e11d48');

    const d = await detachDesignSystem(reg, 'dua');
    expect(d).toMatchObject({ id: 'dua', designSystem: 'brand-ds', dir: 'design-system' });
    expect((await loadManifest(path.join(workspace, 'dua'))).designSystem).toBeUndefined();
    expect(existsSync(path.join(workspace, 'dua', 'design-system', 'tokens.css'))).toBe(true);
    expect(read(workspace, 'dua', 'AGENTS.md')).not.toContain('### Desain sistem');
    await expect(syncDesignSystem(reg, 'dua')).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('desain sistem sendiri (local)', () => {
  it('manifest: local tidak boleh digabung dengan source/use', () => {
    const base = { id: 'abc', name: 'A', type: 'static' };
    expect(parseManifest({ ...base, designSystem: { local: ['src/tokens.css'] } }).designSystem?.local).toEqual(['src/tokens.css']);
    expect(() => parseManifest({ ...base, designSystem: { local: ['a.css'], use: 'x-y' } })).toThrow();
    expect(() => parseManifest({ ...base, designSystem: { local: ['a.css'], source: true } })).toThrow();
    expect(() => parseManifest({ ...base, designSystem: { local: [] } })).toThrow();
    expect(() => parseManifest({ ...base, designSystem: { local: ['../luar.css'] } })).toThrow();
  });

  it('deteksi kandidat, catat lokasi, ganti use → local, status, lalu lepas', async () => {
    const { reg, workspace } = await setup();
    const r0 = await createPrototype(reg, { id: 'punya-sendiri', designSystem: 'brand-ds', workspace });
    const dir = r0.prototype.path;
    for (const f of ['src/styles/tokens.css', 'src/styles/base.css', 'theme.json', 'node_modules/x/tokens.css']) {
      const abs = path.join(dir, ...f.split('/'));
      mkdirSync(path.dirname(abs), { recursive: true });
      writeFileSync(abs, ':root{}');
    }
    const cands = await detectLocalCandidates(dir);
    expect(cands).toEqual(['theme.json', 'src/styles/tokens.css', 'src/styles']); // salinan design-system/ & node_modules dilewati

    const r = await setLocalDesignSystem(reg, 'punya-sendiri', ['src/styles/tokens.css', 'src\\komponen', 'src/styles/tokens.css']);
    expect(r).toMatchObject({ local: ['src/styles/tokens.css', 'src/komponen'], missing: ['src/komponen'], replaced: 'brand-ds' });
    expect((await loadManifest(dir)).designSystem).toEqual({ local: ['src/styles/tokens.css', 'src/komponen'] });
    const agents = read(dir, 'AGENTS.md');
    expect(agents).toContain('punya desain sistem sendiri di `src/styles/tokens.css`, `src/komponen`');
    expect(agents).not.toContain('memakai desain sistem **brand-ds**');

    const [st] = await listLocalDesignSystems(reg);
    expect(st?.paths).toEqual([
      { path: 'src/styles/tokens.css', exists: true, kind: 'file' },
      { path: 'src/komponen', exists: false, kind: null },
    ]);
    const [info] = await listDesignSystems(reg);
    expect(info?.consumers).toEqual([]); // bukan pemakai brand-ds lagi
    await expect(syncDesignSystem(reg, 'punya-sendiri')).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(setLocalDesignSystem(reg, 'brand-ds', ['tokens.css'])).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(setLocalDesignSystem(reg, 'punya-sendiri', ['  '])).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    const d = await detachDesignSystem(reg, 'punya-sendiri');
    expect(d).toMatchObject({ designSystem: null, dir: null, local: ['src/styles/tokens.css', 'src/komponen'] });
    expect(existsSync(path.join(dir, 'src', 'styles', 'tokens.css'))).toBe(true);
    expect((await loadManifest(dir)).designSystem).toBeUndefined();
    await expect(detachDesignSystem(reg, 'brand-ds')).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('kolom DS di prototyper list', () => {
    const v = (designSystem?: unknown) => ({ manifest: designSystem ? { designSystem } : {} }) as unknown as PrototypeView;
    expect([v({ source: true }), v({ use: 'brand-ds' }), v({ local: ['a.css'] }), v()].map(dsLabel)).toEqual(['desain sistem', '→ brand-ds', 'sendiri', '-']);
  });
});

/** Nama custom property yang didefinisikan / dipakai di sebuah CSS. */
const defined = (css: string) => new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
const used = (css: string) => new Set([...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]));

describe('contoh examples/sembako-ds', () => {
  it('semua token yang dipakai komponen & katalog terdefinisi (contoh dan template)', () => {
    const sources = [
      { tokens: read(EXAMPLES, 'sembako-ds', 'tokens.css'), others: ['components.css', 'catalog.css', 'index.html'].map((f) => read(EXAMPLES, 'sembako-ds', f)) },
      (() => { const f = designSystemTemplateFiles('x'); return { tokens: f['tokens.css'] ?? '', others: [f['components.css'] ?? '', f['catalog.css'] ?? '', f['index.html'] ?? ''] }; })(),
    ];
    for (const { tokens, others } of sources) {
      const have = defined(tokens);
      const missing = others.flatMap((css) => [...used(css)].filter((v) => !have.has(v)));
      expect(missing).toEqual([]);
    }
  });

  it('terdaftar sebagai desain sistem dan bisa dipasang ke hello-static', async () => {
    const reg = new Registry(tmpDir());
    const ds = await reg.add(copyExample('sembako-ds'));
    expect(ds.manifest?.designSystem).toEqual({ source: true });
    const hello = await reg.add(copyExample('hello-static'));
    const r = await useDesignSystem(reg, 'hello-static', 'sembako-ds');
    expect(r.files.map((f) => f.action)).toEqual(['created', 'created']);
    expect(r.link).toMatchObject({ file: 'index.html', action: 'added' });
    expect(read(hello.path, 'design-system', 'tokens.css')).toContain('--color-accent');
    expect(read(hello.path, 'index.html')).toContain('href="design-system/components.css"');
    const [info] = await listDesignSystems(reg);
    expect(info).toMatchObject({ id: 'sembako-ds', missing: [], consumers: [{ id: 'hello-static', outdated: false }] });
  });
});

describe('injectLinks / injectImports', () => {
  it('menyisipkan sebelum stylesheet pertama dengan indentasi yang sama', () => {
    const html = '<head>\n    <title>x</title>\n    <link rel="stylesheet" href="a.css">\n</head>';
    expect(injectLinks(html, ['ds/t.css'])).toBe('<head>\n    <title>x</title>\n    <link rel="stylesheet" href="ds/t.css">\n    <link rel="stylesheet" href="a.css">\n</head>');
  });
  it('tanpa stylesheet: sebelum </head>; tanpa head: di awal; sudah ada: tidak berubah', () => {
    expect(injectLinks('<head>\n<title>x</title>\n</head>', ['t.css'])).toBe('<head>\n<title>x</title>\n  <link rel="stylesheet" href="t.css">\n</head>');
    expect(injectLinks('<p>x</p>', ['t.css'])).toBe('<link rel="stylesheet" href="t.css">\n<p>x</p>');
    const done = '<head><link rel="stylesheet" href="t.css"></head>';
    expect(injectLinks(done, ['t.css'])).toBe(done);
    expect(injectLinks('<head><title>x</title></head>', ['t.css'])).toBe('<head><title>x</title><link rel="stylesheet" href="t.css"></head>');
  });
  it('mempertahankan CRLF', () => {
    expect(injectLinks('<head>\r\n  <link rel="stylesheet" href="a.css">\r\n</head>', ['t.css'])).toBe(
      '<head>\r\n  <link rel="stylesheet" href="t.css">\r\n  <link rel="stylesheet" href="a.css">\r\n</head>',
    );
  });
  it('impor hanya yang belum ada', () => {
    expect(injectImports("import './x.css';\n", ['./x.css', '../ds/t.css'])).toBe("import '../ds/t.css';\nimport './x.css';\n");
  });
});

describe('API desain sistem', () => {
  let app: FastifyInstance;
  const config = testConfig();

  beforeAll(async () => {
    ({ app } = await buildApp({ config }));
  });
  afterAll(async () => {
    await app.close();
  });

  it('new dengan designSystem, list, sync, use, dan detach', async () => {
    const mk = await app.inject({ method: 'POST', url: '/api/prototypes/new', payload: { id: 'api-ds', template: 'design-system' } });
    expect(mk.statusCode).toBe(201);
    const p = await app.inject({ method: 'POST', url: '/api/prototypes/new', payload: { id: 'api-pakai', designSystem: 'api-ds' } });
    expect(p.statusCode).toBe(201);
    expect(p.json().designSystem).toMatchObject({ designSystem: 'api-ds', dir: 'design-system' });
    expect(p.json().manifest.designSystem).toEqual({ use: 'api-ds' });

    const list = (await app.inject({ method: 'GET', url: '/api/design-systems' })).json();
    expect(list.designSystems).toHaveLength(1);
    expect(list.designSystems[0]).toMatchObject({ id: 'api-ds', consumers: [{ id: 'api-pakai', outdated: false }] });

    const sync = await app.inject({ method: 'POST', url: '/api/prototypes/api-ds/design-system/sync' });
    expect(sync.json().results).toEqual([expect.objectContaining({ id: 'api-pakai', error: null })]);

    await app.inject({ method: 'POST', url: '/api/prototypes/new', payload: { id: 'api-lain' } });
    const use = await app.inject({ method: 'PUT', url: '/api/prototypes/api-lain/design-system', payload: { id: 'api-ds' } });
    expect(use.statusCode).toBe(200);
    expect(use.json().prototype.manifest.designSystem).toEqual({ use: 'api-ds' });
    const bad = await app.inject({ method: 'PUT', url: '/api/prototypes/api-lain/design-system', payload: {} });
    expect(bad.statusCode).toBe(400);

    const del = await app.inject({ method: 'DELETE', url: '/api/prototypes/api-lain/design-system' });
    expect(del.statusCode).toBe(200);
    expect(del.json().prototype.manifest.designSystem).toBeUndefined();

    const lan = await app.inject({ method: 'PUT', url: '/api/prototypes/api-lain/design-system', remoteAddress: '192.168.1.5', payload: { id: 'api-ds' } });
    expect(lan.statusCode).toBe(403);

    // Desain sistem sendiri
    const cands = await app.inject({ method: 'GET', url: '/api/prototypes/api-lain/design-system/candidates' });
    expect(cands.json()).toEqual({ id: 'api-lain', candidates: [] }); // folder salinan design-system/ tidak dihitung
    const loc = await app.inject({ method: 'PUT', url: '/api/prototypes/api-lain/design-system', payload: { local: ['style.css'] } });
    expect(loc.statusCode).toBe(200);
    expect(loc.json()).toMatchObject({ local: ['style.css'], missing: [], prototype: { manifest: { designSystem: { local: ['style.css'] } } } });
    const badLocal = await app.inject({ method: 'PUT', url: '/api/prototypes/api-lain/design-system', payload: { local: 'style.css' } });
    expect(badLocal.statusCode).toBe(400);
    const all = (await app.inject({ method: 'GET', url: '/api/design-systems' })).json();
    expect(all.locals).toEqual([{ id: 'api-lain', name: 'api-lain', paths: [{ path: 'style.css', exists: true, kind: 'file' }] }]);
  });
});
