import { cpSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, type Config } from '../src/core/config.js';

export const EXAMPLES = fileURLToPath(new URL('../examples/', import.meta.url));

export function tmpDir(prefix = 'prototyper-test-'): string {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Salinan contoh di folder sementara: mendaftarkan prototype menulis AGENTS.md, jadi jangan di repo. */
export function copyExample(name: string): string {
  const dir = path.join(tmpDir('prototyper-example-'), name);
  cpSync(path.join(EXAMPLES, name), dir, { recursive: true });
  return dir;
}

/** Config untuk tes: home sementara, rentang port tinggi agar tidak bentrok. */
export function testConfig(range = '47100-47149'): Config {
  return loadConfig({ home: tmpDir('prototyper-home-') }, { PROTOTYPER_PORT_RANGE: range });
}

/** Buat folder prototype dengan manifest dan file tambahan. */
export function makePrototype(manifest: Record<string, unknown>, files: Record<string, string> = {}): string {
  const dir = tmpDir('prototyper-proto-');
  writeFileSync(path.join(dir, 'prototyper.json'), JSON.stringify(manifest, null, 2));
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    writeFileSync(path.join(dir, name), content);
  }
  return dir;
}
