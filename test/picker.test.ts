import { describe, expect, it } from 'vitest';
import { pickerCommands, pickPath, type RunResult, type Runner } from '../src/core/picker.js';
import { buildApp } from '../src/server/app.js';
import { testConfig } from './helpers.js';

const ok = (stdout: string): RunResult => ({ code: 0, stdout, stderr: '', missing: false });
const fake = (results: Record<string, RunResult>, calls: string[] = []): Runner => async (cmd) => {
  calls.push(cmd);
  return results[cmd] ?? { code: null, stdout: '', stderr: 'ENOENT', missing: true };
};

describe('pickerCommands', () => {
  it('Windows: PowerShell STA dengan parameter lewat env (bukan argumen)', () => {
    const [c] = pickerCommands('win32', { kind: 'file', multiple: true, title: 'Pilih "x"', initial: 'D:\\Proyek' });
    expect(c?.cmd).toBe('powershell.exe');
    expect(c?.args).toContain('-STA');
    expect(c?.env).toMatchObject({ PROTOTYPER_PICK_KIND: 'file', PROTOTYPER_PICK_MULTI: '1', PROTOTYPER_PICK_TITLE: 'Pilih "x"', PROTOTYPER_PICK_INITIAL: 'D:\\Proyek' });
    expect(c?.env.PROTOTYPER_PICK_CS).toContain('IFileOpenDialog');
    const script = Buffer.from(c?.args.at(-1) ?? '', 'base64').toString('utf16le');
    expect(script).toContain('[ProtoPicker]::Pick');
    // folder tidak pernah multi
    expect(pickerCommands('win32', { kind: 'folder', multiple: true })[0]?.env.PROTOTYPER_PICK_MULTI).toBe('0');
  });

  it('macOS: osascript dengan string yang di-escape; Linux: zenity lalu kdialog', () => {
    const [mac] = pickerCommands('darwin', { kind: 'folder', title: 'Pilih "a"', initial: '/Users/a b' });
    expect(mac?.args[1]).toBe('POSIX path of (choose folder with prompt "Pilih \\"a\\"" default location (POSIX file "/Users/a b"))');
    const linux = pickerCommands('linux', { kind: 'file', multiple: true, initial: '/home/a' });
    expect(linux.map((c) => c.cmd)).toEqual(['zenity', 'kdialog']);
    expect(linux[0]?.args).toEqual(expect.arrayContaining(['--multiple', '--filename=/home/a/']));
    expect(linux[0]?.args).not.toContain('--directory');
  });
});

describe('pickPath', () => {
  it('mengembalikan path terpilih (CRLF, dinormalkan)', async () => {
    const r = await pickPath({ kind: 'file', multiple: true }, { platform: 'win32', run: fake({ 'powershell.exe': ok('D:\\a\\x.css\r\nD:\\a\\b\\..\\y.css\r\n') }) });
    expect(r).toEqual({ paths: ['D:\\a\\x.css', 'D:\\a\\y.css'], cancelled: false });
  });

  it('dibatalkan → cancelled, tanpa error', async () => {
    const r = await pickPath({ kind: 'folder' }, { platform: 'win32', run: fake({ 'powershell.exe': { code: 3, stdout: '', stderr: '', missing: false } }) });
    expect(r).toEqual({ paths: [], cancelled: true });
  });

  it('Linux: zenity tidak ada → kdialog; keduanya tidak ada → NOT_IMPLEMENTED', async () => {
    const calls: string[] = [];
    const r = await pickPath({ kind: 'folder' }, { platform: 'linux', run: fake({ kdialog: ok('/home/a/proto\n') }, calls) });
    expect(calls).toEqual(['zenity', 'kdialog']);
    expect(r.paths).toEqual(['/home/a/proto']);
    await expect(pickPath({ kind: 'folder' }, { platform: 'linux', run: fake({}) })).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
  });

  it('gagal → INTERNAL dengan pesan stderr; satu dialog sekaligus', async () => {
    await expect(pickPath({ kind: 'folder' }, { platform: 'darwin', run: fake({ osascript: { code: 2, stdout: '', stderr: 'boom', missing: false } }) }))
      .rejects.toMatchObject({ code: 'INTERNAL', message: expect.stringContaining('boom') });

    let release: (v: RunResult) => void = () => undefined;
    const slow: Runner = () => new Promise((res) => { release = res; });
    const first = pickPath({ kind: 'folder' }, { platform: 'win32', run: slow });
    await expect(pickPath({ kind: 'folder' }, { platform: 'win32', run: slow })).rejects.toMatchObject({ code: 'CONFLICT' });
    release(ok('C:\\x'));
    expect((await first).paths).toEqual(['C:\\x']);
  });
});

describe('POST /api/pick', () => {
  it('validasi, hanya lokal, dan meneruskan opsi', async () => {
    const seen: Array<Record<string, string>> = [];
    const run: Runner = async (_cmd, _args, env) => {
      seen.push(env);
      return ok('D:\\Proyek\\kasir\r\n');
    };
    const { app } = await buildApp({ config: testConfig(), picker: { run, platform: 'win32' } });
    try {
      const bad = await app.inject({ method: 'POST', url: '/api/pick', payload: { kind: 'disk' } });
      expect(bad.statusCode).toBe(400);
      const lan = await app.inject({ method: 'POST', url: '/api/pick', remoteAddress: '192.168.1.5', payload: { kind: 'folder' } });
      expect(lan.statusCode).toBe(403);
      const res = await app.inject({ method: 'POST', url: '/api/pick', payload: { kind: 'folder', title: 'Pilih', initial: 'D:\\Proyek' } });
      expect(res.json()).toEqual({ paths: ['D:\\Proyek\\kasir'], cancelled: false });
      expect(seen[0]).toMatchObject({ PROTOTYPER_PICK_KIND: 'folder', PROTOTYPER_PICK_TITLE: 'Pilih', PROTOTYPER_PICK_INITIAL: 'D:\\Proyek' });
    } finally {
      await app.close();
    }
  });
});
