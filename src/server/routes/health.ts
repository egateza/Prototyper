import type { FastifyPluginAsync } from 'fastify';

export interface HealthResponse {
  status: 'ok';
  /** Versi aplikasi yang dilayani; bisa berubah tanpa restart setelah pembaruan Web UI saja. */
  version: string;
  uptimeSec: number;
  lan: boolean;
  home: string;
  /** Folder induk default untuk prototype baru. */
  workspace: string;
}

export const healthRoutes: FastifyPluginAsync<{ startedAt: number; lan: boolean; home: string; workspace: string; version: () => string }> = async (
  app,
  opts,
) => {
  app.get('/health', async (): Promise<HealthResponse> => ({
    status: 'ok',
    version: opts.version(),
    uptimeSec: Math.round((Date.now() - opts.startedAt) / 1000),
    lan: opts.lan,
    home: opts.home,
    workspace: opts.workspace,
  }));
};
