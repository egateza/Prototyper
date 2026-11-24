import type { FastifyPluginAsync } from 'fastify';
import type { LanMode } from '../../core/config.js';
import type { Access } from '../access.js';
import type { LangSetting, Locale } from '../../core/i18n.js';
import type { LangState } from '../../core/settings.js';

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
  /** Folder induk default desain sistem baru. */
  dsWorkspace: string;
  /** Hak akses peminta: `local` (komputer ini), `device` (HP terpasang), `none`. Tidak ada di daemon lama. */
  access?: Access;
  /** Nama perangkat terpasang (bila access = `device`). */
  device?: string;
  /**
   * Bahasa (tidak ada di daemon < 0.5). `setting`: pengaturan pengguna; `locale`: bahasa daemon/OS
   * (dipakai tray); `requestLocale`: bahasa respons untuk peminta ini (auto → Accept-Language).
   */
  lang?: { setting: LangSetting; locale: Locale; requestLocale: Locale; fromEnv: boolean };
}

/** Mode LAN daemon; daemon lama hanya mengirim `lan` (true = `--lan` = semua). */
export function healthLanMode(h: Pick<HealthResponse, 'lan' | 'lanMode'>): LanMode {
  return h.lanMode ?? (h.lan ? 'all' : 'off');
}

export const healthRoutes: FastifyPluginAsync<{ startedAt: number; lanMode: LanMode; home: string; workspace: string; dsWorkspace: string; version: () => string; lang: () => LangState }> = async (
  app,
  opts,
) => {
  app.get('/health', async (req): Promise<HealthResponse> => {
    // Health terbuka untuk perangkat yang belum dipasangkan; jangan bocorkan path komputer ini.
    const known = req.access !== 'none';
    return {
      status: 'ok',
      version: opts.version(),
      uptimeSec: Math.round((Date.now() - opts.startedAt) / 1000),
      lan: opts.lanMode !== 'off',
      lanMode: opts.lanMode,
      home: known ? opts.home : '',
      workspace: known ? opts.workspace : '',
      dsWorkspace: known ? opts.dsWorkspace : '',
      access: req.access,
      ...(req.device ? { device: req.device.name } : {}),
      lang: { ...opts.lang(), requestLocale: req.locale },
    };
  });
};
