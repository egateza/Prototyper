import type { FastifyPluginAsync } from 'fastify';
import { AGENT_IDS, isAgentId, type AgentInfo, type AgentRunInfo, type AgentRunner } from '../../core/agent.js';
import type { ResumeState } from '../../core/agentsession.js';
import { AppError } from '../../core/errors.js';
import type { LogLine } from '../../core/logs.js';
import type { Registry } from '../../core/registry.js';

type Params = { Params: { id: string } };

export interface AgentStateResponse {
  id: string;
  running: boolean;
  run: AgentRunInfo | null;
  /** Apakah run berikutnya dengan agent ini (?agent=, default agent bawaan) bisa melanjutkan sesi. */
  resume: ResumeState & { agent: string };
}

export interface AgentsResponse {
  default: string;
  agents: AgentInfo[];
}

/** Menjalankan Claude Code dari Web UI: /api/agent, /api/prototypes/:id/agent… */
export const agentRoutes: FastifyPluginAsync<{ registry: Registry; agent: AgentRunner }> = async (app, { registry, agent }) => {
  // Agent yang dikenal + statusnya di mesin ini. ?refresh=1 memaksa cek ulang.
  app.get<{ Querystring: { refresh?: string } }>('/agents', async (req): Promise<AgentsResponse> => ({
    default: agent.defaultAgent,
    agents: await agent.checkAll(req.query.refresh === '1' || req.query.refresh === 'true'),
  }));

  app.get<Params & { Querystring: { agent?: string } }>('/prototypes/:id/agent', async (req): Promise<AgentStateResponse> => {
    const p = await registry.require(req.params.id);
    const q = req.query.agent;
    if (q !== undefined && !isAgentId(q)) throw new AppError('BAD_REQUEST', `agent harus salah satu dari: ${AGENT_IDS.join(', ')}`);
    const which = isAgentId(q) ? q : agent.defaultAgent;
    return { id: p.id, running: agent.isRunning(p.id), run: agent.info(p.id), resume: { agent: which, ...(await agent.resumeInfo(p, which)) } };
  });

  app.post<Params & { Body: { agent?: unknown; commentIds?: unknown; message?: unknown; resume?: unknown } | null }>('/prototypes/:id/agent/run', async (req, reply) => {
    const p = await registry.require(req.params.id);
    const b = req.body ?? {};
    if (b.agent !== undefined && !isAgentId(b.agent)) throw new AppError('BAD_REQUEST', `agent harus salah satu dari: ${AGENT_IDS.join(', ')}`);
    let commentIds: string[] | undefined;
    if (b.commentIds !== undefined) {
      if (!Array.isArray(b.commentIds) || b.commentIds.some((x) => typeof x !== 'string' || !/^c\d+$/.test(x))) {
        throw new AppError('BAD_REQUEST', 'commentIds harus array id komentar, mis. ["c3"]');
      }
      commentIds = b.commentIds as string[];
    }
    if (b.message !== undefined && (typeof b.message !== 'string' || b.message.length > 2000)) {
      throw new AppError('BAD_REQUEST', 'message harus teks (maks. 2000 karakter)');
    }
    if (b.resume !== undefined && typeof b.resume !== 'boolean') throw new AppError('BAD_REQUEST', 'resume harus true atau false');
    const run = await agent.run(p, {
      ...(isAgentId(b.agent) ? { agent: b.agent } : {}),
      ...(typeof b.resume === 'boolean' ? { resume: b.resume } : {}),
      ...(commentIds ? { commentIds } : {}),
      ...(typeof b.message === 'string' ? { message: b.message } : {}),
    });
    reply.code(202);
    return { id: p.id, running: true, run };
  });

  app.post<Params>('/prototypes/:id/agent/stop', async (req) => {
    const p = await registry.require(req.params.id);
    const run = await agent.stop(p.id);
    return { id: p.id, running: agent.isRunning(p.id), run };
  });

  // Batalkan perubahan file dari run terakhir (checkpoint). force: timpa file yang diedit lagi sesudah run.
  app.post<Params & { Body: { force?: unknown } | null }>('/prototypes/:id/agent/undo', async (req) => {
    const p = await registry.require(req.params.id);
    const res = await agent.undo(p, { force: req.body?.force === true });
    return { id: p.id, running: agent.isRunning(p.id), ...res };
  });

  app.get<Params & { Querystring: { tail?: string } }>('/prototypes/:id/agent/logs', async (req) => {
    const p = await registry.require(req.params.id);
    const n = Math.max(0, Math.min(1000, Number(req.query.tail ?? 200) || 200));
    return { id: p.id, lines: (await agent.logs(p.id)).tail(n) };
  });

  app.get<Params & { Querystring: { tail?: string } }>('/prototypes/:id/agent/logs/stream', async (req, reply) => {
    const p = await registry.require(req.params.id);
    const store = await agent.logs(p.id);
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    const send = (l: LogLine) => res.write(`data: ${JSON.stringify(l)}\n\n`);
    for (const l of store.tail(Math.max(0, Math.min(1000, Number(req.query.tail ?? 200) || 200)))) send(l);
    store.on('line', send);
    const hb = setInterval(() => res.write(': ping\n\n'), 15_000);
    req.raw.on('close', () => {
      clearInterval(hb);
      store.off('line', send);
    });
  });
};
