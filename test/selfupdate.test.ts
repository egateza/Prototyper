import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/server/app.js';
import { runSelfUpdate, UpdateChecker, type SelfUpdateDeps } from '../src/core/selfupdate.js';
import type { ReleaseAsset, UpdateCheck, UpdateKind } from '../src/core/update.js';
import { VERSION } from '../src/version.js';
import { testConfig } from './helpers.js';

const asset = (name: string): ReleaseAsset => ({ name, url: `https://example.invalid/${name}`, size: 1 });

function fakeCheck(o: { current?: string; latest?: string; kind?: UpdateKind | null } = {}): UpdateCheck {
  const current = o.current ?? '0.3.0';
  const latest = o.latest ?? '0.4.0';
  const kind = o.kind === undefined ? 'app' : o.kind;
  return {
    current,
    latest: { version: latest, tag: `v${latest}`, pageUrl: `https://github.com/x/y/releases/tag/v${latest}`, assets: [] },
    available: latest !== current,
    asset: kind ? asset(`berkas-${kind}`) : null,
    kind,
    checksums: asset('SHA256SUMS.txt'),
  };
}

function fakeDeps(check: UpdateCheck, o: { daemon?: boolean; tray?: number | null; failInstall?: boolean } = {}) {
  const calls: string[] = [];
  const deps: SelfUpdateDeps = {
    check: async () => check,
    download: async () => {
      calls.push('download');
      return 'C:/tmp/berkas';
    },
    daemon: async () => (o.daemon ? { running: ['a', 'b'], lanMode: 'prototypes' } : null),
    shutdownDaemon: async () => void calls.push('shutdown'),
    trayPid: () => o.tray ?? null,
    killTray: (pid) => void calls.push(`killTray:${pid}`),
    install: async (_f, _c, restore) => {
      calls.push(`install:${restore.join(',')}`);
      if (o.failInstall) throw new Error('rusak');
    },
    spawnTray: (restore) => void calls.push(`tray:${restore.join(',')}`),
    startDaemon: async (lan, restore) => void calls.push(`daemon:${lan}:${restore.join(',')}`),
    log: () => undefined,
  };
  return { deps, calls };
}

describe('runSelfUpdate', () => {
  it('sudah terbaru: tidak mengunduh apa pun', async () => {
    const { deps, calls } = fakeDeps(fakeCheck({ latest: '0.3.0' }));
    const r = await runSelfUpdate(deps, { install: true });
    expect(r.status).toBe('uptodate');
    expect(calls).toEqual([]);
  });

  it('--check: hanya melapor', async () => {
    const { deps, calls } = fakeDeps(fakeCheck());
    const r = await runSelfUpdate(deps, { install: false });
    expect(r).toMatchObject({ status: 'available', current: '0.3.0', latest: '0.4.0', kind: 'app' });
    expect(calls).toEqual([]);
  });

  it('tanpa berkas yang cocok (npm/source): manual', async () => {
    const { deps, calls } = fakeDeps(fakeCheck({ kind: null }));
    expect((await runSelfUpdate(deps, { install: true })).status).toBe('manual');
    expect(calls).toEqual([]);
  });

  it('tray berjalan: daemon dihentikan dulu, lalu tray; tray dinyalakan lagi dengan prototype yang tadi berjalan', async () => {
    const { deps, calls } = fakeDeps(fakeCheck(), { daemon: true, tray: 42 });
    const r = await runSelfUpdate(deps, { install: true });
    expect(r).toMatchObject({ status: 'installed', restarted: 'tray', restore: ['a', 'b'] });
    expect(calls).toEqual(['download', 'shutdown', 'killTray:42', 'install:a,b', 'tray:a,b']);
  });

  it('hanya daemon: dinyalakan lagi dengan mode LAN yang sama', async () => {
    const { deps, calls } = fakeDeps(fakeCheck({ kind: 'exe' }), { daemon: true });
    const r = await runSelfUpdate(deps, { install: true });
    expect(r.restarted).toBe('daemon');
    expect(calls).toEqual(['download', 'shutdown', 'install:a,b', 'daemon:prototypes:a,b']);
  });

  it('MSI: installer yang menyalakan lagi', async () => {
    const { deps, calls } = fakeDeps(fakeCheck({ kind: 'msi' }), { daemon: true, tray: 7 });
    const r = await runSelfUpdate(deps, { install: true });
    expect(r.restarted).toBe('installer');
    expect(calls).toEqual(['download', 'shutdown', 'killTray:7', 'install:a,b']);
  });

  it('gagal memasang: keadaan semula dipulihkan lalu error', async () => {
    const { deps, calls } = fakeDeps(fakeCheck(), { daemon: true, tray: 9, failInstall: true });
    await expect(runSelfUpdate(deps, { install: true })).rejects.toThrow(/Gagal memasang pembaruan: rusak/);
    expect(calls.at(-1)).toBe('tray:a,b');
  });
});

