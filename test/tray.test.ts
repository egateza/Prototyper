import { EventEmitter } from 'node:events';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { STOPPED_INFO } from '../src/core/runtime.js';
import type { UpdateCheck } from '../src/core/update.js';
import type { PrototypeView } from '../src/core/views.js';
import { TrayController, type DaemonApi, type TrayDeps } from '../src/tray/controller.js';
import { asciiJson, parseHostLine, TrayHost, type HostEvent, type IconState, type TrayHostLike } from '../src/tray/host.js';
import { parseAppsTheme, readAppsTheme, runningTrayPid, trayArgs, trayFiles } from '../src/tray/index.js';
import { iconState, statusNotices, type TrayState, type UpdateState } from '../src/tray/menu.js';
import { glyphRuns, MENU_THEME, MENU_W, menuLayout, POPUP_W, MAX_ROWS, popupLayout, type Popup, type PopupItem } from '../src/tray/popup.js';
import { testConfig, tmpDir } from './helpers.js';

function view(id: string, status: PrototypeView['status'] = 'stopped', port: number | null = null): PrototypeView {
  const live = status === 'running' || status === 'starting';
  return {
    id,
    name: id.toUpperCase(),
    description: null,
    type: 'static',
    path: `/p/${id}`,
    tags: [],
    valid: true,
    error: null,
    status,
    port,
    pid: null,
    url: live && port ? `http://localhost:${port}` : null,
    lanUrls: [],
    startedAt: null,
    exitCode: STOPPED_INFO.exitCode,
    instructions: { path: '', exists: false },
    comments: { open: 0, resolved: 0, waitingUser: 0 },
    manifest: null,
  };
}

const upd = (o: Partial<UpdateState> = {}): UpdateState => ({
  status: 'idle', current: '0.1.0', latest: null, progress: 0, checkedAt: null, error: null, selfUpdate: true, ...o,
});

const state = (o: Partial<TrayState> = {}): TrayState => ({
  url: 'http://localhost:4000', daemonUp: true, daemonBusy: null, prototypes: [], startup: false, notifications: true, theme: 'dark', update: upd(), ...o,
});

type Hit = Extract<PopupItem, { k: 'hit' }>;
const hitIds = (p: Popup) => p.items.flatMap((i) => (i.k === 'hit' && i.id ? [i.id] : []));
const texts = (p: Popup) => p.items.flatMap((i) => (i.k === 'text' ? [i.runs.map((r) => r.text).join('')] : []));
const hitOf = (p: Popup, id: string) => p.items.find((i): i is Hit => i.k === 'hit' && i.id === id);
/** Baris menu klik kanan: teks & tanda ✓ di baris yang sama. */
function menuRow(p: Popup, id: string) {
  const hit = hitOf(p, id);
  const row = p.items.filter((i): i is Extract<PopupItem, { k: 'text' }> => i.k === 'text' && hit !== undefined && i.y === hit.y);
  const label = row.map((i) => i.runs.map((r) => r.text).join('')).find((t) => t !== '✓');
  return hit ? { hit, label, checked: row.some((i) => i.runs[0]!.text === '✓'), color: row.at(-1)!.runs[0]!.color } : undefined;
}

