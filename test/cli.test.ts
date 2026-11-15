import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { tmpDir } from './helpers.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const TSX = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const ENTRY = path.join(ROOT, 'src', 'cli', 'index.ts');

/** Jalankan CLI dengan home + workspace sementara; port daemon dibuat tidak terpakai. */
function cli(home: string, args: string[]): { code: number | null; json: Record<string, unknown> } {
  const r = spawnSync(process.execPath, [TSX, ENTRY, '--json', '--home', home, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, PROTOTYPER_PORT: '47199', PROTOTYPER_PORT_RANGE: '47150-47159', PROTOTYPER_WORKSPACE: path.join(home, 'ws') },
    timeout: 60_000,
  });
  return { code: r.status, json: JSON.parse(r.stdout || '{}') as Record<string, unknown> };
}

describe('CLI', () => {
  it('add: folder tanpa prototyper.json dideteksi, manifest ditulis, lalu didaftarkan', () => {
    const home = tmpDir('prototyper-home-');
    const dir = tmpDir('prototyper-proto-');
    writeFileSync(path.join(dir, 'index.html'), '<p>halo</p>');
    const r = cli(home, ['add', dir, '--id', 'deteksi-cli']);
    expect(r.code).toBe(0);
    expect(r.json).toMatchObject({ id: 'deteksi-cli', type: 'static', manifestCreated: true });
    expect(JSON.parse(readFileSync(path.join(dir, 'prototyper.json'), 'utf8')).id).toBe('deteksi-cli');
    expect((r.json.agentFiles as Array<{ action: string }>).map((f) => f.action)).toEqual(['created', 'created']);
    expect(readFileSync(path.join(dir, 'AGENTS.md'), 'utf8')).toContain('prototyper comments deteksi-cli');

    // agents sync: idempoten; setelah AGENTS.md dihapus, dibuat lagi
    rmSync(path.join(dir, 'AGENTS.md'));
    const sync = cli(home, ['agents', 'sync']);
    expect(sync.code).toBe(0);
    expect(sync.json).toMatchObject([{ id: 'deteksi-cli', files: [{ file: 'AGENTS.md', action: 'created' }, { file: 'CLAUDE.md', action: 'unchanged' }] }]);

    // --id saat manifest sudah ada ditolak
    const again = cli(home, ['add', dir, '--id', 'lain']);
    expect(again.code).toBe(1);
    expect(again.json).toMatchObject({ error: { code: 'BAD_REQUEST' } });
  }, 60_000);

  it('add: bentrok id tidak meninggalkan prototyper.json', () => {
    const home = tmpDir('prototyper-home-');
    const a = tmpDir('prototyper-proto-');
    const b = tmpDir('prototyper-proto-');
    writeFileSync(path.join(a, 'index.html'), 'a');
    writeFileSync(path.join(b, 'index.html'), 'b');
    expect(cli(home, ['add', a, '--id', 'sama']).code).toBe(0);
    const r = cli(home, ['add', b, '--id', 'sama']);
    expect(r.json).toMatchObject({ error: { code: 'CONFLICT' } });
    expect(existsSync(path.join(b, 'prototyper.json'))).toBe(false);
  }, 60_000);

  it('new: template static dari --from, JSON berisi path dan files', () => {
    const home = tmpDir('prototyper-home-');
    const html = path.join(tmpDir(), 'artifact.html');
    writeFileSync(html, '﻿<!doctype html><title>A</title>');
    const r = cli(home, ['new', 'dari-cli', '--from', html]);
    expect(r.code).toBe(0);
    expect(r.json).toMatchObject({ id: 'dari-cli', template: 'static', install: null });
    expect(r.json.path).toBe(path.join(home, 'ws', 'dari-cli'));
    expect(readFileSync(path.join(home, 'ws', 'dari-cli', 'index.html'), 'utf8')).toBe('<!doctype html><title>A</title>');
  }, 60_000);

  it('new: template vite dengan --no-install', () => {
    const home = tmpDir('prototyper-home-');
    const r = cli(home, ['new', 'vite-cli', '-t', 'vite-vanilla', '--no-install']);
    expect(r.code).toBe(0);
    expect(r.json).toMatchObject({ type: 'command', template: 'vite-vanilla', install: null });
  }, 60_000);

  it('comments: add, list (default open), resolve dengan --note', () => {
    const home = tmpDir('prototyper-home-');
    expect(cli(home, ['new', 'komen-cli']).code).toBe(0);
    const add = cli(home, ['comments', 'add', 'komen-cli', 'Perbesar tombol', '--page', '/kasir']);
    expect(add.json).toMatchObject({ id: 'c1', page: '/kasir', author: 'agent' });
    const list = cli(home, ['comments', 'komen-cli']);
    expect(list.json).toMatchObject({ id: 'komen-cli', counts: { open: 1, resolved: 0 } });
    const done = cli(home, ['comments', 'resolve', 'komen-cli', 'c1', '--note', 'Sudah']);
    expect(done.json).toMatchObject({ status: 'resolved', resolution: 'Sudah' });
    expect(cli(home, ['comments', 'komen-cli']).json).toMatchObject({ comments: [] });
    expect(cli(home, ['comments', 'list', 'komen-cli', '--all']).json.comments).toHaveLength(1);
    expect(cli(home, ['comments', 'reopen', 'komen-cli', 'c1']).json).toMatchObject({ status: 'open' });
    const ask = cli(home, ['comments', 'ask', 'komen-cli', 'c1', 'Warna?', '-o', 'Ungu', '-o', 'Hijau', '--multi']);
    expect(ask.json).toMatchObject({ waitingFor: 'user', pendingQuestions: ['c1-r1'] });
    expect((ask.json.replies as Array<Record<string, unknown>>)[0]).toMatchObject({ role: 'agent', options: ['Ungu', 'Hijau'], multi: true });
    expect(cli(home, ['comments', 'ask', 'komen-cli', 'c1', 'Satu opsi?', '-o', 'A']).json).toMatchObject({ error: { code: 'BAD_REQUEST' } });
    const missing = cli(home, ['comments', 'resolve', 'komen-cli', 'c9']);
    expect(missing.code).toBe(1);
    expect(missing.json).toMatchObject({ error: { code: 'NOT_FOUND' } });
  }, 120_000);
});
