import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { computeCodeHash, readCodeHash, resolveWebSwap, writeCurrent, type AppInfo } from '../src/core/apphost.js';
import { packFiles } from '../src/core/apppack.js';
import { installAppUpdate } from '../src/core/update.js';
import { buildApp } from '../src/server/app.js';
import { testConfig, tmpDir } from './helpers.js';

/** Pembaruan yang hanya mengubah web/: daemon pindah folder Web UI tanpa restart. */

const files = (version: string, o: { code?: string; html?: string } = {}): Array<[string, Buffer]> => [
  ['prototyper.cjs', Buffer.from(o.code ?? 'module.exports = 1;')],
  ['package.json', Buffer.from(JSON.stringify({ name: 'prototyper', version }))],
  ['schemas/x.json', Buffer.from('{}')],
  ['web/index.html', Buffer.from(o.html ?? `<html>${version}</html>`)],
  ['web/whatsnew.json', Buffer.from(`{"v":"${version}"}`)],
];

/** Folder aplikasi di app store lengkap dengan app.json ber-codeHash (seperti stampApp). */
function seedApp(root: string, version: string, o: { code?: string; html?: string; noHash?: boolean } = {}): AppInfo {
  const info: AppInfo = { id: `${version}-x`, version, runtime: 1 };
  const dir = path.join(root, info.id);
  const list = files(version, o);
  for (const [name, data] of list) {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    writeFileSync(path.join(dir, name), data);
  }
  writeFileSync(path.join(dir, 'app.json'), JSON.stringify(o.noHash ? info : { ...info, codeHash: computeCodeHash(list) }));
  return info;
}

describe('codeHash', () => {
  it('mengabaikan web/, app.json, dan versi di package.json; berubah bila kode berubah', () => {
    const a = computeCodeHash(files('0.4.0'));
    expect(computeCodeHash(files('0.4.1', { html: '<html>baru</html>' }))).toBe(a);
    expect(computeCodeHash([...files('0.4.0'), ['app.json', Buffer.from('{"id":"lain"}')]])).toBe(a);
    expect(computeCodeHash([...files('0.4.0')].reverse())).toBe(a); // urutan tidak berpengaruh
    expect(computeCodeHash(files('0.4.1', { code: 'module.exports = 2;' }))).not.toBe(a);
    expect(computeCodeHash([...files('0.4.0'), ['assets/tray/t.png', Buffer.from([1])]])).not.toBe(a);
    const pkg = files('0.4.0').map(([n, d]): [string, Buffer] => [n, n === 'package.json' ? Buffer.from('{"name":"lain","version":"0.4.0"}') : d]);
    expect(computeCodeHash(pkg)).not.toBe(a);
  });

  it('resolveWebSwap: hanya bila codeHash aplikasi berjalan & current.json sama', () => {
    const root = tmpDir('prototyper-store-');
    const running = seedApp(root, '0.4.0');
    const runningDir = path.join(root, running.id);
    expect(resolveWebSwap(root, runningDir, 1)).toMatchObject({ ok: false, reason: 'current.json tidak ada' });

    const webOnly = seedApp(root, '0.4.1', { html: '<html>baru</html>' });
    writeCurrent(root, { ...webOnly, previous: running });
    expect(resolveWebSwap(root, runningDir, 1)).toEqual({ ok: true, app: webOnly, webDir: path.join(root, webOnly.id, 'web') });
    expect(resolveWebSwap(root, runningDir, 2)).toMatchObject({ ok: false }); // runtime exe berbeda

    const code = seedApp(root, '0.4.2', { code: 'module.exports = 2;' });
    writeCurrent(root, { ...code, previous: running });
    expect(resolveWebSwap(root, runningDir, 1)).toMatchObject({ ok: false, reason: 'kode aplikasi berubah' });

    // aplikasi lama tanpa codeHash (≤ 0.3.2): selalu restart
    const old = seedApp(root, '0.3.2', { noHash: true });
    expect(readCodeHash(path.join(root, old.id))).toBeNull();
    writeCurrent(root, { ...webOnly, previous: null });
    expect(resolveWebSwap(root, path.join(root, old.id), 1)).toMatchObject({ ok: false, reason: 'codeHash tidak tersedia' });
  });

  it('installAppUpdate mempertahankan id di `keep` (sumber Web UI daemon)', async () => {
    const root = tmpDir('prototyper-store-');
    const embedded = seedApp(root, '0.4.0');
    const live = seedApp(root, '0.4.1');
    const stale = seedApp(root, '0.3.9');
    const next: AppInfo = { id: '0.4.2-x', version: '0.4.2', runtime: 1 };
    const pack = path.join(tmpDir('prototyper-dl-'), 'p.tar.gz');
    writeFileSync(pack, packFiles(new Map([...files('0.4.2'), ['app.json', Buffer.from(JSON.stringify(next))]])));
    await installAppUpdate(pack, { root, runtime: 1, active: embedded, embedded, keep: [live.id], verify: () => undefined });
    expect(existsSync(path.join(root, live.id))).toBe(true);
    expect(existsSync(path.join(root, stale.id))).toBe(false);
  });
});