describe('menu tray', () => {
  it('popup ringkas: ringkasan, baris prototype dengan toggle, opsi, bar Buka Prototyper di bawah', () => {
    const p = popupLayout(state({ prototypes: [view('kasir', 'running', 4101), view('landing')] }));
    expect(p.w).toBe(POPUP_W);
    expect(texts(p)).toEqual(expect.arrayContaining(['Prototyper Runtime', 'Aktif · 1 dari 2 berjalan', 'KASIR  Berjalan · :4101', 'LANDING  Berhenti', 'Jalankan saat startup']));
    expect(hitIds(p)).toEqual(['pause', 'p:open:kasir', 'p:stop:kasir', 'p:start:landing', 'startup', 'update', 'startAll', 'stopAll', 'open']);
    expect(p.items.filter((i) => i.k === 'toggle').map((i) => (i as { on: boolean }).on)).toEqual([true, false, false]);
    // bar Buka Prototyper menempel di bawah; tombol di popup tidak menutup popup
    const hits = p.items.filter((i): i is Extract<PopupItem, { k: 'hit' }> => i.k === 'hit');
    const open = hits.find((i) => i.id === 'open')!;
    expect(open.y + open.h).toBe(p.h);
    expect(hits.filter((i) => i.close).map((i) => i.id)).toEqual([undefined]);
    // tombol ✕ di kanan atas, tombol jeda di sebelah kirinya
    const close = hits.find((i) => i.close)!;
    expect(close.x + close.w).toBe(POPUP_W - 12);
    expect(hits.find((i) => i.id === 'pause')!.x + 30).toBeLessThan(close.x);
    expect(texts(p)).toContain('✕');
    // semua bentuk ada di dalam popup
    for (const i of p.items) {
      if ('w' in i && 'h' in i) {
        expect(i.x).toBeGreaterThanOrEqual(0);
        expect(i.x + i.w).toBeLessThanOrEqual(POPUP_W);
        expect(i.y + i.h).toBeLessThanOrEqual(p.h);
      }
    }
  });

  it('popup: daemon dijeda/sibuk menonaktifkan aksi massal; daftar panjang diringkas', () => {
    const paused = popupLayout(state({ daemonUp: false, prototypes: [view('kasir')] }));
    expect(hitIds(paused)).not.toContain('startAll');
    expect(texts(paused)).toContain('Daemon dijeda');
    expect(texts(paused)).toContain('▶');
    const busy = popupLayout(state({ daemonBusy: 'stopping' }));
    expect(hitIds(busy)).not.toContain('pause');
    const many = popupLayout(state({ prototypes: Array.from({ length: MAX_ROWS + 3 }, (_, i) => view(`p${i}`)) }));
    expect(texts(many)).toContain(`+3 lainnya · buka Prototyper untuk semua`);
    expect(texts(popupLayout(state()))).toContain('Belum ada prototype — tambahkan lewat Web UI');
  });

  it('popup: baris pembaruan mengikuti status (spinner, progress, tombol)', () => {
    const checking = popupLayout(state({ update: upd({ status: 'checking' }) }));
    expect(checking.items.some((i) => i.k === 'spinner')).toBe(true);
    expect(hitIds(checking)).not.toContain('update');
    const dl = popupLayout(state({ update: upd({ status: 'downloading', latest: '0.2.0', progress: 0.5 }) }));
    expect(dl.items.find((i) => i.k === 'progress')).toMatchObject({ value: 0.5 });
    expect(texts(dl)).toContain('Mengunduh 0.2.0…');
    const ready = popupLayout(state({ update: upd({ status: 'ready', latest: '0.2.0' }) }));
    expect(texts(ready)).toEqual(expect.arrayContaining(['0.2.0 siap dipasang', 'Mulai ulang']));
  });

  it('menu klik kanan: urutan & teks sama dengan menu konteks prototype, menutup setelah dipilih', () => {
    const m = menuLayout(state({ startup: true }));
    expect(m.w).toBe(MENU_W);
    expect(hitIds(m)).toEqual(['open', 'startAll', 'stopAll', 'pause', 'startup', 'notif', 'update', 'quit']);
    expect(texts(m)).toEqual(expect.arrayContaining(['🌐 Buka Prototyper di browser', '⏸ Jeda daemon', 'Tampilkan notifikasi', '⟳ Periksa pembaruan…', 'Keluar']));
    expect(menuRow(m, 'startup')!.checked).toBe(true);
    expect(menuRow(menuLayout(state({ startup: false })), 'startup')!.checked).toBe(false);
    expect(m.items.filter((i): i is Hit => i.k === 'hit').every((i) => i.close)).toBe(true);
    expect(hitIds(menuLayout(state({ startup: null })))).not.toContain('startup');
    // tema mengikuti Windows: latar dari .ctx-menu terang/gelap
    expect(menuLayout(state({ theme: 'light' })).bg).toBe(MENU_THEME.light.bg);
    expect(m.bg).toBe(MENU_THEME.dark.bg);
  });

  it('menu klik kanan: item pembaruan & daemon dijeda', () => {
    const at = (u: Partial<UpdateState>) => menuLayout(state({ update: upd(u) }));
    expect(hitOf(at({ status: 'checking' }), 'update')).toBeUndefined(); // dinonaktifkan
    expect(menuRow(at({ status: 'available', latest: '0.2.0' }), 'update')).toMatchObject({ label: '⬇ Unduh pembaruan 0.2.0', color: MENU_THEME.dark.accent });
    expect(menuRow(at({ status: 'available', latest: '0.2.0', selfUpdate: false }), 'update')!.label).toBe('⬇ Lihat pembaruan 0.2.0');
    expect(texts(at({ status: 'downloading', progress: 0.42 }))).toContain('⬇ Mengunduh… 42%');
    expect(menuRow(at({ status: 'ready', latest: '0.2.0' }), 'update')!.label).toBe('★ Mulai ulang untuk memperbarui');
    const paused = menuLayout(state({ daemonUp: false }));
    expect(hitIds(paused)).not.toContain('startAll');
    expect(menuRow(paused, 'pause')!.label).toBe('▶ Lanjutkan daemon');
  });

  it('simbol di awal teks memakai Segoe UI Symbol', () => {
    expect(glyphRuns('⏸ Jeda daemon', 13, '#fff')).toEqual([
      { text: '⏸', size: 13, color: '#fff', bold: false, symbol: true },
      { text: ' Jeda daemon', size: 13, color: '#fff', bold: false },
    ]);
    expect(glyphRuns('Keluar', 13, '#fff')).toEqual([{ text: 'Keluar', size: 13, color: '#fff', bold: false }]);
    expect(glyphRuns('0.2.0 siap', 13, '#fff')).toHaveLength(1);
  });

  it('tema Windows dari registry', async () => {
    expect(parseAppsTheme('    AppsUseLightTheme    REG_DWORD    0x0\r\n')).toBe('dark');
    expect(parseAppsTheme('    AppsUseLightTheme    REG_DWORD    0x1\r\n')).toBe('light');
    expect(parseAppsTheme('')).toBe('light');
    expect(await readAppsTheme(async () => ({ code: 1, stdout: '', stderr: 'tidak ada' }))).toBe('light');
  });

  it('ikon: badge jumlah berjalan, titik pembaruan, pudar saat dijeda', () => {
    const s = state({ prototypes: [view('a', 'running', 4101), view('b', 'starting', 4102), view('c')] });
    expect(iconState(s)).toMatchObject({ badge: 1, dot: false, paused: false });
    expect(iconState({ ...s, update: upd({ status: 'available' }) }).dot).toBe(true);
    expect(iconState({ ...s, daemonUp: false })).toMatchObject({ badge: 0, paused: true });
  });

  it('notifikasi hanya untuk perubahan status penting', () => {
    const prev = [view('a', 'starting', 4101), view('b', 'running', 4102), view('c', 'running', 4103)];
    const next = [view('a', 'running', 4101), { ...view('b', 'crashed'), error: 'exit 1' }, view('c', 'stopped'), view('d', 'running', 4104)];
    expect(statusNotices(prev, next)).toEqual([
      { title: 'A', text: 'Berjalan di localhost:4101' },
      { title: 'B', text: 'Berhenti tak terduga: exit 1' },
    ]);
  });
});

