import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { agentPrompt } from '../src/core/agent.js';
import { resumeState, SessionStore, SESSIONS_FILE, type AgentSession } from '../src/core/agentsession.js';
import { addComment } from '../src/core/comments.js';
import type { ResolvedPrototype } from '../src/core/registry.js';
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

describe('resumeState', () => {
  const now = Date.parse('2026-11-16T12:00:00Z');
  const s: AgentSession = {
    agent: 'claude', sessionId: 'abc', cwd: path.resolve('/proto/a'), startedAt: '2026-11-16T09:00:00Z',
    endedAt: '2026-11-16T10:00:00Z', runs: 2, undoneAt: null,
  };
  const want = { agent: 'claude', cwd: path.resolve('/proto/a'), supported: true, hours: 24, now };

  it('bisa dilanjutkan bila agent, folder, dan umur cocok', () => {
    expect(resumeState(s, want)).toEqual({ resumable: true, session: s, reason: null });
  });

  it('tidak bisa: alasan dilaporkan', () => {
    expect(resumeState(null, want)).toMatchObject({ resumable: false, reason: null });
    expect(resumeState(s, { ...want, agent: 'codex' })).toMatchObject({ resumable: false, reason: null });
    expect(resumeState(s, { ...want, supported: false })).toMatchObject({ resumable: false });
    expect(resumeState({ ...s, undoneAt: '2026-11-16T10:05:00Z' }, want).reason).toMatch(/dibatalkan/);
    expect(resumeState(s, { ...want, cwd: path.resolve('/proto/b') }).reason).toMatch(/berpindah/);
    expect(resumeState(s, { ...want, hours: 1 }).reason).toMatch(/lebih dari 1 jam/);
    expect(resumeState(s, { ...want, hours: 0 }).reason).toMatch(/dimatikan/);
  });
});

describe('SessionStore', () => {
  it('menyimpan ke file, bertahan setelah dibuat ulang, dan bisa dihapus; file rusak = kosong', async () => {
    const home = tmpDir();
    const a = new SessionStore(home);
    const s: AgentSession = { agent: 'claude', sessionId: 'x', cwd: home, startedAt: 'a', endedAt: 'b', runs: 1, undoneAt: null };
    await a.update('p1', () => s);
    expect(await new SessionStore(home).get('p1')).toEqual(s);
    await a.update('p1', () => null);
    expect(await new SessionStore(home).get('p1')).toBeNull();

    const broken = tmpDir();
    const { writeFileSync } = await import('node:fs');
    writeFileSync(path.join(broken, SESSIONS_FILE), '{rusak');
    expect(await new SessionStore(broken).get('p1')).toBeNull();
  });
});

describe('prompt sesi lanjutan', () => {
  it('menyebut lanjutan sesi dan meminta file dibaca ulang', () => {
    const p = { id: 'pos', path: '/x', manifest: { name: 'POS' } } as unknown as ResolvedPrototype;
    expect(agentPrompt(p, { resumed: true })).toContain('lanjutan sesimu sebelumnya');
    expect(agentPrompt(p)).not.toContain('lanjutan sesimu');
  });
});

