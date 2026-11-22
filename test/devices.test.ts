import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEVICE_COOKIE, DeviceStore, PAIRING_MAX_ATTEMPTS, PAIRING_TTL_MS, deviceNameFromUserAgent, readCookie } from '../src/core/devices.js';
import { hostAllowed, hostName } from '../src/server/access.js';
import { buildApp } from '../src/server/app.js';
import { makePrototype, testConfig, tmpDir } from './helpers.js';

const PHONE = '192.168.1.50';
const HOST = '192.168.1.10:4000';
const ORIGIN = `http://${HOST}`;
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

describe('DeviceStore', () => {
  it('pairing sekali pakai, token diverifikasi, hash saja yang disimpan, bisa dicabut', async () => {
    const home = tmpDir();
    const store = new DeviceStore(home);
    await store.load();
    await expect(store.pair('123456')).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const p = store.startPairing();
    expect(p.code).toMatch(/^\d{6}$/);
    const { device, token } = await store.pair(p.code, UA);
    expect(device.name).toBe('Android · Chrome');
    expect(store.activePairing()).toBeNull();
    await expect(store.pair(p.code)).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(store.verify(token)?.id).toBe(device.id);
    expect(store.verify(`${device.id}.salah`)).toBeNull();
    expect(store.verify('tanpa-titik')).toBeNull();
    expect(store.verify(undefined)).toBeNull();

    await store.flush();
    const raw = readFileSync(path.join(home, 'devices.json'), 'utf8');
    expect(raw).not.toContain(token.split('.')[1]);
    const again = new DeviceStore(home);
    await again.load();
    expect(again.verify(token)?.id).toBe(device.id);

    expect((await again.rename(device.id, '  HP saya ')).name).toBe('HP saya');
    await again.revoke(device.id);
    expect(again.verify(token)).toBeNull();
    await expect(again.revoke(device.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('kode kedaluwarsa dan dibatalkan setelah terlalu banyak tebakan salah', async () => {
    let t = 1_000_000;
    const store = new DeviceStore(tmpDir(), () => t);
    const p = store.startPairing();
    t += PAIRING_TTL_MS + 1;
    expect(store.activePairing()).toBeNull();
    await expect(store.pair(p.code)).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const q = store.startPairing();
    const wrong = q.code === '000000' ? '000001' : '000000';
    for (let i = 1; i < PAIRING_MAX_ATTEMPTS; i++) await expect(store.pair(wrong)).rejects.toThrow('Kode pairing salah');
    await expect(store.pair(wrong)).rejects.toThrow(/dibatalkan/);
    await expect(store.pair(q.code)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('nama dari User-Agent dan pembacaan cookie', () => {
    expect(deviceNameFromUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1')).toBe('iPhone · Safari');
    expect(deviceNameFromUserAgent(undefined)).toBe('Perangkat');
    expect(readCookie('a=1; prototyper_device=x.y%2Bz; b=2', DEVICE_COOKIE)).toBe('x.y+z');
    expect(readCookie('a=1', DEVICE_COOKIE)).toBeUndefined();
  });
});

describe('pemeriksaan Host', () => {
  it('IP, localhost, dan host tambahan diterima; domain lain ditolak', () => {
    expect(hostName('192.168.1.10:4000')).toBe('192.168.1.10');
    expect(hostName('[::1]:4000')).toBe('[::1]');
    expect(hostAllowed('localhost:4000')).toBe(true);
    expect(hostAllowed('127.0.0.1:4000')).toBe(true);
    expect(hostAllowed('[::1]:4000')).toBe(true);
    expect(hostAllowed('192.168.1.10:4000')).toBe(true);
    expect(hostAllowed('evil.example:4000')).toBe(false);
    expect(hostAllowed('laptop.tail1234.ts.net:4000', ['laptop.tail1234.ts.net'])).toBe(true);
    expect(hostAllowed(undefined)).toBe(false);
  });
});

describe('API pairing perangkat (mode LAN)', () => {
  let app: FastifyInstance;
  let cookie = '';
  let deviceId = '';
  const dir = makePrototype({ id: 'hp', name: 'HP', type: 'static' }, { 'index.html': '<p>x</p>' });
  const phone = (method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH', url: string, payload?: object, extra: Record<string, string> = {}) =>
    app.inject({
      method, url, remoteAddress: PHONE,
      headers: { host: HOST, ...(method === 'GET' ? {} : { origin: ORIGIN }), ...(cookie ? { cookie } : {}), ...extra },
      ...(payload ? { payload } : {}),
    });

  beforeAll(async () => {
    const config = { ...testConfig(), lanMode: 'all' as const, host: '0.0.0.0', prototypeHost: '0.0.0.0' };
    ({ app } = await buildApp({ config, lanAddresses: () => ['192.168.1.10'] }));
    expect((await app.inject({ method: 'POST', url: '/api/prototypes', payload: { path: dir } })).statusCode).toBe(201);
  });
  afterAll(async () => {
    await app.close();
  });

  it('hanya komputer ini yang bisa membuat kode pairing', async () => {
    expect((await phone('POST', '/api/devices/pairing')).statusCode).toBe(401);
    const r = await app.inject({ method: 'POST', url: '/api/devices/pairing' });
    expect(r.statusCode).toBe(200);
    const p = r.json();
    expect(p.code).toMatch(/^\d{6}$/);
    expect(p.targets).toEqual([{ url: `http://192.168.1.10:${testConfig().port}/pair?code=${p.code}`, qr: expect.stringContaining('<svg') }]);
    expect((await app.inject({ method: 'GET', url: '/api/devices' })).json().pairing).toEqual({ expiresAt: p.expiresAt });
    expect((await app.inject({ method: 'DELETE', url: '/api/devices/pairing' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/devices' })).json().pairing).toBeNull();
  });

  it('pairing lewat URL QR memasang cookie lalu mengalihkan ke Web UI', async () => {
    const bad = await phone('GET', '/pair?code=000000');
    expect(bad.statusCode).toBe(302);
    expect(bad.headers.location).toMatch(/^\/\?pair-error=/);

    const { code } = (await app.inject({ method: 'POST', url: '/api/devices/pairing' })).json();
    const ok = await phone('GET', `/pair?code=${code}`, undefined, { 'user-agent': UA });
    expect(ok.statusCode).toBe(302);
    expect(ok.headers.location).toBe('/');
    const set = String(ok.headers['set-cookie']);
    expect(set).toContain(`${DEVICE_COOKIE}=`);
    expect(set).toContain('HttpOnly');
    expect(set).toContain('SameSite=Strict');
    cookie = set.split(';')[0]!;

    const h = (await phone('GET', '/api/health')).json();
    expect(h).toMatchObject({ access: 'device', device: 'Android · Chrome' });
    const list = (await app.inject({ method: 'GET', url: '/api/devices' })).json().devices;
    expect(list).toHaveLength(1);
    deviceId = list[0].id;
    expect(list[0]).not.toHaveProperty('tokenHash');
  });

  it('perangkat terpasang: baca + alur komentar/agent, operasi lain tetap lokal', async () => {
    expect((await phone('GET', '/api/prototypes')).statusCode).toBe(200);
    const c = await phone('POST', '/api/prototypes/hp/comments', { text: 'Dari HP' });
    expect(c.statusCode).toBe(201);
    expect((await phone('POST', `/api/prototypes/hp/comments/${c.json().id}/replies`, { text: 'balas' })).statusCode).toBe(201);
    expect((await phone('POST', '/api/prototypes/hp/start')).statusCode).toBe(200);
    expect((await phone('POST', '/api/prototypes/hp/stop')).statusCode).toBe(200);

    for (const [m, url] of [
      ['DELETE', '/api/prototypes/hp'],
      ['PUT', '/api/prototypes/hp/manifest'],
      ['POST', '/api/prototypes'],
      ['POST', '/api/pick'],
      ['POST', '/api/update/install'],
      ['POST', '/api/shutdown'],
      ['POST', '/api/devices/pairing'],
      ['DELETE', `/api/devices/${deviceId}`],
    ] as const) {
      const r = await phone(m, url, {});
      expect(r.statusCode, `${m} ${url}`).toBe(403);
    }
    expect((await phone('GET', '/api/devices')).statusCode).toBe(403);
  });

  it('Origin harus sama dengan host (CSRF), dan Host tak dikenal ditolak (DNS rebinding)', async () => {
    expect((await phone('POST', '/api/prototypes/hp/comments', { text: 'x' }, { origin: 'http://192.168.1.10:4101' })).statusCode).toBe(403);
    const noOrigin = await app.inject({ method: 'POST', url: '/api/prototypes/hp/comments', remoteAddress: PHONE, headers: { host: HOST, cookie }, payload: { text: 'x' } });
    expect(noOrigin.statusCode).toBe(403);
    // dari komputer ini pun, halaman situs lain tidak boleh memicu operasi
    expect((await app.inject({ method: 'POST', url: '/api/prototypes/hp/start', headers: { origin: 'http://evil.example' } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/prototypes', headers: { host: 'evil.example:4000' } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/', headers: { host: 'evil.example:4000' } })).statusCode).toBe(200); // halaman statis tidak berisi data
    // CLI/tray tidak mengirim Origin
    expect((await app.inject({ method: 'POST', url: '/api/prototypes/hp/reload' })).statusCode).toBe(200);
  });

  it('pairing lewat kode yang diketik; akses hilang setelah dicabut', async () => {
    const saved = cookie;
    cookie = '';
    expect((await phone('POST', '/api/devices/pair', { code: '' })).statusCode).toBe(400);
    const { code } = (await app.inject({ method: 'POST', url: '/api/devices/pairing' })).json();
    const r = await phone('POST', '/api/devices/pair', { code });
    expect(r.statusCode).toBe(200);
    const second = String(r.headers['set-cookie']).split(';')[0]!;
    expect((await app.inject({ method: 'POST', url: '/api/devices/pair', payload: { code } })).statusCode).toBe(400); // lokal tak perlu

    cookie = saved;
    expect((await app.inject({ method: 'DELETE', url: `/api/devices/${deviceId}` })).statusCode).toBe(200);
    expect((await phone('GET', '/api/prototypes')).statusCode).toBe(401);
    cookie = second;
    expect((await phone('GET', '/api/prototypes')).statusCode).toBe(200);
  });

  it('pairing butuh mode LAN Web UI', async () => {
    const built = await buildApp({ config: testConfig() });
    try {
      const r = await built.app.inject({ method: 'POST', url: '/api/devices/pairing' });
      expect(r.statusCode).toBe(409);
      expect(r.json().error.message).toContain('mode LAN');
    } finally {
      await built.app.close();
    }
  });
});
