import path from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { APP_DIR, APP_HOST } from '../core/appfiles.js';
import { resolveWebSwap, type HostInfo } from '../core/apphost.js';
import { AgentRunner, type AgentCommand, type AgentId } from '../core/agent.js';
import type { Config } from '../core/config.js';
import { AppError, errorBody } from '../core/errors.js';
import { Registry } from '../core/registry.js';
import { Runtime } from '../core/runtime.js';
import { StateStore, type StaleProcess } from '../core/state.js';
import { agentRoutes } from './routes/agent.js';
import { commentRoutes } from './routes/comments.js';
import { healthRoutes } from './routes/health.js';
import { prototypeRoutes } from './routes/prototypes.js';
import { VERSION } from '../version.js';

export interface BuildAppOptions {
  config: Config;
  logger?: FastifyServerOptions['logger'];
  /** Dipanggil oleh POST /api/shutdown. Tanpa ini endpoint tersebut 501. */
  onShutdown?: () => void;
  /** Untuk tes: ganti perintah agent (per id agent). */
  agentCommands?: Partial<Record<AgentId, AgentCommand>>;
  /** Untuk tes: folder Web UI awal + versinya (default `WEB_DIR`, `VERSION`). */
  web?: WebSource;
  /** Untuk tes: host exe (default `APP_HOST`; null di luar biner tunggal). */
  appHost?: Pick<HostInfo, 'root' | 'appDir' | 'runtime'> | null;
}

/** Asal Web UI yang sedang dilayani. Berganti tanpa restart lewat `POST /api/app/reload-web`. */
export interface WebSource {
  dir: string;
  version: string;
}

export interface AppContext {
  config: Config;
  registry: Registry;
  runtime: Runtime;
  agent: AgentRunner;
  state: StateStore;
  /** Proses command dari sesi daemon sebelumnya yang mungkin masih hidup. */
  staleProcesses: StaleProcess[];
  web: WebSource;
}

export const WEB_DIR = path.join(APP_DIR, 'web');

function isLoopback(ip: string): boolean {
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

export async function buildApp({ config, logger = false, onShutdown, agentCommands, web, appHost = APP_HOST }: BuildAppOptions): Promise<{
  app: FastifyInstance;
  ctx: AppContext;
}> {
  const state = new StateStore(config.home);
  await state.load();
  const staleProcesses = state.takeStaleProcesses();
  const registry = new Registry(config.home);
  const runtime = new Runtime(config, state);
  const agent = new AgentRunner(config, agentCommands);
  const ctx: AppContext = { config, registry, runtime, agent, state, staleProcesses, web: web ?? { dir: WEB_DIR, version: VERSION } };

  const app = Fastify({ logger, forceCloseConnections: true });
  const startedAt = Date.now();

  // Mode LAN: request yang mengubah state hanya boleh dari mesin lokal.
  app.addHook('onRequest', async (req) => {
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS' && !isLoopback(req.ip)) {
      throw new AppError('FORBIDDEN', 'Operasi ini hanya bisa dilakukan dari mesin lokal');
    }
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send(errorBody(err.code, err.message, err.details));
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      return reply.status(status).send(errorBody('BAD_REQUEST', (err as Error).message));
    }
    app.log.error(err);
    return reply.status(500).send(errorBody('INTERNAL', `Terjadi kesalahan internal: ${(err as Error).message}`));
  });

  app.setNotFoundHandler((req, reply) => {
    reply.status(404).send(errorBody('NOT_FOUND', `Route ${req.method} ${req.url} tidak ditemukan`));
  });

  app.addHook('onClose', async () => {
    await agent.stopAll();
    await runtime.stopAll();
  });

  await app.register(healthRoutes, { prefix: '/api', startedAt, lan: config.lan, home: config.home, workspace: config.workspace, version: () => ctx.web.version });
  await app.register(prototypeRoutes, { prefix: '/api', ctx });
  await app.register(commentRoutes, { prefix: '/api', registry });
  await app.register(agentRoutes, { prefix: '/api', registry, agent });

  app.post('/api/shutdown', async (_req, reply) => {
    if (!onShutdown) throw new AppError('NOT_IMPLEMENTED', 'Shutdown tidak tersedia');
    setTimeout(onShutdown, 50);
    return reply.send({ ok: true });
  });

  // Pembaruan yang hanya mengubah web/ (codeHash sama): pindah folder Web UI tanpa memulai ulang daemon
  // maupun prototype. Dipanggil tray setelah memasang paket aplikasi; lihat resolveWebSwap.
  app.post('/api/app/reload-web', async () => {
    if (!appHost) throw new AppError('NOT_IMPLEMENTED', 'Pembaruan tanpa restart hanya untuk prototyper.exe');
    const r = resolveWebSwap(appHost.root, appHost.appDir, appHost.runtime);
    if (!r.ok) throw new AppError('CONFLICT', `Perlu mulai ulang: ${r.reason}`);
    ctx.web = { dir: r.webDir, version: r.app.version };
    app.log.info(`Web UI dialihkan ke ${r.app.version} (${r.webDir})`);
    return { version: r.app.version, webDir: r.webDir };
  });

  // Web UI dilayani dari ctx.web.dir (bukan root tetap) agar bisa dialihkan saat daemon berjalan.
  await app.register(fastifyStatic, { root: ctx.web.dir, serve: false });
  app.get('/*', (req, reply) => {
    const rel = (req.params as { '*': string })['*'];
    return reply.sendFile(rel === '' || rel.endsWith('/') ? `${rel}index.html` : rel, ctx.web.dir);
  });

  return { app, ctx };
}
