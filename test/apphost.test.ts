import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  appStoreDir,
  bootApp,
  BROKEN_MARK,
  chooseApp,
  CURRENT_FILE,
  HOST_GLOBAL,
  pruneAppStore,
  readCurrent,
  writeCurrent,
  type AppInfo,
  type SeaManifest,
} from '../src/core/apphost.js';
import { isSafeRelativePath, packFiles, unpackFiles } from '../src/core/apppack.js';
import { detectInstaller, installAppUpdate, msiInstallScript } from '../src/core/update.js';
import { buildWxs, msiVersion, MSI_COMPONENT_GUIDS, MSI_UPGRADE_CODE } from '../scripts/msi.js';
import { HOST_SCRIPT, TRAY_AUMID } from '../src/tray/host.js';
import { quitPrototyper, type QuitDeps } from '../src/tray/index.js';
import { tmpDir } from './helpers.js';

const app = (version: string, runtime = 1): AppInfo => ({ id: `${version}-abc`, version, runtime });

/** Buat folder aplikasi palsu di app store. */
function seedApp(root: string, info: AppInfo, bundle = 'module.exports = 1;'): string {
  const dir = path.join(root, info.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'prototyper.cjs'), bundle);
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: info.version }));
  writeFileSync(path.join(dir, 'app.json'), JSON.stringify(info));
  return dir;
}

function appPack(info: AppInfo, extra: Record<string, string> = {}): Buffer {
  const files = new Map<string, Buffer>([
    ['prototyper.cjs', Buffer.from('module.exports = 1;')],
    ['package.json', Buffer.from(JSON.stringify({ version: info.version }))],
    ['app.json', Buffer.from(JSON.stringify(info))],
    ['web/index.html', Buffer.from('<html></html>')],
  ]);
  for (const [k, v] of Object.entries(extra)) files.set(k, Buffer.from(v));
  return packFiles(files);
}

