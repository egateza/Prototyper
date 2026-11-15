import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildIco, windowsFileVersion } from '../scripts/winres.js';
import { EXAMPLES } from './helpers.js';

const ROOT = path.join(EXAMPLES, '..');

describe('resource Windows', () => {
  it('windowsFileVersion: a.b.c.0 tanpa sufiks prerelease', () => {
    expect(windowsFileVersion('0.1.0')).toBe('0.1.0.0');
    expect(windowsFileVersion('1.2.3-beta.4')).toBe('1.2.3.0');
    expect(windowsFileVersion('2')).toBe('2.0.0.0');
  });

  it('buildIco: header, entri (256 → 0), offset berurutan', () => {
    const a = Buffer.from('aaaa');
    const b = Buffer.from('bbbbbb');
    const ico = buildIco([{ size: 16, png: a }, { size: 256, png: b }]);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(2);
    expect([ico.readUInt8(6), ico.readUInt8(22)]).toEqual([16, 0]);
    const off1 = ico.readUInt32LE(6 + 12);
    const off2 = ico.readUInt32LE(22 + 12);
    expect(off1).toBe(6 + 32);
    expect(ico.subarray(off1, off1 + 4).toString()).toBe('aaaa');
    expect(ico.subarray(off2, off2 + 6).toString()).toBe('bbbbbb');
  });

  it('assets/icon.ico yang di-commit sinkron dengan icon.svg (jalankan npm run icon)', () => {
    const ico = readFileSync(path.join(ROOT, 'assets', 'icon.ico'));
    expect(ico.readUInt16LE(4)).toBe(7);
    expect(readFileSync(path.join(ROOT, 'web', 'favicon.svg'), 'utf8')).toBe(readFileSync(path.join(ROOT, 'assets', 'icon.svg'), 'utf8'));
  });
});
