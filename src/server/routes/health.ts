import type { FastifyPluginAsync } from 'fastify';
import type { LanMode } from '../../core/config.js';

export interface HealthResponse {
  status: 'ok';
  /** Versi aplikasi yang dilayani; bisa berubah tanpa restart setelah pembaruan Web UI saja. */
  version: string;
  uptimeSec: number;
  /** true bila ada yang bisa dibuka dari LAN (mode `prototypes` atau `all`). */
  lan: boolean;
  /** Tidak ada di daemon < 0.3.11 (pakai `healthLanMode`). */
  lanMode?: LanMode;
  home: string;
  /** Folder induk default untuk prototype baru. */
  workspace: string;
}

/** Mode LAN daemon; daemon lama hanya mengirim `lan` (true = `--lan` = semua). */
export function healthLanMode(h: Pick<HealthResponse, 'lan' | 'lanMode'>): LanMode {
  return h.lanMode ?? (h.lan ? 'all' : 'off');
}

export const healthRoutes: FastifyPluginAsync<{ startedAt: number; lanMode: LanMode; home: string; workspace: string; version: () => string }> = async (
  app,
  opts,
) => {
  app.get('/health', async (): Promise<HealthResponse> => ({
    status: 'ok',
    version: opts.version(),
    uptimeSec: Math.round((Date.now() - opts.startedAt) / 1000),
    lan: opts.lanMode !== 'off',
    lanMode: opts.lanMode,
    home: opts.home,
    workspace: opts.workspace,
  }));
};
