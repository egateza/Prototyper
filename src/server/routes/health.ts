import type { FastifyPluginAsync } from 'fastify';
import { VERSION } from '../../version.js';

export interface HealthResponse {
  status: 'ok';
  version: string;
  uptimeSec: number;
  lan: boolean;
  home: string;
  /** Folder induk default untuk prototype baru. */
  workspace: string;
}

export const healthRoutes: FastifyPluginAsync<{ startedAt: number; lan: boolean; home: string; workspace: string }> = async (app, opts) => {
  app.get('/health', async (): Promise<HealthResponse> => ({
    status: 'ok',
    version: VERSION,
    uptimeSec: Math.round((Date.now() - opts.startedAt) / 1000),
    lan: opts.lan,
    home: opts.home,
    workspace: opts.workspace,
  }));
};