describe('POST /api/app/reload-web', () => {
  let app: FastifyInstance | null = null;
  afterEach(async () => {
    await app?.close();
    app = null;
  });

  async function setup() {
    const root = tmpDir('prototyper-store-');
    const running = seedApp(root, '0.4.0');
    const appDir = path.join(root, running.id);
    ({ app } = await buildApp({
      config: testConfig(),
      web: { dir: path.join(appDir, 'web'), version: '0.4.0' },
      appHost: { root, appDir, runtime: 1 },
    }));
    return { root, running, app: app! };
  }

  it('memindahkan Web UI & versi health ke aplikasi baru tanpa restart', async () => {
    const { root, running, app } = await setup();
    expect((await app.inject({ url: '/' })).body).toBe('<html>0.4.0</html>');
    expect((await app.inject({ url: '/whatsnew.json' })).json()).toEqual({ v: '0.4.0' });

    const next = seedApp(root, '0.4.1');
    writeCurrent(root, { ...next, previous: running });
    const res = await app.inject({ method: 'POST', url: '/api/app/reload-web' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ version: '0.4.1', webDir: path.join(root, next.id, 'web') });

    expect((await app.inject({ url: '/' })).body).toBe('<html>0.4.1</html>');
    expect((await app.inject({ url: '/index.html' })).body).toBe('<html>0.4.1</html>');
    expect((await app.inject({ url: '/api/health' })).json().version).toBe('0.4.1');
    expect((await app.inject({ url: '/tidak-ada.js' })).statusCode).toBe(404);
    expect((await app.inject({ url: '/../package.json' })).statusCode).not.toBe(200);
  });

  it('menolak bila kode berubah (perlu restart) dan Web UI tetap yang lama', async () => {
    const { root, running, app } = await setup();
    const next = seedApp(root, '0.4.1', { code: 'module.exports = 2;' });
    writeCurrent(root, { ...next, previous: running });
    const res = await app.inject({ method: 'POST', url: '/api/app/reload-web' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.message).toMatch(/Perlu mulai ulang: kode aplikasi berubah/);
    expect((await app.inject({ url: '/' })).body).toBe('<html>0.4.0</html>');
  });

  it('di luar biner tunggal: tidak tersedia; Web UI bawaan tetap dilayani', async () => {
    ({ app } = await buildApp({ config: testConfig(), appHost: null }));
    expect((await app.inject({ method: 'POST', url: '/api/app/reload-web' })).statusCode).toBe(501);
    const home = await app.inject({ url: '/' });
    expect(home.statusCode).toBe(200);
    expect(home.body).toContain('<title>Prototyper</title>');
    expect((await app.inject({ url: '/api/tidak-ada' })).json().error.code).toBe('NOT_FOUND');
  });
});
