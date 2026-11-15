import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { agentPrompt, agentRules, AgentRunner, childEnv, describeEvent, ensureShim, expandWinVars, parseCodexWindowsSandbox, npmShimTarget, parseRegPath, resolveCommand, scriptRunner, withExtraPath } from '../src/core/agent.js';
import { addComment } from '../src/core/comments.js';
import { buildApp } from '../src/server/app.js';
import { makePrototype, testConfig, tmpDir } from './helpers.js';

const FAKE = fileURLToPath(new URL('./fixtures/fake-claude.mjs', import.meta.url));
const FAKE_TEXT = fileURLToPath(new URL('./fixtures/fake-text-agent.mjs', import.meta.url));

async function waitFor<T>(fn: () => Promise<T>, ok: (v: T) => boolean, ms = 30_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (ok(v) || Date.now() > end) return v;
    await new Promise((r) => setTimeout(r, 200));
  }
}

describe('agent (helper)', () => {
  it('describeEvent merangkum event stream-json', () => {
    const cwd = path.resolve('/proj');
    expect(describeEvent({ type: 'system', subtype: 'init', model: 'm' }, cwd)).toEqual(['sesi dimulai · model m']);
    expect(describeEvent({ type: 'assistant', message: { content: [
      { type: 'text', text: ' Halo ' },
      { type: 'tool_use', name: 'Edit', input: { file_path: path.join(cwd, 'index.html') } },
      { type: 'tool_use', name: 'Bash', input: { command: 'prototyper comments x --json' } },
    ] } }, cwd)).toEqual(['💬 Halo', '→ Edit index.html', '→ Bash: prototyper comments x --json']);
    expect(describeEvent({ type: 'user', message: { content: [{ type: 'tool_result', is_error: true, content: 'ditolak' }] } }, cwd)).toEqual(['✗ ditolak']);
    expect(describeEvent({ type: 'result', subtype: 'success', num_turns: 3 }, cwd)).toEqual(['✓ selesai (3 langkah)']);
  });

  it('env agent: penanda sesi Claude Code & hook debugger tidak diwariskan; shim di depan PATH', () => {
    const cfg = testConfig();
    const env = childEnv(cfg, 'SHIM', {
      Path: 'A', CLAUDECODE: '1', CLAUDE_CODE_SESSION_ID: 'x', CLAUDE_CODE_SSE_PORT: '1', CLAUDE_PID: '9',
      NODE_OPTIONS: '--require x', VSCODE_INSPECTOR_OPTIONS: '{}', CLAUDE_CONFIG_DIR: 'keep', CLAUDE_CODE_GIT_BASH_PATH: 'keep', HOME: 'h',
    });
    expect(env.Path).toBe(`SHIM${path.delimiter}A`);
    for (const k of ['CLAUDECODE', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_CODE_SSE_PORT', 'CLAUDE_PID', 'NODE_OPTIONS', 'VSCODE_INSPECTOR_OPTIONS']) expect(env[k]).toBeUndefined();
    expect(env).toMatchObject({ CLAUDE_CONFIG_DIR: 'keep', CLAUDE_CODE_GIT_BASH_PATH: 'keep', HOME: 'h', PROTOTYPER_HOME: cfg.home });
  });

  it('aturan per agent: Codex boleh membaca lewat shell; agent lain hanya shell prototyper', () => {
    expect(agentRules('codex')).toContain('Gunakan perintah shell untuk membaca dan mencari file');
    expect(agentRules('codex')).not.toContain('hanya `prototyper');
    for (const id of ['claude', 'gemini', 'copilot'] as const) expect(agentRules(id)).toContain('Perintah shell yang boleh dipakai hanya `prototyper …`');
  });

  it('prompt memuat id, fokus komentar, dan pesan', () => {
    const p = { id: 'pos', path: '/x', addedAt: '', manifest: null, error: null };
    const s = agentPrompt(p, { commentIds: ['c2', 'c4'], message: 'pakai warna ungu' });
    expect(s).toContain('(id `pos`)');
    expect(s).toContain('Fokus hanya pada komentar: c2, c4.');
    expect(s).toContain('Pesan dari pengguna: pakai warna ungu');
    expect(s).toContain('prototyper comments pos --waiting agent --json');
    expect(s).toContain('prototyper comments reply pos <commentId>');
    expect(s).toContain('Jangan menutup komentar');
    expect(agentRules('claude')).toContain('biarkan pengguna yang menutupnya');
  });
});

describe('API agent (dengan agent palsu)', () => {
  let app: FastifyInstance;
  const config = testConfig();
  const dir = makePrototype({ id: 'agen-uji', name: 'Agen Uji', type: 'static' }, { 'index.html': '<p>x</p>' });
  const base = '/api/prototypes/agen-uji/agent';
  const state = async () => (await app.inject({ method: 'GET', url: base })).json();

  beforeAll(async () => {
    ({ app } = await buildApp({ config, agentCommands: { claude: { bin: process.execPath, prefixArgs: [FAKE] }, codex: { bin: process.execPath, prefixArgs: [FAKE_TEXT] } } }));
    await app.inject({ method: 'POST', url: '/api/prototypes', payload: { path: dir } });
  });
  afterAll(async () => {
    await app.close();
  });

  it('ketersediaan agent', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/agents' });
    const claude = res.json().agents.find((a: { id: string }) => a.id === 'claude');
    expect(res.json().default).toBe('claude');
    expect(claude).toMatchObject({ name: 'Claude Code', available: true, version: '9.9.9 (Fake Claude)', support: 'tested' });
    expect(res.json().agents.map((a: { id: string }) => a.id)).toEqual(['claude', 'codex', 'gemini', 'copilot']);
  });

  it('run: agent memanggil `prototyper` lewat shim dan menyelesaikan komentar; log terbaca', async () => {
    await addComment(dir, { text: 'Perbesar judul' });
    const start = await app.inject({ method: 'POST', url: `${base}/run`, payload: { commentIds: ['c1'] } });
    expect(start.statusCode).toBe(202);
    expect(start.json()).toMatchObject({ running: true, run: { status: 'running', commentIds: ['c1'] } });
    // tidak boleh dua run bersamaan
    const dup = await app.inject({ method: 'POST', url: `${base}/run`, payload: {} });
    expect([409, 202]).toContain(dup.statusCode); // 202 hanya bila run pertama sudah selesai secepat kilat

    const done = await waitFor(state, (s) => !s.running);
    expect(done.run).toMatchObject({ agent: 'claude', status: 'done', exitCode: 0, summary: 'Komentar selesai.', turns: 2 });

    const comments = (await app.inject({ method: 'GET', url: '/api/prototypes/agen-uji/comments' })).json();
    expect(comments.comments[0]).toMatchObject({ id: 'c1', status: 'resolved', resolution: 'Dikerjakan agent palsu', resolvedBy: 'agent' });

    const logs = (await app.inject({ method: 'GET', url: `${base}/logs` })).json().lines.map((l: { line: string }) => l.line);
    expect(logs.some((l: string) => l.includes('→ Bash: prototyper comments resolve agen-uji c1'))).toBe(true);
    expect(logs.some((l: string) => l.includes('✓ selesai'))).toBe(true);
    expect(existsSync(path.join(config.home, 'bin', 'prototyper.cmd'))).toBe(true);
    expect(readFileSync(path.join(config.home, 'bin', 'prototyper'), 'utf8').startsWith('#!/bin/sh')).toBe(true);
  }, 60_000);

  it('agent lain (teks, mis. Codex): dipilih lewat body.agent; output teks jadi log + ringkasan', async () => {
    await addComment(dir, { text: 'Ganti warna' });
    const agents = (await app.inject({ method: 'GET', url: '/api/agents' })).json().agents;
    expect(agents.find((a: { id: string }) => a.id === 'codex')).toMatchObject({ available: true, version: 'codex-cli 0.0.0-fake', support: 'tested' });
    const start = await app.inject({ method: 'POST', url: `${base}/run`, payload: { agent: 'codex', commentIds: ['c2'] } });
    expect(start.statusCode).toBe(202);
    const done = await waitFor(state, (s) => !s.running);
    expect(done.run).toMatchObject({ agent: 'codex', status: 'done', exitCode: 0 });
    expect(done.run.summary).toContain('Ringkasan: semua beres.');
    const c2 = (await app.inject({ method: 'GET', url: '/api/prototypes/agen-uji/comments' })).json().comments.find((c: { id: string }) => c.id === 'c2');
    expect(c2).toMatchObject({ status: 'resolved', resolution: 'Dikerjakan agent teks' });
    const logs = (await app.inject({ method: 'GET', url: `${base}/logs` })).json().lines.map((l: { line: string }) => l.line);
    expect(logs.some((l: string) => l.includes('agent: OpenAI Codex ·'))).toBe(true);
    expect(logs.some((l: string) => l.includes('[args] exec --ignore-user-config --sandbox workspace-write'))).toBe(true);
    expect((await app.inject({ method: 'POST', url: `${base}/run`, payload: { agent: 'chatgpt' } })).statusCode).toBe(400);
  }, 60_000);

  it('stop menghentikan agent yang menggantung', async () => {
    const start = await app.inject({ method: 'POST', url: `${base}/run`, payload: { message: 'TUNGGU' } });
    expect(start.statusCode).toBe(202);
    await new Promise((r) => setTimeout(r, 500));
    expect((await state()).running).toBe(true);
    const stop = await app.inject({ method: 'POST', url: `${base}/stop` });
    expect(stop.json()).toMatchObject({ running: false, run: { status: 'stopped' } });
  }, 60_000);

  it('validasi + hanya dari loopback', async () => {
    expect((await app.inject({ method: 'POST', url: `${base}/run`, payload: { commentIds: ['x; rm'] } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: `${base}/run`, remoteAddress: '192.168.1.7', payload: {} })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/prototypes/tidak-ada/agent' })).statusCode).toBe(404);
  });
});

describe('agent tidak tersedia', () => {
  it('run ditolak dengan pesan jelas', async () => {
    const { app } = await buildApp({ config: testConfig(), agentCommands: { claude: { bin: 'perintah-yang-tidak-ada-xyz', prefixArgs: [] } } });
    const dir = makePrototype({ id: 'tanpa-agen', name: 'T', type: 'static' }, { 'index.html': 'x' });
    await app.inject({ method: 'POST', url: '/api/prototypes', payload: { path: dir } });
    const agents = (await app.inject({ method: 'GET', url: '/api/agents' })).json().agents;
    expect(agents.find((a: { id: string }) => a.id === 'claude')).toMatchObject({ available: false });
    const res = await app.inject({ method: 'POST', url: '/api/prototypes/tanpa-agen/agent/run', payload: {} });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('deteksi agent di PATH', () => {
  it('shim npm .cmd diarahkan ke skrip JS-nya; .exe dipakai langsung', () => {
    const bin = tmpDir('prototyper-bin-');
    mkdirSync(path.join(bin, 'node_modules', '@openai', 'codex', 'bin'), { recursive: true });
    const js = path.join(bin, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
    writeFileSync(js, '');
    // Format shim npm (cmd-shim) untuk paket global.
    writeFileSync(
      path.join(bin, 'codex.cmd'),
      ['@ECHO off', 'SET dp0=%~dp0', String.raw`"%_prog%"  "%dp0%\node_modules\@openai\codex\bin\codex.js" %*`, ''].join('\r\n'),
    );
    expect(npmShimTarget(path.join(bin, 'codex.cmd'))).toBe(js);
    if (process.platform === 'win32') {
      expect(resolveCommand('codex', { PATH: bin })).toEqual({ bin: process.execPath, prefixArgs: [js], path: path.join(bin, 'codex.cmd') });
      writeFileSync(path.join(bin, 'claude.exe'), '');
      expect(resolveCommand('claude', { PATH: bin })?.bin).toBe(path.join(bin, 'claude.exe'));
      // biner tunggal tanpa node di PATH: shim npm tidak bisa dijalankan
      expect(resolveCommand('codex', { PATH: bin }, null)).toBeNull();
      expect(resolveCommand('codex', { PATH: bin }, 'C:\\node\\node.exe')?.bin).toBe('C:\\node\\node.exe');
    }
    expect(resolveCommand('tidak-ada-xyz', { PATH: bin })).toBeNull();
  });

  it('scriptRunner: Node yang sedang berjalan, kecuali di biner tunggal (pakai node dari PATH)', () => {
    expect(scriptRunner({ PATH: '' }, 'dist')).toBe(process.execPath);
    expect(scriptRunner({ PATH: '' }, 'sea')).toBeNull();
    const bin = tmpDir('prototyper-bin-');
    const node = path.join(bin, process.platform === 'win32' ? 'node.exe' : 'node');
    writeFileSync(node, '');
    expect(scriptRunner({ PATH: bin }, 'sea')).toBe(node);
  });

  it('ensureShim: skrip prototyper(.cmd) memanggil perintah CLI yang diberikan', async () => {
    const home = tmpDir('prototyper-home-');
    const dir = await ensureShim(home, ['C:\\Apps\\prototyper.exe']);
    expect(readFileSync(path.join(dir, 'prototyper.cmd'), 'utf8')).toBe('@echo off\r\n"C:\\Apps\\prototyper.exe" %*\r\n');
    expect(readFileSync(path.join(dir, 'prototyper'), 'utf8')).toBe('#!/bin/sh\nexec "C:/Apps/prototyper.exe" "$@"\n');
  });

  it('checkAll: agent tanpa executable dilaporkan tidak tersedia beserta cara install', async () => {
    const runner = new AgentRunner(testConfig(), {}, { PATH: tmpDir('prototyper-empty-') });
    const all = await runner.checkAll();
    expect(all.map((a) => a.available)).toEqual([false, false, false, false]);
    expect(all.find((a) => a.id === 'codex')?.install).toContain('@openai/codex');
  });
});

describe('PATH terbaru dari registry', () => {
  it('parseRegPath + expandWinVars', () => {
    const out = '\r\nHKEY_CURRENT_USER\\Environment\r\n    Path    REG_EXPAND_SZ    %USERPROFILE%\\bin;D:\\npm-global\r\n\r\n';
    expect(parseRegPath(out)).toBe('%USERPROFILE%\\bin;D:\\npm-global');
    expect(parseRegPath('ERROR: not found')).toBeNull();
    expect(expandWinVars('%userprofile%\\bin;%TIDAK_ADA%', { USERPROFILE: 'C:\\Users\\x' })).toBe('C:\\Users\\x\\bin;%TIDAK_ADA%');
  });

  it('withExtraPath menambahkan direktori baru di akhir tanpa duplikat', () => {
    const d = path.delimiter;
    const env = withExtraPath({ Path: ['A', 'B'].map((x) => path.resolve(x)).join(d) }, [path.resolve('B'), path.resolve('C')]);
    expect(env.Path).toBe(['A', 'B', 'C'].map((x) => path.resolve(x)).join(d));
    const same = { Path: path.resolve('A') };
    expect(withExtraPath(same, [path.resolve('A')])).toBe(same);
  });
});

describe('Codex: [windows] sandbox dari config.toml', () => {
  it('hanya kunci sandbox di bagian [windows] yang dibaca', () => {
    const toml = ['model = "x"', '[features]', 'sandbox = "salah"', '[windows]', '# komentar', "sandbox = 'elevated'", '[desktop]', 'sandbox = "lain"'].join('\n');
    expect(parseCodexWindowsSandbox(toml)).toBe('elevated');
    expect(parseCodexWindowsSandbox('model = "x"\n[windows]\n')).toBeNull();
    expect(parseCodexWindowsSandbox('[windows.extra]\nsandbox = "x"')).toBeNull();
  });
});
