import type { FastifyPluginAsync } from 'fastify';
import { AppError } from '../../core/errors.js';
import { pickPath, type PickOptions, type Runner } from '../../core/picker.js';

/**
 * `POST /api/pick` — buka dialog pilih file/folder bawaan OS di komputer ini dan kembalikan path
 * absolut yang dipilih. Seperti request non-GET lain, hanya bisa dari mesin lokal.
 * Body: { "kind": "folder" | "file", "title"?, "initial"?, "multiple"? }
 */
export const pickRoutes: FastifyPluginAsync<{ run?: Runner; platform?: NodeJS.Platform }> = async (app, opts) => {
  app.post<{ Body: { kind?: unknown; title?: unknown; initial?: unknown; multiple?: unknown } | null }>('/pick', async (req) => {
    const b = req.body ?? {};
    if (b.kind !== 'folder' && b.kind !== 'file') throw new AppError('BAD_REQUEST', 'Body harus berisi { "kind": "folder" | "file" }');
    const o: PickOptions = { kind: b.kind };
    if (typeof b.title === 'string' && b.title.trim()) o.title = b.title.trim().slice(0, 200);
    if (typeof b.initial === 'string' && b.initial.trim()) o.initial = b.initial.trim();
    if (b.multiple === true) o.multiple = true;
    return pickPath(o, { ...(opts.run ? { run: opts.run } : {}), ...(opts.platform ? { platform: opts.platform } : {}) });
  });
};
