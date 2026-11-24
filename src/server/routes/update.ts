import type { FastifyPluginAsync } from 'fastify';
import { AppError } from '../../core/errors.js';
import type { UpdateChecker, UpdateInfo } from '../../core/selfupdate.js';
import { defineMessages } from '../../core/i18n.js';

const t = defineMessages({
  id: {
    installing: 'Pembaruan sedang dipasang',
    upToDate: 'Prototyper {version} sudah versi terbaru',
    manualOnly: 'Instalasi ini tidak bisa diperbarui otomatis; unduh dari halaman rilis',
  },
  en: {
    installing: 'An update is being installed',
    upToDate: 'Prototyper {version} is already the latest version',
    manualOnly: 'This installation cannot be updated automatically; download it from the releases page',
  },
});

export interface UpdateRouteOptions {
  checker: UpdateChecker;
  /** Jalankan `prototyper update` terlepas dari daemon; mengembalikan path log. */
  install: () => string;
}

/**
 * `GET /api/update[?refresh=1]`: status pembaruan (di-cache). `POST /api/update/install`: pasang;
 * prosesnya menghentikan daemon ini lalu menyalakannya lagi, jadi Web UI menunggu `/api/health`.
 */
export const updateRoutes: FastifyPluginAsync<UpdateRouteOptions> = async (app, opts) => {
  app.get('/update', async (req): Promise<UpdateInfo> => {
    const q = req.query as { refresh?: string };
    return opts.checker.info(q.refresh === '1' || q.refresh === 'true');
  });

  app.post('/update/install', async () => {
    if (opts.checker.installing) throw new AppError('CONFLICT', t('installing'));
    const check = await opts.checker.fresh();
    if (!check.available) throw new AppError('CONFLICT', t('upToDate', { version: check.current }));
    if (!check.asset || !check.checksums) {
      throw new AppError('BAD_REQUEST', t('manualOnly'));
    }
    const log = opts.install();
    opts.checker.installing = true;
    return { ok: true, version: check.latest.version, log };
  });
};
