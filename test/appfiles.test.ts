import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_DIR, APP_MODE, cliCommand, extractFiles, seaExtractDir } from '../src/core/appfiles.js';
import { tmpDir } from './helpers.js';

describe('appfiles', () => {
  it('dari source: APP_DIR = root repo (ada web/ dan package.json)', () => {
    expect(APP_MODE).toBe('source');
    expect(JSON.parse(readFileSync(path.join(APP_DIR, 'package.json'), 'utf8')).name).toBe('prototyper');
    expect(readFileSync(path.join(APP_DIR, 'web', 'index.html'), 'utf8')).toContain('<html');
  });

  it('cliCommand per mode distribusi', () => {
    const app = path.join('X', 'app');
    expect(cliCommand('sea', app, 'prototyper.exe')).toEqual(['prototyper.exe']);
    expect(cliCommand('bundle', app, 'node')).toEqual(['node', path.join(app, 'prototyper.cjs')]);
    expect(cliCommand('dist', app, 'node')).toEqual(['node', path.join(app, 'dist', 'cli', 'index.js')]);
    expect(cliCommand('source', app, 'node')).toEqual([
      'node',
      path.join(app, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
      path.join(app, 'src', 'cli', 'index.ts'),
    ]);
  });

  it('seaExtractDir mengikuti PROTOTYPER_HOME, default ~/.prototyper', () => {
    const home = path.resolve('H');
    expect(seaExtractDir('0.1.0-abc', {}, home)).toBe(path.join(home, '.prototyper', 'app', '0.1.0-abc'));
    expect(seaExtractDir('0.1.0-abc', { PROTOTYPER_HOME: path.resolve('D') }, home)).toBe(path.resolve('D', 'app', '0.1.0-abc'));
  });

  it('extractFiles menulis file yang belum ada dan tidak menimpa yang sudah ada', () => {
    const dir = tmpDir('prototyper-app-');
    const reads: string[] = [];
    const read = (name: string) => {
      reads.push(name);
      return new TextEncoder().encode(`isi ${name}`).buffer as ArrayBuffer;
    };
    extractFiles(dir, ['web/index.html', 'package.json'], read);
    expect(readFileSync(path.join(dir, 'web', 'index.html'), 'utf8')).toBe('isi web/index.html');
    writeFileSync(path.join(dir, 'package.json'), 'lama');
    extractFiles(dir, ['web/index.html', 'package.json'], read);
    expect(readFileSync(path.join(dir, 'package.json'), 'utf8')).toBe('lama');
    expect(reads).toEqual(['web/index.html', 'package.json']);
  });
});