describe('paket aplikasi (tar.gz)', () => {
  it('pack → unpack menghasilkan isi yang sama, termasuk path panjang & biner', () => {
    const long = `web/${'a'.repeat(60)}/${'b'.repeat(60)}/file.js`;
    const bin = Buffer.from([0, 1, 2, 255, 254]);
    const files = new Map<string, Buffer>([
      ['prototyper.cjs', Buffer.from('x'.repeat(1500))],
      [long, Buffer.from('panjang')],
      ['assets/tray/t.png', bin],
      ['kosong.txt', Buffer.alloc(0)],
    ]);
    const out = unpackFiles(packFiles(files));
    expect([...out.keys()].sort()).toEqual([...files.keys()].sort());
    for (const [k, v] of files) expect(out.get(k)).toEqual(v);
    expect(packFiles(files)).toEqual(packFiles(files)); // deterministik
  });

  it('bisa dibuka dengan tar standar', () => {
    const dir = tmpDir('prototyper-pack-');
    const file = path.join(dir, 'a.tar.gz');
    writeFileSync(file, packFiles(new Map([['web/index.html', Buffer.from('<html>')]])));
    const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
    const r = spawnSync(tar, ['-xzf', 'a.tar.gz'], { cwd: dir, encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(readFileSync(path.join(dir, 'web', 'index.html'), 'utf8')).toBe('<html>');
  });

  it('menolak path tidak aman dan arsip rusak', () => {
    expect(isSafeRelativePath('web/a.js')).toBe(true);
    for (const p of ['../x', 'a/../../x', '/etc/x', 'C:/x', 'a\\b', '', 'a//b', './a']) expect(isSafeRelativePath(p)).toBe(false);
    expect(() => packFiles(new Map([['../x', Buffer.from('')]]))).toThrow(/tidak valid/);
    expect(() => unpackFiles(Buffer.from('bukan gzip'))).toThrow(/rusak/);
    // header tar dengan nama ../evil (checksum benar)
    const h = Buffer.alloc(512);
    h.write('../evil', 0);
    h.write('0000644\0', 100);
    h.write('00000000000\0', 124);
    h.fill(0x20, 148, 156);
    h.write('0', 156);
    let sum = 0;
    for (const b of h) sum += b;
    h.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148);
    expect(() => unpackFiles(gzipSync(Buffer.concat([h, Buffer.alloc(1024)])))).toThrow(/tidak aman/);
  });
});

describe('app store & bootstrap', () => {
  it('appStoreDir mengikuti PROTOTYPER_HOME', () => {
    const home = path.resolve('H');
    expect(appStoreDir({}, home)).toBe(path.join(home, '.prototyper', 'app'));
    expect(appStoreDir({ PROTOTYPER_HOME: path.resolve('D') }, home)).toBe(path.resolve('D', 'app'));
  });

  it('chooseApp: pakai hasil pembaruan hanya bila runtime cocok, lebih baru, utuh, dan tidak rusak', () => {
    const root = tmpDir('prototyper-store-');
    const embedded = app('0.3.0');
    expect(chooseApp(root, embedded, 1)).toEqual(embedded); // belum ada current.json

    const newer = app('0.3.1');
    seedApp(root, newer);
    writeCurrent(root, { ...newer, previous: embedded });
    expect(readCurrent(root)).toEqual({ ...newer, previous: embedded });
    expect(chooseApp(root, embedded, 1)).toEqual(newer);
    expect(chooseApp(root, app('0.4.0'), 1)).toEqual(app('0.4.0')); // exe diganti versi lebih baru → bawaan menang
    expect(chooseApp(root, embedded, 2)).toEqual(embedded); // runtime exe berbeda

    writeFileSync(path.join(root, newer.id, BROKEN_MARK), 'x');
    expect(chooseApp(root, embedded, 1)).toEqual(embedded);

    writeFileSync(path.join(root, CURRENT_FILE), '{rusak');
    expect(readCurrent(root)).toBeNull();
    writeFileSync(path.join(root, CURRENT_FILE), JSON.stringify({ ...newer, id: '../luar' }));
    expect(readCurrent(root)).toBeNull();
  });

  const manifest = (info: AppInfo): SeaManifest => ({ ...info, files: ['prototyper.cjs', 'package.json'] });
  const reader = (info: AppInfo) => (name: string) =>
    new TextEncoder().encode(name === 'package.json' ? JSON.stringify({ version: info.version }) : 'module.exports = 1;').buffer as ArrayBuffer;

  it('bootApp: mengekstrak & memuat aplikasi bawaan, menitipkan HostInfo', () => {
    const root = tmpDir('prototyper-store-');
    const embedded = app('0.3.0');
    const loaded: string[] = [];
    const host = bootApp({ manifest: manifest(embedded), read: reader(embedded), root, runtime: 1, load: (f) => void loaded.push(f) });
    expect(host).toMatchObject({ runtime: 1, app: embedded, embedded, root, appDir: path.join(root, embedded.id) });
    expect(loaded).toEqual([path.join(root, embedded.id, 'prototyper.cjs')]);
    expect(existsSync(path.join(root, embedded.id, 'package.json'))).toBe(true);
    expect((globalThis as Record<string, unknown>)[HOST_GLOBAL]).toBe(host);
  });

  it('bootApp: memuat hasil pembaruan; gagal dimuat → ditandai .broken dan kembali ke bawaan', () => {
    const root = tmpDir('prototyper-store-');
    const embedded = app('0.3.0');
    const newer = app('0.3.1');
    seedApp(root, newer);
    writeCurrent(root, { ...newer, previous: null });

    const loaded: string[] = [];
    expect(bootApp({ manifest: manifest(embedded), read: reader(embedded), root, runtime: 1, load: (f) => void loaded.push(f) }).app).toEqual(newer);
    expect(existsSync(path.join(root, embedded.id))).toBe(false); // bawaan tidak perlu diekstrak

    const warnings: string[] = [];
    const host = bootApp({
      manifest: manifest(embedded),
      read: reader(embedded),
      root,
      runtime: 1,
      load: (f) => {
        if (f.includes(newer.id)) throw new Error('sintaks rusak');
      },
      warn: (m) => void warnings.push(m),
    });
    expect(host.app).toEqual(embedded);
    expect(readFileSync(path.join(root, newer.id, BROKEN_MARK), 'utf8')).toContain('sintaks rusak');
    expect(warnings[0]).toMatch(/0\.3\.1 gagal dimuat, kembali ke 0\.3\.0/);
    expect(chooseApp(root, embedded, 1)).toEqual(embedded);
  });

  it('pruneAppStore menyisakan yang dipertahankan dan current.json', () => {
    const root = tmpDir('prototyper-store-');
    for (const v of ['0.2.0', '0.3.0', '0.3.1', '0.3.2']) seedApp(root, app(v));
    writeCurrent(root, { ...app('0.3.2'), previous: null });
    mkdirSync(path.join(root, 'bukan-aplikasi'));
    expect(pruneAppStore(root, ['0.3.2-abc', '0.3.1-abc']).sort()).toEqual(['0.2.0-abc', '0.3.0-abc']);
    expect(existsSync(path.join(root, CURRENT_FILE))).toBe(true);
    expect(existsSync(path.join(root, 'bukan-aplikasi'))).toBe(true);
  });
});

describe('installAppUpdate', () => {
  const embedded = app('0.3.0');

  function setup(info: AppInfo, extra: Record<string, string> = {}) {
    const root = tmpDir('prototyper-store-');
    const pack = path.join(tmpDir('prototyper-dl-'), 'p.tar.gz');
    writeFileSync(pack, appPack(info, extra));
    return { root, pack };
  }

  it('mengekstrak, mengarahkan current.json, memverifikasi, membersihkan versi lama', async () => {
    const info = app('0.3.2');
    const { root, pack } = setup(info);
    seedApp(root, app('0.3.1'));
    seedApp(root, app('0.2.0'));
    const verified: AppInfo[] = [];
    const out = await installAppUpdate(pack, { root, runtime: 1, active: app('0.3.1'), embedded, verify: (i) => void verified.push(i) });
    expect(out).toEqual(info);
    expect(verified).toEqual([info]);
    expect(readCurrent(root)).toEqual({ ...info, previous: app('0.3.1') });
    expect(readFileSync(path.join(root, info.id, 'web', 'index.html'), 'utf8')).toBe('<html></html>');
    expect(existsSync(path.join(root, '0.3.1-abc'))).toBe(true); // yang sedang berjalan dipertahankan
    expect(existsSync(path.join(root, '0.2.0-abc'))).toBe(false);
    expect(existsSync(pack)).toBe(false);
  });

  it('verifikasi gagal → current.json dikembalikan, folder baru dibuang', async () => {
    const { root, pack } = setup(app('0.3.2'));
    const before = { ...app('0.3.1'), previous: null };
    seedApp(root, app('0.3.1'));
    writeCurrent(root, before);
    await expect(
      installAppUpdate(pack, { root, runtime: 1, active: app('0.3.1'), embedded, verify: () => { throw new Error('exit 1'); } }),
    ).rejects.toThrow(/0\.3\.2 gagal dijalankan.*exit 1/);
    expect(readCurrent(root)).toEqual(before);
    expect(existsSync(path.join(root, '0.3.2-abc'))).toBe(false);

    const fresh = setup(app('0.3.2'));
    await expect(installAppUpdate(fresh.pack, { root: fresh.root, runtime: 1, active: embedded, embedded, verify: () => Promise.reject(new Error('x')) })).rejects.toThrow();
    expect(existsSync(path.join(fresh.root, CURRENT_FILE))).toBe(false);
  });

  it('menolak paket untuk runtime lain atau yang bukan paket aplikasi', async () => {
    const r2 = setup(app('0.4.0', 2));
    await expect(installAppUpdate(r2.pack, { root: r2.root, runtime: 1, active: embedded, embedded, verify: () => undefined })).rejects.toThrow(/runtime 2/);
    const root = tmpDir('prototyper-store-');
    const bad = path.join(root, 'x.tar.gz');
    writeFileSync(bad, packFiles(new Map([['readme.txt', Buffer.from('hai')]])));
    await expect(installAppUpdate(bad, { root, runtime: 1, active: embedded, embedded, verify: () => undefined })).rejects.toThrow(/bukan paket aplikasi/);
  });

  it('memasang ulang id yang sama menghapus penanda .broken', async () => {
    const info = app('0.3.2');
    const { root, pack } = setup(info);
    const dir = seedApp(root, info);
    writeFileSync(path.join(dir, BROKEN_MARK), 'x');
    await installAppUpdate(pack, { root, runtime: 1, active: embedded, embedded, verify: () => undefined });
    expect(existsSync(path.join(dir, BROKEN_MARK))).toBe(false);
    expect(chooseApp(root, embedded, 1)).toEqual(info);
  });
});

describe('instalasi MSI', () => {
  it('detectInstaller membaca installer.json di sebelah exe', () => {
    const dir = tmpDir('prototyper-msi-');
    const exe = path.join(dir, 'prototyper.exe');
    expect(detectInstaller(exe)).toBeNull();
    writeFileSync(path.join(dir, 'installer.json'), JSON.stringify({ kind: 'msi' }));
    expect(detectInstaller(exe)).toBe('msi');
    writeFileSync(path.join(dir, 'installer.json'), 'rusak');
    expect(detectInstaller(exe)).toBeNull();
  });

  it('skrip pemasang: tunggu tray, msiexec pasif tanpa LAUNCHAPP, lalu nyalakan lagi dengan --restore', () => {
    const s = msiInstallScript({
      msi: "C:\\Users\\O'Brien\\updates\\p.msi",
      log: 'C:\\u\\msi.log',
      waitPid: 1234,
      relaunch: ['C:\\Program Files\\P\\prototyper.exe', '--home', 'C:\\h', 'tray', '--restore', 'kasir,landing'],
    });
    expect(s).toContain('Wait-Process -Id 1234');
    expect(s).toContain(`-ArgumentList '/i "C:\\Users\\O''Brien\\updates\\p.msi" /passive /norestart LAUNCHAPP=0 /l*v "C:\\u\\msi.log"' -Wait`);
    expect(s).toContain(`Start-Process -FilePath 'C:\\Program Files\\P\\prototyper.exe' -ArgumentList '"--home" "C:\\h" "tray" "--restore" "kasir,landing"'`);
    expect(s.split('\r\n').length).toBeGreaterThan(4);
  });

  it('WiX: per-user, versi numerik, upgrade code tetap, exe + installer.json + shortcut + PATH', () => {
    expect(msiVersion('0.3.0')).toBe('0.3.0');
    expect(msiVersion('1.2.3-beta.1')).toBe('1.2.3');
    const w = buildWxs({ version: '0.3.0-beta.1', exe: 'C:\\b\\prototyper.exe', installerJson: 'C:\\b\\installer.json', icon: 'C:\\a&b\\icon.ico', url: 'https://x' });
    expect(w).toContain('Version="0.3.0"');
    expect(w).toContain(`UpgradeCode="${MSI_UPGRADE_CODE}"`);
    for (const guid of Object.values(MSI_COMPONENT_GUIDS)) expect(w).toContain(`Guid="${guid}"`);
    expect(w).toContain('<RemoveFolder Id="RemoveProgramsDir" Directory="ProgramsDir"'); // ICE64
    expect(w).toContain('Scope="perUser"');
    expect(w).toContain('<MajorUpgrade');
    expect(w).toContain('Source="C:\\b\\prototyper.exe"');
    expect(w).toContain('Name="installer.json"');
    expect(w).toContain('SourceFile="C:\\a&amp;b\\icon.ico"');
    expect(w).toContain('<Shortcut');
    expect(w).toContain('<Environment Id="UserPath" Name="PATH"');
    expect(w).toContain('LAUNCHAPP = &quot;1&quot;');
    // wizard pilih folder, folder lama diingat
    expect(w).toContain('<ui:WixUI Id="WixUI_InstallDir" InstallDirectory="INSTALLFOLDER" />');
    expect(w).toContain('<RegistrySearch Id="PreviousInstallDir" Root="HKCU" Key="Software\\Prototyper" Name="InstallDir"');
    // nama notifikasi: shortcut ber-AUMID yang sama dengan host tray, registry dibersihkan saat uninstall
    expect(w).toContain(`<ShortcutProperty Key="System.AppUserModel.ID" Value="${TRAY_AUMID}" />`);
    expect(w).toContain(`Key="Software\\Classes\\AppUserModelId\\${TRAY_AUMID}" Action="removeOnUninstall"`);
    // wizard: centang "Launch Prototyper" di halaman selesai; tanpa wizard: LAUNCHAPP
    expect(w).toContain('<Publish Dialog="ExitDialog" Control="Finish" Event="DoAction" Value="LaunchApp" Condition="WIXUI_EXITDIALOGOPTIONALCHECKBOX = 1 AND NOT Installed" />');
    expect(w).toContain('Id="WIXUI_EXITDIALOGOPTIONALCHECKBOXTEXT" Value="Launch Prototyper"');
    expect(w).toContain('LAUNCHAPP = &quot;1&quot; AND UILevel &lt; 5');
    // di luar drive Windows tanpa rollback (Config.Msi drive lain tidak bisa ditulis per-user)
    expect(w).toContain('<SetProperty Id="DISABLEROLLBACK" Value="1" Before="InstallInitialize" Sequence="execute" Condition="NOT (INSTALLFOLDER &lt;&lt; WindowsVolume)" />');
    // tanpa jendela konsol: quit lewat WixQuietExec, launch = buka shortcut minimized lewat explorer
    expect(w).toContain('BinaryRef="Wix4UtilCA_$(sys.BUILDARCHSHORT)" DllEntry="WixQuietExec"');
    expect(w).toContain('<SetProperty Id="WixQuietExecCmdLine" Action="SetQuitUninstallCmd"');
    expect(w).toContain('Show="minimized"');
    expect(w).toContain('ExeCommand="&quot;[WindowsFolder]explorer.exe&quot; &quot;[ProgramMenuFolder]Prototyper.lnk&quot;"');
    expect(w).not.toContain('prototyperw');
    // uninstall menutup Prototyper lebih dulu
    expect(w).toContain('prototyper.exe&quot; quit --remove-startup');
    expect(w).toMatch(/<Custom Action="QuitAppUninstall" Before="InstallValidate"/);
  });
});

describe('prototyper quit', () => {
  function deps(o: { up?: boolean; tray?: number | null; startup?: string | null } = {}) {
    const calls: string[] = [];
    let startup = o.startup ?? null;
    const d: QuitDeps = {
      shutdownDaemon: async () => {
        calls.push('shutdown');
        return o.up ?? true;
      },
      trayPid: () => o.tray ?? null,
      killTree: (pid) => void calls.push(`kill ${pid}`),
      startup: {
        get: async () => startup,
        set: async (enabled) => {
          calls.push(`startup ${enabled}`);
          if (!enabled) startup = null;
        },
      },
      execPath: String.raw`C:\Users\a\AppData\Local\Programs\Prototyper\prototyper.exe`,
    };
    return { d, calls };
  }

  it('mematikan daemon lalu tray; startup tetap tanpa --remove-startup', async () => {
    const { d, calls } = deps({ tray: 42, startup: String.raw`"C:\Users\a\AppData\Local\Programs\Prototyper\prototyper.exe" "tray"` });
    expect(await quitPrototyper(d)).toEqual({ daemon: true, tray: 42, startupRemoved: false });
    expect(calls).toEqual(['shutdown', 'kill 42']);
  });

  it('--remove-startup hanya menghapus entri yang menunjuk ke exe ini (tanpa peka huruf besar)', async () => {
    const mine = deps({ up: false, startup: String.raw`"c:\users\a\appdata\local\programs\prototyper\PROTOTYPER.EXE" "tray"` });
    expect(await quitPrototyper(mine.d, { removeStartup: true })).toEqual({ daemon: false, tray: null, startupRemoved: true });
    expect(mine.calls).toContain('startup false');
    const other = deps({ startup: String.raw`"D:\Tools\prototyper.exe" "tray"` });
    expect((await quitPrototyper(other.d, { removeStartup: true })).startupRemoved).toBe(false);
    expect(other.calls).not.toContain('startup false');
  });

  it('daemon gagal dihubungi tetap lanjut menutup tray', async () => {
    const { d, calls } = deps({ tray: 7 });
    d.shutdownDaemon = async () => Promise.reject(new Error('timeout'));
    expect(await quitPrototyper(d)).toMatchObject({ daemon: false, tray: 7 });
    expect(calls).toEqual(['kill 7']);
  });
});

describe('identitas notifikasi tray', () => {
  it('host memasang AppUserModelID Prototyper sebelum NotifyIcon dibuat', () => {
    expect(HOST_SCRIPT).not.toContain('__AUMID__');
    const setId = HOST_SCRIPT.indexOf(`SetCurrentProcessExplicitAppUserModelID('${TRAY_AUMID}')`);
    expect(setId).toBeGreaterThan(0);
    expect(setId).toBeLessThan(HOST_SCRIPT.indexOf('New-Object System.Windows.Forms.NotifyIcon'));
    expect(HOST_SCRIPT).toContain(['HKCU:', 'Software', 'Classes', 'AppUserModelId', `${TRAY_AUMID}'`].join('\\'));
    expect(HOST_SCRIPT).toContain("-Name 'DisplayName' -Value 'Prototyper'");
  });
});
