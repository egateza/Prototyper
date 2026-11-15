import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import type { Config } from '../../core/config.js';
import { syncAgentFiles, type AgentFileResult } from '../../core/agentfiles.js';
import { detectManifest, type InitOptions } from '../../core/detect.js';
import { AppError, errorMessage } from '../../core/errors.js';
import { fileExists, isDirectory } from '../../core/fsutil.js';
import { loadManifest, MANIFEST_FILE, parseManifest, writeManifest } from '../../core/manifest.js';
import type { LogLine } from '../../core/logs.js';
import { lanAddresses } from '../../core/net.js';
import type { Registry, ResolvedPrototype } from '../../core/registry.js';
import type { Runtime } from '../../core/runtime.js';
import { createPrototype, isTemplate, TEMPLATES } from '../../core/scaffold.js';
import { toView, type PrototypeView } from '../../core/views.js';

export interface RouteContext {
  config: Config;
  registry: Registry;
  runtime: Runtime;
}

type IdParams = { Params: { id: string } };
type TailQuery = { Querystring: { tail?: string } };

function parseTail(v: string | undefined, def = 200): number {
  const n = v === undefined ? def : Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(0, Math.min(1000, Math.floor(n)));
}

/** Hasil install yang dijalankan otomatis setelah membuat prototype. */
export interface InstallResult {
  exitCode: number | null;
  ok: boolean;
}

/** Hasil POST /api/prototypes/new. */
export type NewPrototypeResponse = PrototypeView & {
  template: string;
  files: string[];
  install: InstallResult | null;
  agentFiles: AgentFileResult[];
};

/** Respons pendaftaran: view + hasil pemasangan petunjuk agent. */
export type RegisterResponse = PrototypeView & { agentFiles: AgentFileResult[] };

/** Batas body untuk impor HTML artifact (bisa berisi gambar base64). */
const NEW_BODY_LIMIT = 25 * 1024 * 1024;

/** Hasil POST /api/manifest/detect. */
export interface DetectResponse {
  path: string;
  /** prototyper.json sudah ada di folder. */
  exists: boolean;
  /** Manifest (yang ada atau hasil deteksi) lolos validasi. */
  valid: boolean;
  /** true bila jenis prototype berhasil dideteksi otomatis. */
  detected: boolean;
  manifest: unknown;
  /** Isi mentah file bila sudah ada (untuk diperbaiki di editor). */
  raw: string | null;
  error: string | null;
  notes: string[];
}

function requirePath(v: unknown): string {
  if (typeof v !== 'string' || !v.trim()) {
    throw new AppError('BAD_REQUEST', 'Body harus berisi { "path": "<folder prototype>" }');
  }
  return path.resolve(v.trim());
}