describe('API agent: lanjut sesi (agent palsu)', () => {
  let app: FastifyInstance;
  const config = testConfig();
  const dir = makePrototype({ id: 'sesi-uji', name: 'Sesi Uji', type: 'static' }, { 'index.html': '<p>x</p>' });
  const base = '/api/prototypes/sesi-uji/agent';
  const state = async (agent = 'claude') => (await app.inject({ method: 'GET', url: `${base}?agent=${agent}` })).json();
  const runs = () =>
    readFileSync(path.join(config.home, 'fake-claude-runs.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { args: string[]; prompt: string });
  const flag = (args: string[], name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const run = async (payload: Record<string, unknown>) => {
    const res = await app.inject({ method: 'POST', url: `${base}/run`, payload });
    expect(res.statusCode).toBe(202);
    return waitFor(state, (s) => !s.running);
  };

  beforeAll(async () => {
    ({ app } = await buildApp({ config, agentCommands: { claude: { bin: process.execPath, prefixArgs: [FAKE] }, codex: { bin: process.execPath, prefixArgs: [FAKE_TEXT] } } }));
    await app.inject({ method: 'POST', url: '/api/prototypes', payload: { path: dir } });
    for (let i = 0; i < 5; i++) await addComment(dir, { text: `komentar ${i + 1}` });
  });
  afterAll(async () => {
    await app.close();
  });

  it('run pertama: sesi baru ber-id; run kedua melanjutkannya', async () => {
    expect((await state()).resume).toMatchObject({ agent: 'claude', resumable: false });

    const first = await run({ commentIds: ['c1'] });
    expect(first.run).toMatchObject({ status: 'done', resumed: false });
    const id = flag(runs()[0]!.args, '--session-id');
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(first.run.sessionId).toBe(id);
    expect(first.resume).toMatchObject({ resumable: true, session: { sessionId: id, runs: 1 } });

    const second = await run({ commentIds: ['c2'] });
    expect(second.run).toMatchObject({ status: 'done', resumed: true, sessionId: id });
    const r2 = runs()[1]!;
    expect(flag(r2.args, '--resume')).toBe(id);
    expect(r2.args).not.toContain('--session-id');
    expect(r2.prompt).toContain('lanjutan sesimu sebelumnya');
    expect(second.resume.session).toMatchObject({ sessionId: id, runs: 2 });

    // tersimpan di PROTOTYPER_HOME (bertahan setelah daemon dimulai ulang)
    const saved = JSON.parse(readFileSync(path.join(config.home, SESSIONS_FILE), 'utf8'));
    expect(saved['sesi-uji']).toMatchObject({ agent: 'claude', sessionId: id, runs: 2 });
  }, 60_000);

  it('resume: false memulai sesi baru', async () => {
    const before = (await state()).resume.session.sessionId;
    const r = await run({ commentIds: ['c3'], resume: false });
    expect(r.run.resumed).toBe(false);
    const last = runs().at(-1)!;
    expect(flag(last.args, '--session-id')).not.toBe(before);
    expect(last.args).not.toContain('--resume');
    expect(r.resume.session).toMatchObject({ sessionId: flag(last.args, '--session-id'), runs: 1 });
    expect((await app.inject({ method: 'POST', url: `${base}/run`, payload: { resume: 'ya' } })).statusCode).toBe(400);
  }, 60_000);

  it('sesi hilang di agent: diulang otomatis dengan sesi baru', async () => {
    const gone = (await state()).resume.session.sessionId;
    rmSync(path.join(config.home, 'fake-claude-sessions', gone));
    const r = await run({ commentIds: ['c4'] });
    expect(r.run).toMatchObject({ status: 'done', resumed: false });
    expect(r.run.sessionId).not.toBe(gone);
    const all = runs();
    expect(flag(all.at(-2)!.args, '--resume')).toBe(gone);
    expect(flag(all.at(-1)!.args, '--session-id')).toBe(r.run.sessionId);
    const logs = (await app.inject({ method: 'GET', url: `${base}/logs` })).json().lines.map((l: { line: string }) => l.line);
    expect(logs.some((l: string) => l.includes('mengulang dengan sesi baru'))).toBe(true);
  }, 60_000);

  it('agent tanpa dukungan sesi (Codex) tidak bisa melanjutkan', async () => {
    expect((await state('codex')).resume).toMatchObject({ agent: 'codex', resumable: false });
    const r = await (async () => {
      await app.inject({ method: 'POST', url: `${base}/run`, payload: { agent: 'codex', commentIds: ['c5'] } });
      return waitFor(() => state('codex'), (s) => !s.running);
    })();
    expect(r.run).toMatchObject({ agent: 'codex', sessionId: null, resumed: false });
    expect((await app.inject({ method: 'GET', url: `${base}?agent=gpt` })).statusCode).toBe(400);
  }, 60_000);
});
