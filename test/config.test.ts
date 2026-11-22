import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { lanArgs, loadConfig } from '../src/core/config.js';

describe('loadConfig', () => {
  it('memakai default bila env kosong', () => {
    const c = loadConfig({}, {});
    expect(c.port).toBe(4000);
    expect(c.host).toBe('127.0.0.1');
    expect(c.portRange).toEqual({ start: 4100, end: 4199 });
    expect(c.lanMode).toBe('off');
    expect(c.prototypeHost).toBe('127.0.0.1');
    expect(path.basename(c.home)).toBe('.prototyper');
  });

  it('membaca env dan override menang atas env', () => {
    const env = { PROTOTYPER_HOME: '/data/proto', PROTOTYPER_PORT: '5000', PROTOTYPER_PORT_RANGE: '6000-6010' };
    const c = loadConfig({ port: 5001, lanMode: 'all' }, env);
    expect(c.home).toBe(path.resolve('/data/proto'));
    expect(c.port).toBe(5001);
    expect(c.portRange).toEqual({ start: 6000, end: 6010 });
    expect(c.host).toBe('0.0.0.0');
  });

  it('folder induk prototype dan desain sistem terpisah; bisa diatur lewat env', () => {
    const home = path.resolve('/data/proto');
    const def = loadConfig({}, { PROTOTYPER_HOME: home });
    expect(def.workspace).toBe(path.join(home, 'prototypes'));
    expect(def.dsWorkspace).toBe(path.join(home, 'design-systems'));
    const env = loadConfig({}, { PROTOTYPER_HOME: home, PROTOTYPER_WORKSPACE: '/kerja/proto', PROTOTYPER_DS_WORKSPACE: '/kerja/ds' });
    expect(env.workspace).toBe(path.resolve('/kerja/proto'));
    expect(env.dsWorkspace).toBe(path.resolve('/kerja/ds'));
  });

  it('mode LAN: semua (Web UI + prototype) atau prototype saja', () => {
    expect(loadConfig({}, { PROTOTYPER_LAN: '1' })).toMatchObject({ lanMode: 'all', host: '0.0.0.0', prototypeHost: '0.0.0.0' });
    expect(loadConfig({}, { PROTOTYPER_LAN: 'prototypes' })).toMatchObject({ lanMode: 'prototypes', host: '127.0.0.1', prototypeHost: '0.0.0.0' });
    expect(loadConfig({ lanMode: 'prototypes' }, { PROTOTYPER_LAN: '1' }).lanMode).toBe('prototypes');
    expect(loadConfig({}, { PROTOTYPER_LAN: '0' }).lanMode).toBe('off');
    expect(lanArgs('all')).toEqual(['--lan']);
    expect(lanArgs('prototypes')).toEqual(['--lan-prototypes']);
    expect(lanArgs('off')).toEqual([]);
  });

  it('menolak port dan rentang yang tidak valid', () => {
    expect(() => loadConfig({}, { PROTOTYPER_PORT: 'abc' })).toThrow(/PROTOTYPER_PORT/);
    expect(() => loadConfig({}, { PROTOTYPER_PORT_RANGE: '4199-4100' })).toThrow(/terbalik/);
    expect(() => loadConfig({ port: 4150 }, {})).toThrow(/bentrok/);
  });

  it('PROTOTYPER_AUTO_SYNC=0 mematikan sinkron otomatis petunjuk agent', () => {
    expect(loadConfig({}, {}).autoSyncAgents).toBe(true);
    expect(loadConfig({}, { PROTOTYPER_AUTO_SYNC: '0' }).autoSyncAgents).toBe(false);
  });
});