async function requireDir(v: unknown): Promise<string> {
  const abs = requirePath(v);
  if (!(await isDirectory(abs))) throw new AppError('BAD_REQUEST', `Folder tidak ditemukan: ${abs}`);
  return abs;
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

export const prototypeRoutes: FastifyPluginAsync<{ ctx: RouteContext }> = async (app, { ctx }) => {
  const { config, registry, runtime } = ctx;
  const view = (p: ResolvedPrototype): PrototypeView =>
    toView(p, runtime.info(p.id), { lan: config.lan, lanAddrs: config.lan ? lanAddresses() : [] });

  app.get('/prototypes', async () => (await registry.list()).map(view));

  // Daftarkan folder. Bila `manifest` dikirim, prototyper.json ditulis dulu (dipakai Web UI
  // untuk folder yang belum punya manifest). File yang sudah ada hanya ditimpa bila overwrite: true.
  app.post<{ Body: { path?: unknown; manifest?: unknown; overwrite?: unknown } | null }>(
    '/prototypes',
    async (req, reply) => {
      const b = req.body ?? {};
      const abs = await requireDir(b.path);
      if (b.manifest !== undefined) {
        const m = parseManifest(b.manifest);
        await registry.assertCanAdd(abs, m.id); // cek bentrok sebelum menulis file
        await writeManifest(abs, b.manifest, { overwrite: b.overwrite === true });
      }
      const p = await registry.add(abs);
      const agentFiles = p.manifest ? await syncAgentFiles(p.path, p.manifest) : [];
      reply.code(201);
      return { ...view(p), agentFiles } satisfies RegisterResponse;
    },
  );

  // Buat prototype baru dari template (opsional: impor HTML), daftarkan, lalu install bila diminta.
  app.post<{
    Body: {
      id?: unknown; name?: unknown; description?: unknown; template?: unknown;
      dir?: unknown; html?: unknown; install?: unknown;
    } | null;
  }>('/prototypes/new', { bodyLimit: NEW_BODY_LIMIT }, async (req, reply): Promise<NewPrototypeResponse> => {
    const b = req.body ?? {};
    const id = str(b.id);
    if (!id) throw new AppError('BAD_REQUEST', 'Body harus berisi { "id": "<id-prototype>" }');
    if (b.template !== undefined && !isTemplate(b.template)) {
      throw new AppError('BAD_REQUEST', `template harus salah satu dari: ${TEMPLATES.join(', ')}`);
    }
    if (b.html !== undefined && typeof b.html !== 'string') throw new AppError('BAD_REQUEST', 'html harus berupa string');
    const name = str(b.name);
    const description = str(b.description);
    const dir = str(b.dir);
    const r = await createPrototype(registry, {
      id,
      workspace: config.workspace,
      ...(isTemplate(b.template) ? { template: b.template } : {}),
      ...(name ? { name } : {}),
      ...(description ? { description } : {}),
      ...(dir ? { dir } : {}),
      ...(typeof b.html === 'string' ? { html: b.html } : {}),
    });
    let install: InstallResult | null = null;
    const m = r.prototype.manifest;
    if (b.install !== false && m?.type === 'command' && m.command.install) {
      const { exitCode } = await runtime.install(r.prototype);
      install = { exitCode, ok: exitCode === 0 };
    }
    reply.code(201);
    return { ...view(r.prototype), template: r.template, files: r.files, install, agentFiles: r.agentFiles };
  });

  // Periksa folder: kembalikan manifest yang ada, atau hasil deteksi untuk diedit sebelum disimpan.
  app.post<{ Body: { path?: unknown; type?: unknown; id?: unknown; name?: unknown; run?: unknown } | null }>(
    '/manifest/detect',
    async (req): Promise<DetectResponse> => {
      const b = req.body ?? {};
      const abs = await requireDir(b.path);
      const file = path.join(abs, MANIFEST_FILE);

      if (await fileExists(file)) {
        const raw = (await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, '');
        try {
          const manifest = await loadManifest(abs);
          return { path: abs, exists: true, valid: true, detected: false, manifest, raw, error: null, notes: [] };
        } catch (err) {
          let parsed: unknown = null;
          try {
            parsed = JSON.parse(raw);
          } catch {
            /* biarkan null */
          }
          return { path: abs, exists: true, valid: false, detected: false, manifest: parsed, raw, error: errorMessage(err), notes: [] };
        }
      }

      const type = b.type === 'static' || b.type === 'command' ? b.type : undefined;
      const id = str(b.id);
      const name = str(b.name);
      const run = str(b.run);
      const opts: InitOptions = { ...(type ? { type } : {}), ...(id ? { id } : {}), ...(name ? { name } : {}), ...(run ? { run } : {}) };
      try {
        const r = await detectManifest(abs, opts);
        return { path: abs, exists: false, valid: true, detected: true, manifest: r.manifest, raw: null, error: null, notes: r.notes };
      } catch (err) {
        if (!(err instanceof AppError) || err.code !== 'BAD_REQUEST') throw err;
        // Tidak terdeteksi: isi contoh agar pengguna tinggal menyesuaikan.
        const fallback: InitOptions = type === 'command' ? { ...opts, run: run ?? 'npm run dev' } : { ...opts, type: 'static' };
        const r = await detectManifest(abs, fallback);
        return {
          path: abs,
          exists: false,
          valid: true,
          detected: false,
          manifest: r.manifest,
          raw: null,
          error: null,
          notes: [
            'Jenis prototype tidak terdeteksi otomatis (tidak ada index.html atau package.json dengan script dev/start).',
            'Contoh di bawah perlu disesuaikan sebelum disimpan.',
            ...r.notes,
          ],
        };
      }
    },
  );

  app.get<IdParams>('/prototypes/:id', async (req) => view(await registry.require(req.params.id)));

  app.delete<IdParams>('/prototypes/:id', async (req) => {
    const p = await registry.require(req.params.id);
    await runtime.forget(p.id);
    const removed = await registry.remove(p.id);
    return { removed: { id: removed.id, path: removed.path } };
  });

  // Tulis ulang prototyper.json prototype yang sudah terdaftar (editor/perbaikan manifest di Web UI).
  app.put<IdParams & { Body: { manifest?: unknown } | null }>('/prototypes/:id/manifest', async (req) => {
    const p = await registry.require(req.params.id);
    const raw = req.body?.manifest;
    if (raw === undefined) throw new AppError('BAD_REQUEST', 'Body harus berisi { "manifest": { … } }');
    const m = parseManifest(raw);
    if (m.id !== p.id) {
      await registry.assertIdFree(m.id, p.path);
      if (runtime.isActive(p.id)) {
        throw new AppError('CONFLICT', `Hentikan "${p.id}" dulu sebelum mengganti id-nya`);
      }
    }
    await writeManifest(p.path, raw, { overwrite: true });
    await syncAgentFiles(p.path, m); // id/nama/perintah di petunjuk ikut berubah
    return view(await registry.require(m.id));
  });

  app.post<IdParams>('/prototypes/:id/reload',async (req) => view(await registry.require(req.params.id)));

  app.post<IdParams>('/prototypes/:id/start', async (req) => {
    const p = await registry.require(req.params.id);
    await runtime.start(p);
    return view(p);
  });

  app.post<IdParams>('/prototypes/:id/stop', async (req) => {
    const p = await registry.require(req.params.id);
    await runtime.stop(p.id);
    return view(p);
  });

  app.post<IdParams>('/prototypes/:id/restart', async (req) => {
    const p = await registry.require(req.params.id);
    await runtime.restart(p);
    return view(p);
  });

  app.post<IdParams>('/prototypes/:id/install', async (req) => {
    const p = await registry.require(req.params.id);
    const { exitCode } = await runtime.install(p);
    return { id: p.id, exitCode, ok: exitCode === 0 };
  });

  app.get<IdParams & TailQuery>('/prototypes/:id/logs', async (req) => {
    const p = await registry.require(req.params.id);
    const store = await runtime.logs(p.id);
    return { id: p.id, lines: store.tail(parseTail(req.query.tail)) };
  });

  // Server-Sent Events: kirim tail lalu baris baru secara realtime.
  app.get<IdParams & TailQuery>('/prototypes/:id/logs/stream', async (req, reply) => {
    const p = await registry.require(req.params.id);
    const store = await runtime.logs(p.id);
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const send = (l: LogLine) => res.write(`data: ${JSON.stringify(l)}\n\n`);
    for (const l of store.tail(parseTail(req.query.tail, 100))) send(l);
    store.on('line', send);
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 15_000);
    req.raw.on('close', () => {
      clearInterval(heartbeat);
      store.off('line', send);
    });
  });
};
