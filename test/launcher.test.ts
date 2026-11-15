import { describe, expect, it } from 'vitest';
import { isExplorerLaunch, parseTasklistImage } from '../src/cli/launcher.js';

describe('parseTasklistImage', () => {
  it('mengambil nama image dari CSV tasklist', () => {
    expect(parseTasklistImage('"explorer.exe","5432","Console","1","123.456 K"\r\n')).toBe('explorer.exe');
  });

  it('null bila tidak ada proses yang cocok', () => {
    expect(parseTasklistImage('INFO: No tasks are running which match the specified criteria.\r\n')).toBeNull();
    expect(parseTasklistImage('')).toBeNull();
  });
});

describe('isExplorerLaunch', () => {
  const base = { platform: 'win32' as const, mode: 'sea', args: [] as string[], parentImage: () => 'Explorer.EXE' };

  it('true untuk exe tanpa argumen yang dijalankan dari Explorer', () => {
    expect(isExplorerLaunch(base)).toBe(true);
  });

  it('false dari terminal, dengan argumen, di luar Windows, atau bukan biner tunggal', () => {
    expect(isExplorerLaunch({ ...base, parentImage: () => 'cmd.exe' })).toBe(false);
    expect(isExplorerLaunch({ ...base, parentImage: () => null })).toBe(false);
    expect(isExplorerLaunch({ ...base, args: ['list'] })).toBe(false);
    expect(isExplorerLaunch({ ...base, platform: 'linux' })).toBe(false);
    expect(isExplorerLaunch({ ...base, mode: 'bundle' })).toBe(false);
  });

  it('tidak memeriksa proses induk bila syarat lain tidak terpenuhi', () => {
    let called = false;
    isExplorerLaunch({ ...base, args: ['--help'], parentImage: () => ((called = true), 'explorer.exe') });
    expect(called).toBe(false);
  });
});
