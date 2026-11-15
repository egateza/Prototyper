import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/core/config.js';

describe('loadConfig', () => {
  it('memakai default bila env kosong', () => {
    const c = loadConfig({}, {});
    expect(c.port).toBe(4000);
    expect(c.host).toBe('127.0.0.1');
    expect(c.portRange).toEqual({ start: 4100, end: 4199 });
    expect(c.lan).toBe(false);
    expect(path.basename(c.home)).toBe('.prototyper');
  });

  it('membaca env dan override menang atas env', () => {
    const env = { PROTOTYPER_HOME: '/data/proto', PROTOTYPER_PORT: '5000', PROTOTYPER_PORT_RANGE: '6000-6010' };
    const c = loadConfig({ port: 5001, lan: true }, env);
    expect(c.home).toBe(path.resolve('/data/proto'));
    expect(c.port).toBe(5001);
    expect(c.portRange).toEqual({ start: 6000, end: 6010 });
    expect(c.host).toBe('0.0.0.0');
  });

  it('menolak port dan rentang yang tidak valid', () => {
    expect(() => loadConfig({}, { PROTOTYPER_PORT: 'abc' })).toThrow(/PROTOTYPER_PORT/);
    expect(() => loadConfig({}, { PROTOTYPER_PORT_RANGE: '4199-4100' })).toThrow(/terbalik/);
    expect(() => loadConfig({ port: 4150 }, {})).toThrow(/bentrok/);
  });
});