describe('protokol host', () => {
  it('JSON ke PowerShell hanya ASCII', () => {
    const line = asciiJson({ text: 'Memulai… ● é 🌐' });
    expect(/^[\x20-\x7e]*$/.test(line)).toBe(true);
    expect(JSON.parse(line)).toEqual({ text: 'Memulai… ● é 🌐' });
  });

  it('membaca event dari host dan mengabaikan baris lain', () => {
    expect(parseHostLine('{"t":"click","id":"p:start:x"}')).toEqual({ t: 'click', id: 'p:start:x' });
    expect(parseHostLine('{"t":"ready"}')).toEqual({ t: 'ready' });
    expect(parseHostLine('{"t":"click"}')).toBeNull();
    expect(parseHostLine('Exception: ...')).toBeNull();
  });

  it.runIf(process.platform === 'win32')('skrip PowerShell: menggambar popup/menu/ikon dan klik mengirim id yang tepat', async () => {
    const host = new TrayHost();
    const dir = tmpDir('prototyper-tray-');
    const events: HostEvent[] = [];
    const errors: string[] = [];
    const origError = console.error;
    console.error = (...a: unknown[]) => void errors.push(a.join(' '));
    const popup = popupLayout(state({ prototypes: [view('kasir', 'running', 4101)] }));
    const menu = menuLayout(state());
    const center = (p: Popup, id: string): [number, number] => {
      const h = hitOf(p, id)!;
      return [h.x + h.w / 2, h.y + h.h / 2];
    };
    try {
      const exited = new Promise<number | null>((resolve) => host.on('exit', resolve));
      host.on('event', (e: HostEvent) => {
        events.push(e);
        if (e.t === 'ready') {
          host.setPopup(popup);
          host.setMenu(menu);
          host.setIcon({ badge: 12, dot: true, paused: true, tooltip: 'x'.repeat(300) });
          host.balloon('Tes', 'Halo');
          // klik lewat jalur yang sama dengan klik mouse: tombol di dalam baris (area klik bertumpuk)
          host.clickAt('popup', ...center(popup, 'update'));
          host.clickAt('popup', ...center(popup, 'p:stop:kasir'));
          host.clickAt('popup', 20, 60); // baris tanpa aksi: tidak mengirim apa-apa
          host.clickAt('menu', ...center(menu, 'notif'));
          host.snapshot('popup', path.join(dir, 'popup.png'));
          host.snapshot('menu', path.join(dir, 'menu.png'));
          host.snapshot('icon', path.join(dir, 'icon.png'));
        }
        if (e.t === 'snapshot' && e.path.endsWith('icon.png')) host.close();
      });
      host.start(dir, path.resolve('assets', 'tray'));
      expect(await exited).toBe(0);
    } finally {
      console.error = origError;
    }
    expect(events[0]).toEqual({ t: 'ready' });
    expect(events.filter((e) => e.t === 'click')).toEqual([
      { t: 'click', id: 'update' },
      { t: 'click', id: 'p:stop:kasir' },
      { t: 'click', id: 'notif' },
    ]);
    for (const f of ['popup.png', 'menu.png', 'icon.png']) expect(readFileSync(path.join(dir, f)).subarray(1, 4).toString()).toBe('PNG');
    expect(errors).toEqual([]);
  }, 30_000);
});

