import { createReadStream, promises as fs } from 'node:fs';
import type { FastifyPluginAsync } from 'fastify';
import { ATTACHMENT_BODY_LIMIT, attachmentFile, attachmentName, attachmentType, saveAttachment, SVG_CSP, type Attachment } from '../../core/attachments.js';
import {
  addComment,
  commentContext,
  countComments,
  deleteComment,
  listComments,
  reopenComment,
  replyComment,
  resolveComment,
  type Comment,
  type CommentCounts,
} from '../../core/comments.js';
import { AppError } from '../../core/errors.js';
import type { Registry } from '../../core/registry.js';

type Params = { Params: { id: string } };
type CParams = { Params: { id: string; cid: string } };
type Body = Record<string, unknown> | null;

export interface CommentsResponse {
  id: string;
  counts: CommentCounts;
  comments: Comment[];
}

const flag = (v: unknown) => v === '1' || v === 'true';

function parseStatus(v: unknown): 'open' | 'resolved' | 'all' {
  if (v === undefined || v === '') return 'all';
  if (v === 'open' || v === 'resolved' || v === 'all') return v;
  throw new AppError('BAD_REQUEST', 'status harus open, resolved, atau all');
}

/** Komentar per prototype: /api/prototypes/:id/comments… */
export const commentRoutes: FastifyPluginAsync<{ registry: Registry }> = async (app, { registry }) => {
  const dirOf = async (id: string) => (await registry.require(id)).path;

  app.get<Params & { Querystring: { status?: string; page?: string; waiting?: string; archive?: string } }>(
    '/prototypes/:id/comments',
    async (req): Promise<CommentsResponse> => {
      const p = await registry.require(req.params.id);
      const w = req.query.waiting;
      if (w !== undefined && w !== 'user' && w !== 'agent') throw new AppError('BAD_REQUEST', 'waiting harus user atau agent');
      const comments = await listComments(p.path, {
        status: parseStatus(req.query.status),
        ...(req.query.page !== undefined ? { page: req.query.page } : {}),
        ...(w ? { waitingFor: w } : {}),
        includeArchive: flag(req.query.archive),
      });
      return { id: p.id, counts: countComments(p.path), comments };
    },
  );

  // Konteks untuk agent: thread + komentar selesai terkait + keputusan dari DECISIONS.md.
  app.get<CParams & { Querystring: { archive?: string } }>('/prototypes/:id/comments/:cid/context', async (req) =>
    commentContext(await dirOf(req.params.id), req.params.cid, { includeArchive: flag(req.query.archive) }),
  );

  app.post<Params & { Body: Body }>('/prototypes/:id/comments', async (req, reply) => {
    const b = req.body ?? {};
    const c = await addComment(await dirOf(req.params.id), { text: b.text, page: b.page, author: b.author, role: b.role, anchor: b.anchor, attachments: b.attachments });
    reply.code(201);
    return c;
  });

  app.post<CParams & { Body: Body }>('/prototypes/:id/comments/:cid/replies', async (req, reply) => {
    const b = req.body ?? {};
    const c = await replyComment(await dirOf(req.params.id), req.params.cid, {
      text: b.text, author: b.author, role: b.role, options: b.options, multi: b.multi, answerTo: b.answerTo, choices: b.choices, attachments: b.attachments,
    });
    reply.code(201);
    return c;
  });

  app.post<CParams & { Body: Body }>('/prototypes/:id/comments/:cid/resolve', async (req) => {
    const b = req.body ?? {};
    return resolveComment(await dirOf(req.params.id), req.params.cid, { note: b.note, author: b.author });
  });

  app.post<CParams>('/prototypes/:id/comments/:cid/reopen', async (req) =>
    reopenComment(await dirOf(req.params.id), req.params.cid),
  );

  // Lampiran gambar (komentar & pesan agent): unggah dulu, lalu kirim `path`-nya di `attachments`.
  app.post<Params & { Body: Body }>('/prototypes/:id/attachments', { bodyLimit: ATTACHMENT_BODY_LIMIT }, async (req, reply): Promise<Attachment> => {
    const a = await saveAttachment(await dirOf(req.params.id), req.body?.data);
    reply.code(201);
    return a;
  });

  app.get<{ Params: { id: string; name: string } }>('/prototypes/:id/attachments/:name', async (req, reply) => {
    const name = attachmentName(req.params.name);
    if (!name) throw new AppError('NOT_FOUND', 'Lampiran tidak ditemukan');
    const file = attachmentFile(await dirOf(req.params.id), name);
    const st = await fs.stat(file).catch(() => null);
    if (!st?.isFile()) throw new AppError('NOT_FOUND', `Lampiran "${name}" tidak ditemukan`);
    // Nama = hash isi, jadi isi tidak pernah berubah.
    reply.header('Content-Type', attachmentType(name)).header('Content-Length', st.size)
      .header('Cache-Control', 'private, max-age=31536000, immutable').header('X-Content-Type-Options', 'nosniff');
    if (name.endsWith('.svg')) reply.header('Content-Security-Policy', SVG_CSP);
    return reply.send(createReadStream(file));
  });

  app.delete<CParams>('/prototypes/:id/comments/:cid', async (req) => {
    const c = await deleteComment(await dirOf(req.params.id), req.params.cid);
    return { removed: { id: c.id } };
  });
};
