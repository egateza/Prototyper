import { spawnSync } from 'node:child_process';
import { cpSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bundleApp } from '../scripts/bundle.js';
import { EXAMPLES, tmpDir } from './helpers.js';

/**
 * Bundle rilis (dasar versi portable dan biner tunggal) harus berjalan tanpa node_modules:
 * CLI, daemon yang dinyalakan otomatis, Web UI, dan embed.js untuk prototype static.
 */
const DAEMON_PORT = 47170;
let bundle = '';
let home = '';
let env: NodeJS.ProcessEnv = {};

function cli(args: string[]): { code: number | null; stdout: string; json: unknown } {
  const r = spawnSync(process.execPath, [bundle, ...args], { encoding: 'utf8', env, timeout: 60_000 });
  let json: unknown = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    /* bukan JSON */
  }
  return { code: r.status, stdout: r.stdout, json };
}

describe('bundle rilis', () => {
  beforeAll(async () => {
    const out = await bundleApp(path.join(tmpDir('prototyper-bundle-'), 'app'));
    bundle = out.bundle;
    home = tmpDir('prototyper-home-');
    env = { ...process.env, PROTOTYPER_HOME: home, PROTOTYPER_PORT: String(DAEMON_PORT), PROTOTYPER_PORT_RANGE: '47160-47169', PROTOTYPER_WORKSPACE: path.join(home, 'ws') };
  }, 60_000);

  afterAll(() => {
    if (bundle) cli(['--json', 'shutdown']);
  });

  it('--version sama dengan package.json', () => {
    const pkg = JSON.parse(readFileSync(path.join(path.dirname(bundle), 'package.json'), 'utf8')) as { version: string };
    const r = cli(['--version']);
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe(pkg.version);
  });

  it('menjalankan prototype static lewat daemon: Web UI, embed.js, petunjuk agent', async () => {
    const dir = path.join(tmpDir('prototyper-proto-'), 'hello-static');
    cpSync(path.join(EXAMPLES, 'hello-static'), dir, { recursive: true });
    expect(cli(['--json', 'add', dir]).code).toBe(0);
    const started = cli(['--json', 'start', 'hello-static']);
    expect(started.code).toBe(0);
    const url = (started.json as { url: string }).url;

    const health = (await (await fetch(`http://localhost:${DAEMON_PORT}/api/health`)).json()) as { status: string };
    expect(health.status).toBe('ok');
    expect(await (await fetch(`http://localhost:${DAEMON_PORT}/`)).text()).toContain('<html');
    expect((await fetch(`${url}/__prototyper/embed.js`)).status).toBe(200);
    expect(readFileSync(path.join(dir, 'AGENTS.md'), 'utf8')).toContain(path.basename(bundle));
  }, 60_000);
});