class FakeHost extends EventEmitter implements TrayHostLike {
  popup: Popup | null = null;
  menu: Popup | null = null;
  icon: IconState | null = null;
  balloons: Array<[string, string]> = [];
  closed = false;
  setPopup(popup: Popup) {
    this.popup = popup;
  }
  setMenu(menu: Popup) {
    this.menu = menu;
  }
  setIcon(icon: IconState) {
    this.icon = icon;
  }
  balloon(title: string, text: string) {
    this.balloons.push([title, text]);
  }
  close() {
    this.closed = true;
  }
}

class FakeApi implements DaemonApi {
  up = false;
  views: PrototypeView[] = [];
  calls: string[] = [];
  failStart = new Set<string>();
  async list() {
    return this.up ? this.views.map((v) => ({ ...v })) : null;
  }
  async action(id: string, action: 'start' | 'stop' | 'restart') {
    this.calls.push(`${action}:${id}`);
    if (action === 'start' && this.failStart.has(id)) throw new Error('gagal');
    this.views = this.views.map((v) => (v.id === id ? view(id, action === 'stop' ? 'stopped' : 'running', 4100 + this.views.indexOf(v)) : v));
  }
  async ensure() {
    this.calls.push('ensure');
    this.up = true;
  }
  async shutdown() {
    this.calls.push('shutdown');
    this.up = false;
    this.views = this.views.map((v) => view(v.id));
  }
}

const release = (version: string, asset = true): UpdateCheck => ({
  current: '0.1.0',
  latest: { version, tag: `v${version}`, pageUrl: `https://github.com/x/y/releases/tag/v${version}`, assets: [] },
  available: version !== '0.1.0',
  asset: asset ? { name: `prototyper-${version}-win-x64.exe`, url: 'u', size: 1 } : null,
  checksums: null,
});