describe('UpdateChecker', () => {
  it('menyimpan hasil (cache) dan memeriksa lagi bila kedaluwarsa atau diminta', async () => {
    let now = 0;
    let n = 0;
    const c = new UpdateChecker({
      enabled: true,
      mode: 'sea',
      version: () => '0.3.0',
      check: async () => (n++, fakeCheck()),
      ttlMs: 1000,
      now: () => now,
    });
    const i = await c.info();
    expect(i).toMatchObject({ available: true, latest: '0.4.0', autoInstall: true, kind: 'app', hint: null });
    await c.info();
    expect(n).toBe(1);
    await c.info(true);
    expect(n).toBe(2);
    now = 5000;
    await c.info();
    expect(n).toBe(3);
  });

  it('pemeriksaan otomatis mati: tidak menghubungi GitHub kecuali diminta', async () => {
    let n = 0;
    const c = new UpdateChecker({ enabled: false, mode: 'dist', version: () => '0.3.0', check: async () => (n++, fakeCheck({ kind: null })) });
    expect(await c.info()).toMatchObject({ enabled: false, latest: null, available: false });
    expect(n).toBe(0);
    expect(await c.info(true)).toMatchObject({ available: true, autoInstall: false });
    expect((await c.info()).hint).toMatch(/halaman rilis/);
  });

  it('error dilaporkan tanpa membuang hasil sebelumnya', async () => {
    let fail = false;
    const c = new UpdateChecker({
      enabled: true,
      mode: 'sea',
      version: () => '0.3.0',
      check: async () => {
        if (fail) throw new Error('offline');
        return fakeCheck();
      },
    });
    await c.info();
    fail = true;
    const i = await c.info(true);
    expect(i).toMatchObject({ latest: '0.4.0', error: 'offline' });
  });
});

describe('HTTP /api/update', () => {
  it('GET melapor status, POST install menjalankan pemasang sekali', async () => {
    let installs = 0;
    const { app } = await buildApp({
      config: testConfig(),
      update: { check: async (current) => fakeCheck({ current, latest: '99.0.0' }), install: () => (installs++, 'C:/log/update.log') },
    });
    try {
      const info = (await app.inject({ method: 'GET', url: '/api/update' })).json();
      expect(info).toMatchObject({ current: VERSION, latest: '99.0.0', available: true, autoInstall: true, installing: false });

      const res = await app.inject({ method: 'POST', url: '/api/update/install' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ ok: true, version: '99.0.0', log: 'C:/log/update.log' });
      expect((await app.inject({ method: 'POST', url: '/api/update/install' })).statusCode).toBe(409);
      expect(installs).toBe(1);
      expect((await app.inject({ method: 'GET', url: '/api/update' })).json().installing).toBe(true);
    } finally {
      await app.close();
    }
  });

  it('POST install ditolak bila sudah terbaru atau tidak bisa otomatis', async () => {
    const latest = await buildApp({ config: testConfig(), update: { check: async (current) => fakeCheck({ current, latest: current }), install: () => 'x' } });
    const manual = await buildApp({ config: testConfig(), update: { check: async (current) => fakeCheck({ current, kind: null }), install: () => 'x' } });
    try {
      expect((await latest.app.inject({ method: 'POST', url: '/api/update/install' })).statusCode).toBe(409);
      expect((await manual.app.inject({ method: 'POST', url: '/api/update/install' })).statusCode).toBe(400);
    } finally {
      await latest.app.close();
      await manual.app.close();
    }
  });

  it('POST install dari IP non-loopback ditolak', async () => {
    const { app } = await buildApp({ config: testConfig(), update: { check: async (current) => fakeCheck({ current, latest: '99.0.0' }), install: () => 'x' } });
    try {
      const res = await app.inject({ method: 'POST', url: '/api/update/install', remoteAddress: '192.168.1.5' });
      expect(res.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });
});
