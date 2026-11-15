import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRegQueryValue, StartupEntry, windowsCommandLine, type RegRunner } from '../src/core/startup.js';
import {
  compareVersions,
  downloadUpdate,
  evaluateRelease,
  fetchLatestRelease,
  oldExePath,
  parseRelease,
  parseSha256Sums,
  replaceExecutable,
  selfUpdateAssetName,
} from '../src/core/update.js';
import { loadConfig } from '../src/core/config.js';
import { tmpDir } from './helpers.js';

describe('versi & berkas rilis', () => {
  it('compareVersions', () => {
    expect(compareVersions('0.2.0', '0.1.9')).toBeGreaterThan(0);
    expect(compareVersions('v1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.0', '1.0.0-beta.2')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0-beta.10', '1.0.0-beta.2')).toBeGreaterThan(0);
    expect(compareVersions('0.10.0', '0.9.0')).toBeGreaterThan(0);
  });

  it('pemasangan otomatis hanya untuk biner tunggal Windows', () => {
    expect(selfUpdateAssetName('0.2.0', 'win32', 'x64', 'sea')).toBe('prototyper-0.2.0-win-x64.exe');
    expect(selfUpdateAssetName('0.2.0', 'win32', 'x64', 'bundle')).toBeNull();
    expect(selfUpdateAssetName('0.2.0', 'linux', 'x64', 'sea')).toBeNull();
  });

  it('parseSha256Sums membaca format sha256sum', () => {
    const h = 'a'.repeat(64);
    const m = parseSha256Sums(`${h}  prototyper-0.2.0-win-x64.exe\n${'b'.repeat(64)} *SHA.txt\r\nsampah\n`);
    expect(m.get('prototyper-0.2.0-win-x64.exe')).toBe(h);
    expect(m.get('SHA.txt')).toBe('b'.repeat(64));
    expect(m.size).toBe(2);
  });

  it('parseRelease + evaluateRelease', () => {
    const r = parseRelease({
      tag_name: 'v0.2.0',
      html_url: 'https://github.com/o/r/releases/tag/v0.2.0',
      assets: [
        { name: 'prototyper-0.2.0-win-x64.exe', browser_download_url: 'https://x/exe', size: 10 },
        { name: 'SHA256SUMS.txt', browser_download_url: 'https://x/sums', size: 1 },
        { name: 'rusak' },
      ],
    });
    expect(r.version).toBe('0.2.0');
    expect(r.assets).toHaveLength(2);
    const c = evaluateRelease('0.1.0', r, 'prototyper-0.2.0-win-x64.exe');
    expect(c.available).toBe(true);
    expect(c.asset?.url).toBe('https://x/exe');
    expect(c.checksums?.url).toBe('https://x/sums');
    expect(evaluateRelease('0.2.0', r, null)).toMatchObject({ available: false, asset: null });
    expect(() => parseRelease({ message: 'Not Found' })).toThrow(/tidak dikenali/);
  });

  it('fetchLatestRelease: 404 → pesan jelas', async () => {
    const fake = (async () => new Response('{}', { status: 404 })) as typeof fetch;
    await expect(fetchLatestRelease('o/r', '0.1.0', fake)).rejects.toThrow(/Belum ada rilis/);
    const ok = (async (url: string | URL | Request) => {
      expect(String(url)).toBe('https://api.github.com/repos/o/r/releases/latest');
      return Response.json({ tag_name: 'v0.3.0', html_url: 'h', assets: [] });
    }) as typeof fetch;
    expect((await fetchLatestRelease('o/r', '0.1.0', ok)).version).toBe('0.3.0');
  });
});

describe('downloadUpdate', () => {
  const data = Buffer.from('isi exe baru');
  const sha = createHash('sha256').update(data).digest('hex');
  const check = (sums: string) => ({
    ...evaluateRelease(
      '0.1.0',
      {
        version: '0.2.0',
        tag: 'v0.2.0',
        pageUrl: 'p',
        assets: [
          { name: 'a.exe', url: 'https://x/a.exe', size: data.length },
          { name: 'SHA256SUMS.txt', url: 'https://x/sums', size: 1 },
        ],
      },
      'a.exe',
    ),
    _sums: sums,
  });
  const fetcher = (sums: string) =>
    (async (url: string | URL | Request) =>
      String(url).endsWith('sums') ? new Response(sums) : new Response(data, { headers: { 'content-length': String(data.length) } })) as typeof fetch;

  it('mengunduh dan memverifikasi checksum', async () => {
    const dir = tmpDir('prototyper-upd-');
    const sums = `${sha}  a.exe\n`;
    const progress: number[] = [];
    const file = await downloadUpdate(check(sums), dir, (f) => progress.push(f), fetcher(sums));
    expect(readFileSync(file)).toEqual(data);
    expect(progress.at(-1)).toBe(1);
  });

  it('checksum tidak cocok / tidak tercantum → dibatalkan, berkas dibuang', async () => {
    const dir = tmpDir('prototyper-upd-');
    const bad = `${'0'.repeat(64)}  a.exe\n`;
    await expect(downloadUpdate(check(bad), dir, undefined, fetcher(bad))).rejects.toThrow(/Checksum/);
    expect(existsSync(path.join(dir, 'a.exe'))).toBe(false);
    expect(existsSync(path.join(dir, 'a.exe.download'))).toBe(false);
    await expect(downloadUpdate(check(''), dir, undefined, fetcher(''))).rejects.toThrow(/tidak tercantum/);
  });
});

describe('replaceExecutable', () => {
  it('exe lama dipindah ke .old, yang baru dipasang', () => {
    const dir = tmpDir('prototyper-exe-');
    const exe = path.join(dir, 'prototyper.exe');
    const dl = path.join(dir, 'baru.exe');
    writeFileSync(exe, 'lama');
    writeFileSync(dl, 'baru');
    replaceExecutable(exe, dl);
    expect(readFileSync(exe, 'utf8')).toBe('baru');
    expect(readFileSync(oldExePath(exe), 'utf8')).toBe('lama');
    expect(existsSync(dl)).toBe(false);
  });

  it('gagal menyalin → exe lama dikembalikan', () => {
    const dir = tmpDir('prototyper-exe-');
    const exe = path.join(dir, 'prototyper.exe');
    writeFileSync(exe, 'lama');
    expect(() => replaceExecutable(exe, path.join(dir, 'tidak-ada.exe'))).toThrow(/Gagal memasang/);
    expect(readFileSync(exe, 'utf8')).toBe('lama');
  });
});

describe('startup Windows', () => {
  it('windowsCommandLine mengutip argumen dengan aman', () => {
    expect(windowsCommandLine(['C:\\Program Files\\p.exe', 'tray', '--home', 'D:\\'])).toBe('"C:\\Program Files\\p.exe" "tray" "--home" "D:\\\\"');
    expect(windowsCommandLine(['a"b'])).toBe('"a\\"b"');
  });

  it('parseRegQueryValue', () => {
    const out = '\r\nHKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\r\n    Prototyper    REG_SZ    "C:\\p.exe" "tray"\r\n\r\n';
    expect(parseRegQueryValue(out)).toBe('"C:\\p.exe" "tray"');
    expect(parseRegQueryValue('ERROR: The system was unable to find the specified registry key or value.')).toBeNull();
  });

  it('StartupEntry memanggil reg add / delete / query', async () => {
    const calls: string[][] = [];
    let value: string | null = null;
    const reg: RegRunner = async (args) => {
      calls.push(args);
      if (args[0] === 'add') value = args[args.indexOf('/d') + 1]!;
      if (args[0] === 'delete') {
        if (value === null) return { code: 1, stdout: '', stderr: 'tidak ada' };
        value = null;
      }
      if (args[0] === 'query') {
        return value === null ? { code: 1, stdout: '', stderr: '' } : { code: 0, stdout: `    Prototyper    REG_SZ    ${value}\r\n`, stderr: '' };
      }
      return { code: 0, stdout: '', stderr: '' };
    };
    const s = new StartupEntry(reg);
    expect(await s.get()).toBeNull();
    await s.set(true, ['C:\\p.exe', 'tray']);
    expect(await s.get()).toBe('"C:\\p.exe" "tray"');
    await s.set(false, []);
    expect(await s.get()).toBeNull();
    await s.set(false, []); // menghapus yang tidak ada: bukan error
    expect(calls[1]).toEqual(['add', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', 'Prototyper', '/t', 'REG_SZ', '/d', '"C:\\p.exe" "tray"', '/f']);
  });
});

describe('config pembaruan', () => {
  it('default repo & PROTOTYPER_UPDATE_CHECK / PROTOTYPER_UPDATE_REPO', () => {
    expect(loadConfig({}, {})).toMatchObject({ updateRepo: 'egateza/Prototyper', updateCheck: true });
    expect(loadConfig({}, { PROTOTYPER_UPDATE_CHECK: '0', PROTOTYPER_UPDATE_REPO: 'saya/fork' })).toMatchObject({ updateRepo: 'saya/fork', updateCheck: false });
    expect(() => loadConfig({}, { PROTOTYPER_UPDATE_REPO: 'bukan repo' })).toThrow(/PROTOTYPER_UPDATE_REPO/);
  });
});