function setup(o: Partial<TrayDeps> = {}) {
  const host = new FakeHost();
  const api = new FakeApi();
  api.views = [view('kasir'), view('landing')];
  const opened: string[] = [];
  const exits: number[] = [];
  const installs: Array<[string, string[]]> = [];
  let startup = false;
  let nextCheck = release('0.2.0');
  const home = tmpDir('prototyper-tray-home-');
  const c = new TrayController({
    host,
    api,
    url: 'http://localhost:4000',
    version: '0.1.0',
    selfUpdate: true,
    updater: {
      check: async () => nextCheck,
      download: async (_c, onProgress) => {
        onProgress(0.5);
        onProgress(1);
        return path.join(home, 'new.exe');
      },
    },
    startup: { get: async () => startup, set: async (v) => void (startup = v) },
    openUrl: (u) => void opened.push(u),
    settingsFile: path.join(home, 'tray.json'),
    install: async (file, restore) => void installs.push([file, restore]),
    exit: (code) => void exits.push(code),
    pollMs: 60_000,
    autoUpdate: null,
    ...o,
  });
  controllers.push(c);
  return { c, host, api, opened, exits, installs, home, startup: () => startup, setCheck: (r: UpdateCheck) => void (nextCheck = r) };
}

const controllers: TrayController[] = [];
afterEach(() => {
  for (const c of controllers.splice(0)) c.dispose();
});

