import type { FastifyPluginAsync } from 'fastify';
import { AppError } from '../../core/errors.js';
import type { UpdateChecker, UpdateInfo } from '../../core/selfupdate.js';

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
    if (opts.checker.installing) throw new AppError('CONFLICT', 'Pembaruan sedang dipasang');
    const check = await opts.checker.fresh();
    if (!check.available) throw new AppError('CONFLICT', `Prototyper ${check.current} sudah versi terbaru`);
    if (!check.asset || !check.checksums) {
      throw new AppError('BAD_REQUEST', 'Instalasi ini tidak bisa diperbarui otomatis; unduh dari halaman rilis');
    }
    const log = opts.install();
    opts.checker.installing = true;
    return { ok: true, version: check.latest.version, log };
  });
};