describe('TrayController', () => {
  it('menyalakan daemon saat mulai, lalu menggambar menu dan ikon', async () => {
    const t = setup();
    await t.c.start();
    expect(t.api.calls).toEqual(['ensure']);
    expect(JSON.stringify(t.host.popup)).toContain('Aktif · 0 dari 2 berjalan');
    expect(t.host.icon).toMatchObject({ badge: 0, paused: false });
  });

  it('menjalankan/menghentikan prototype dari menu dan memberi notifikasi', async () => {
    const t = setup();
    await t.c.start();
    t.host.emit('event', { t: 'click', id: 'p:start:kasir' } satisfies HostEvent);
    await new Promise((r) => setTimeout(r, 20));
    expect(t.api.calls).toContain('start:kasir');
    expect(t.host.icon!.badge).toBe(1);
    expect(t.host.balloons.at(-1)).toEqual(['KASIR', 'Berjalan di localhost:4100']);
    await t.c.click('p:open:kasir');
    expect(t.opened).toEqual(['http://localhost:4100']);
    await t.c.click('stopAll');
    expect(t.api.calls).toContain('stop:kasir');
  });

  it('jalankan semua melaporkan yang gagal', async () => {
    const t = setup();
    t.api.failStart.add('landing');
    await t.c.start();
    await t.c.click('startAll');
    expect(t.api.calls).toEqual(['ensure', 'start:kasir', 'start:landing']);
    expect(t.host.balloons.at(-1)).toEqual(['Sebagian gagal dijalankan', 'LANDING']);
  });

  it('jeda = shutdown daemon; lanjutkan = nyalakan lagi; aksi diblokir saat dijeda', async () => {
    const t = setup();
    await t.c.start();
    await t.c.click('pause');
    expect(t.api.calls.at(-1)).toBe('shutdown');
    expect(t.c.state.daemonUp).toBe(false);
    await t.c.click('p:start:kasir');
    await t.c.click('open');
    expect(t.api.calls).not.toContain('start:kasir');
    expect(t.opened).toEqual([]);
    await t.c.click('pause');
    expect(t.api.calls.at(-1)).toBe('ensure');
    expect(t.c.state.daemonUp).toBe(true);
    await t.c.click('open');
    expect(t.opened).toEqual(['http://localhost:4000']);
  });

  it('daemon dimatikan dari luar terdeteksi saat polling', async () => {
    const t = setup();
    await t.c.start();
    t.api.up = false;
    await t.c.poll();
    expect(t.c.state.daemonUp).toBe(false);
    expect(t.host.icon!.paused).toBe(true);
  });

  it('opsi startup dan notifikasi; notifikasi tersimpan di tray.json', async () => {
    const t = setup();
    await t.c.start();
    await t.c.click('startup');
    expect(t.startup()).toBe(true);
    expect(menuRow(t.host.menu!, 'startup')!.checked).toBe(true);
    await t.c.click('notif');
    expect(JSON.parse(readFileSync(path.join(t.home, 'tray.json'), 'utf8'))).toEqual({ notifications: false });
    const before = t.host.balloons.length;
    await t.c.click('p:start:kasir');
    await t.c.poll();
    expect(t.host.balloons.length).toBe(before); // notifikasi status dimatikan

    const t2 = setup({ settingsFile: path.join(t.home, 'tray.json') });
    await t2.c.start();
    expect(t2.c.state.notifications).toBe(false);
  });

  it('pembaruan: periksa → unduh → mulai ulang memasang & menyalakan lagi prototype yang berjalan', async () => {
    const t = setup();
    await t.c.start();
    await t.c.click('p:start:kasir');
    await t.c.poll();
    await t.c.click('update');
    expect(t.c.state.update).toMatchObject({ status: 'available', latest: '0.2.0' });
    expect(t.host.icon!.dot).toBe(true);
    await t.c.click('update');
    expect(t.c.state.update.status).toBe('ready');
    await t.c.click('update');
    expect(t.api.calls.at(-1)).toBe('shutdown');
    expect(t.installs).toEqual([[path.join(t.home, 'new.exe'), ['kasir']]]);
    expect(t.exits).toEqual([0]);
    expect(t.host.closed).toBe(true);
  });

  it('tanpa pemasangan otomatis, pembaruan membuka halaman rilis', async () => {
    const t = setup({ selfUpdate: false });
    await t.c.start();
    await t.c.click('update');
    await t.c.click('update');
    expect(t.opened).toEqual(['https://github.com/x/y/releases/tag/v0.2.0']);
  });

  it('sudah versi terbaru / gagal memeriksa', async () => {
    const t = setup();
    t.setCheck(release('0.1.0'));
    await t.c.start();
    await t.c.click('update');
    expect(t.c.state.update.status).toBe('uptodate');
    expect(t.host.balloons.at(-1)![0]).toBe('Tidak ada pembaruan');

    const t2 = setup({ updater: { check: async () => Promise.reject(new Error('offline')), download: async () => '' } });
    await t2.c.start();
    await t2.c.checkUpdate(true);
    expect(t2.c.state.update).toMatchObject({ status: 'error', error: 'offline' });
    expect(t2.host.balloons).toEqual([]); // diam saat pemeriksaan otomatis
  });

  it('gagal memasang: daemon & prototype dinyalakan lagi', async () => {
    const t = setup({ install: async () => Promise.reject(new Error('terkunci')) });
    await t.c.start();
    await t.c.click('p:start:kasir');
    await t.c.poll();
    await t.c.click('update');
    await t.c.click('update');
    await t.c.click('update');
    expect(t.api.calls.slice(-3)).toEqual(['shutdown', 'ensure', 'start:kasir']);
    expect(t.host.balloons.at(-1)).toEqual(['Gagal memasang pembaruan', 'terkunci']);
    expect(t.exits).toEqual([]);
  });

  it('keluar menghentikan daemon lalu menutup tray; prototype dipulihkan saat start(restore)', async () => {
    const t = setup();
    await t.c.start(['landing']);
    expect(t.api.calls).toEqual(['ensure', 'start:landing']);
    await t.c.click('quit');
    expect(t.api.calls.at(-1)).toBe('shutdown');
    expect(t.exits).toEqual([0]);
  });
});

describe('proses tray', () => {
  it('tray.pid: PID hidup dianggap berjalan, PID mati/rusak tidak', () => {
    const home = tmpDir('prototyper-tray-lock-');
    expect(runningTrayPid(home)).toBeNull();
    writeFileSync(trayFiles(home).lock, '4242');
    expect(runningTrayPid(home, (pid) => pid === 4242)).toBe(4242);
    expect(runningTrayPid(home, () => false)).toBeNull();
    writeFileSync(trayFiles(home).lock, 'abc');
    expect(runningTrayPid(home, () => true)).toBeNull();
    writeFileSync(trayFiles(home).lock, String(process.pid));
    expect(runningTrayPid(home, () => true)).toBeNull(); // diri sendiri
  });

  it('perintah startup memuat --home dan --port', () => {
    const config = testConfig();
    const args = trayArgs(config);
    expect(args.slice(-5)).toEqual(['--home', config.home, '--port', String(config.port), 'tray']);
  });

  it('icon tray ada di folder aplikasi', () => {
    expect(existsSync(path.resolve('assets', 'tray'))).toBe(true);
  });
});
