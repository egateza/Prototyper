import { promises as fs } from 'node:fs';
import path from 'node:path';
import { syncAgentFiles, type AgentFileResult } from './agentfiles.js';
import { AppError } from './errors.js';
import { fileExists } from './fsutil.js';
import { MANIFEST_FILE, parseManifest, writeManifest, type Manifest } from './manifest.js';
import type { Registry, ResolvedPrototype } from './registry.js';

/**
 * Desain sistem = prototype biasa (template `design-system`) dengan `designSystem.source: true`.
 * Prototype lain memakainya lewat `designSystem.use`: file bersamanya (token & komponen) disalin
 * ke folder `designSystem.dir` di prototype pemakai, lalu dimuat dari halaman/entry-nya. Salinan
 * (bukan tautan) agar prototype tetap mandiri, bisa di-commit, dan jalan di mode static maupun Vite.
 */
export const DS_DEFAULT_FILES = ['tokens.css', 'components.css'] as const;
export const DS_DEFAULT_DIR = 'design-system';

type DsManifest = NonNullable<Manifest['designSystem']>;

export function isDesignSystem(m: Manifest | null | undefined): boolean {
  return m?.designSystem?.source === true;
}

/** File yang dibagikan desain sistem, relatif ke foldernya (posix). */
export function designSystemFiles(m: Manifest): string[] {
  return (m.designSystem?.files ?? [...DS_DEFAULT_FILES]).map(toPosix);
}

/** Folder salinan di prototype pemakai (posix). */
export function designSystemDir(m: Manifest): string {
  return toPosix(m.designSystem?.dir ?? DS_DEFAULT_DIR);
}

const toPosix = (p: string) => p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
const COMMENT_EXT = new Set(['.css', '.scss', '.less', '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx']);

/** Baris pembuka salinan file teks; file lain disalin byte per byte. */
export function copyHeader(file: string, dsId: string, consumerId: string): string {
  if (!COMMENT_EXT.has(path.extname(file).toLowerCase())) return '';
  return `/* Disalin dari desain sistem "${dsId}" oleh Prototyper — jangan diedit di sini (akan tertimpa). Ubah di desain sistem, lalu: prototyper ds sync ${consumerId} */\n`;
}

export type DsFileState = 'ok' | 'outdated' | 'missing' | 'source-missing';
export type DsCopyAction = 'created' | 'updated' | 'unchanged' | 'source-missing';
export type DsLinkAction = 'added' | 'present' | 'skipped';

export interface DsFileResult {
  /** Relatif ke folder prototype pemakai (posix). */
  file: string;
  action: DsCopyAction;
}

export interface DsLinkResult {
  /** File yang disisipi tautan/impor, relatif ke folder prototype (posix); null bila tidak ada. */
  file: string | null;
  action: DsLinkAction;
  note?: string;
}

export interface ConsumerStatus {
  id: string;
  name: string;
  use: string;
  dir: string;
  /** Desain sistem yang dipakai terdaftar & valid. */
  found: boolean;
  /** Ada salinan yang berbeda dari desain sistem atau belum ada (perlu `ds sync`). */
  outdated: boolean;
  files: Array<{ file: string; state: DsFileState }>;
}

export interface DesignSystemInfo {
  id: string;
  name: string;
  description: string | null;
  path: string;
  files: string[];
  /** File di `files` yang tidak ada di folder desain sistem. */
  missing: string[];
  consumers: ConsumerStatus[];
}

interface CopyPlan {
  rel: string;
  src: string;
  dest: string;
}

function plan(ds: ResolvedPrototype & { manifest: Manifest }, consumer: ResolvedPrototype, dir: string): CopyPlan[] {
  return designSystemFiles(ds.manifest).map((f) => ({
    rel: path.posix.join(dir, f),
    src: path.join(ds.path, ...f.split('/')),
    dest: path.join(consumer.path, ...dir.split('/'), ...f.split('/')),
  }));
}

async function readOrNull(file: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(file);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

async function expected(p: CopyPlan, dsId: string, consumerId: string): Promise<Buffer | null> {
  const src = await readOrNull(p.src);
  if (!src) return null;
  return Buffer.concat([Buffer.from(copyHeader(p.rel, dsId, consumerId), 'utf8'), src]);
}

function requireDs(list: ResolvedPrototype[], dsId: string): ResolvedPrototype & { manifest: Manifest } {
  const ds = list.find((p) => p.id === dsId);
  if (!ds) throw new AppError('NOT_FOUND', `Desain sistem "${dsId}" tidak terdaftar. Lihat daftar: prototyper ds list`);
  if (!ds.manifest) throw new AppError('BAD_REQUEST', `Manifest "${dsId}" tidak valid: ${ds.error ?? ''}`);
  if (!isDesignSystem(ds.manifest)) {
    throw new AppError('BAD_REQUEST', `"${dsId}" bukan desain sistem. Buat dengan: prototyper new <id> -t design-system`);
  }
  return ds as ResolvedPrototype & { manifest: Manifest };
}

function requireValid(list: ResolvedPrototype[], id: string): ResolvedPrototype & { manifest: Manifest } {
  const p = list.find((x) => x.id === id);
  if (!p) throw new AppError('NOT_FOUND', `Prototype "${id}" tidak terdaftar. Lihat daftar: prototyper list`);
  if (!p.manifest) throw new AppError('BAD_REQUEST', `Manifest "${id}" tidak valid; perbaiki dulu: ${p.error ?? ''}`);
  return p as ResolvedPrototype & { manifest: Manifest };
}

/** Status salinan desain sistem di satu prototype pemakai (tanpa menulis apa pun). */
export async function consumerStatus(list: ResolvedPrototype[], consumer: ResolvedPrototype & { manifest: Manifest }): Promise<ConsumerStatus> {
  const use = consumer.manifest.designSystem?.use ?? '';
  const dir = designSystemDir(consumer.manifest);
  const base = { id: consumer.id, name: consumer.manifest.name, use, dir };
  const ds = list.find((p) => p.id === use);
  if (!ds?.manifest || !isDesignSystem(ds.manifest)) return { ...base, found: false, outdated: false, files: [] };
  const files: ConsumerStatus['files'] = [];
  for (const p of plan(ds as ResolvedPrototype & { manifest: Manifest }, consumer, dir)) {
    const want = await expected(p, use, consumer.id);
    const have = await readOrNull(p.dest);
    const state: DsFileState = !want ? 'source-missing' : !have ? 'missing' : have.equals(want) ? 'ok' : 'outdated';
    files.push({ file: p.rel, state });
  }
  return { ...base, found: true, outdated: files.some((f) => f.state === 'outdated' || f.state === 'missing'), files };
}

/** Semua desain sistem terdaftar beserta pemakainya. */
export async function listDesignSystems(registry: Registry): Promise<DesignSystemInfo[]> {
  const list = await registry.list();
  const out: DesignSystemInfo[] = [];
  for (const ds of list) {
    const m = ds.manifest;
    if (!m || !isDesignSystem(m)) continue;
    const files = designSystemFiles(m);
    const missing: string[] = [];
    for (const f of files) if (!(await fileExists(path.join(ds.path, ...f.split('/'))))) missing.push(f);
    const consumers: ConsumerStatus[] = [];
    for (const c of list) {
      if (c.manifest?.designSystem?.use === ds.id) consumers.push(await consumerStatus(list, c as ResolvedPrototype & { manifest: Manifest }));
    }
    out.push({ id: ds.id, name: m.name, description: m.description ?? null, path: ds.path, files, missing, consumers });
  }
  return out;
}

async function copyFiles(ds: ResolvedPrototype & { manifest: Manifest }, consumer: ResolvedPrototype, dir: string): Promise<DsFileResult[]> {
  const out: DsFileResult[] = [];
  for (const p of plan(ds, consumer, dir)) {
    const want = await expected(p, ds.id, consumer.id);
    if (!want) {
      out.push({ file: p.rel, action: 'source-missing' });
      continue;
    }
    const have = await readOrNull(p.dest);
    if (have?.equals(want)) {
      out.push({ file: p.rel, action: 'unchanged' });
      continue;
    }
    await fs.mkdir(path.dirname(p.dest), { recursive: true });
    await fs.writeFile(p.dest, want);
    out.push({ file: p.rel, action: have ? 'updated' : 'created' });
  }
  return out;
}

/** Ubah `designSystem` di prototyper.json (isi mentah dipertahankan agar file tetap ringkas). */
async function writeDsField(p: ResolvedPrototype, value: DsManifest | undefined): Promise<Manifest> {
  const file = path.join(p.path, MANIFEST_FILE);
  const raw = JSON.parse((await fs.readFile(file, 'utf8')).replace(/^﻿/, '')) as Record<string, unknown>;
  if (value === undefined) delete raw.designSystem;
  else raw.designSystem = value;
  const m = parseManifest(raw, file);
  await writeManifest(p.path, raw, { overwrite: true });
  return m;
}

const LINK_RE = /<link\b[^>]*\brel\s*=\s*["']?stylesheet[^>]*>/i;
const ENTRY_CANDIDATES = ['src/main.jsx', 'src/main.tsx', 'src/main.js', 'src/main.ts', 'src/index.jsx', 'src/index.tsx', 'src/index.js', 'src/index.ts'];

/** Sisipkan `<link>` CSS desain sistem sebelum stylesheet pertama (agar gaya prototype tetap menang). */
export function injectLinks(html: string, hrefs: string[]): string {
  const todo = hrefs.filter((h) => !html.includes(`href="${h}"`) && !html.includes(`href='${h}'`));
  if (!todo.length) return html;
  const tags = todo.map((h) => `<link rel="stylesheet" href="${h}">`);
  const link = html.search(LINK_RE);
  const head = html.search(/<\/head\s*>/i);
  const pos = link >= 0 ? link : head;
  if (pos < 0) return `${tags.join('\n')}\n${html}`;
  const lineStart = html.lastIndexOf('\n', pos - 1) + 1;
  const before = html.slice(lineStart, pos);
  if (!/^[ \t]*$/.test(before)) return html.slice(0, pos) + tags.join('') + html.slice(pos);
  // Elemen di awal baris: sisipkan sebagai baris baru. Sebelum </head> = anak <head>, jadi menjorok.
  const indent = link >= 0 ? before : `${before}  `;
  const nl = html.includes('\r\n') ? '\r\n' : '\n';
  return html.slice(0, lineStart) + tags.map((t) => `${indent}${t}${nl}`).join('') + html.slice(lineStart);
}

/** Tambahkan `import '<css>'` di awal entry JS (sebelum CSS milik prototype). */
export function injectImports(code: string, specs: string[]): string {
  const todo = specs.filter((s) => !code.includes(`'${s}'`) && !code.includes(`"${s}"`));
  if (!todo.length) return code;
  return todo.map((s) => `import '${s}';\n`).join('') + code;
}

async function linkFiles(consumer: ResolvedPrototype & { manifest: Manifest }, dir: string, files: string[]): Promise<DsLinkResult> {
  const css = files.filter((f) => f.toLowerCase().endsWith('.css')).map((f) => path.posix.join(dir, f));
  if (!css.length) return { file: null, action: 'skipped', note: 'Desain sistem tidak punya file CSS untuk dimuat.' };
  const m = consumer.manifest;
  if (m.type === 'static') {
    const root = toPosix(m.static.root) || '.';
    const hrefs = css.map((f) => path.posix.relative(root === '.' ? '' : root, f));
    if (hrefs.some((h) => h.startsWith('..'))) {
      return { file: null, action: 'skipped', note: `Folder ${dir} berada di luar static.root (${root}); file desain sistem tidak bisa disajikan. Pakai --dir di dalam ${root}.` };
    }
    const rel = path.posix.join(root, toPosix(m.static.index));
    const file = path.join(consumer.path, ...rel.split('/'));
    const html = await readOrNull(file);
    if (!html) return { file: null, action: 'skipped', note: `${rel} tidak ditemukan; muat ${hrefs.join(', ')} secara manual.` };
    const text = html.toString('utf8');
    const next = injectLinks(text, hrefs);
    if (next === text) return { file: rel, action: 'present' };
    await fs.writeFile(file, next, 'utf8');
    return { file: rel, action: 'added' };
  }
  const cwd = toPosix(m.command.cwd) || '.';
  for (const cand of ENTRY_CANDIDATES) {
    const rel = path.posix.join(cwd, cand);
    const file = path.join(consumer.path, ...rel.split('/'));
    const code = await readOrNull(file);
    if (!code) continue;
    const specs = css.map((f) => {
      const r = path.posix.relative(path.posix.dirname(rel), f);
      return r.startsWith('.') ? r : `./${r}`;
    });
    const text = code.toString('utf8');
    const next = injectImports(text, specs);
    if (next === text) return { file: rel, action: 'present' };
    await fs.writeFile(file, next, 'utf8');
    return { file: rel, action: 'added' };
  }
  return { file: null, action: 'skipped', note: `Entry JS tidak ditemukan (${ENTRY_CANDIDATES.join(', ')}); impor ${css.join(', ')} secara manual.` };
}

export interface UseResult {
  id: string;
  designSystem: string;
  dir: string;
  files: DsFileResult[];
  link: DsLinkResult;
  agentFiles: AgentFileResult[];
}

/**
 * Pasang desain sistem ke prototype: salin file, catat di prototyper.json, sisipkan tautan CSS
 * ke halaman/entry, lalu perbarui petunjuk agent. Aman diulang (idempoten).
 */
export async function useDesignSystem(
  registry: Registry,
  id: string,
  dsId: string,
  opts: { dir?: string; home?: string; link?: boolean } = {},
): Promise<UseResult> {
  const list = await registry.list();
  const ds = requireDs(list, dsId);
  const p = requireValid(list, id);
  if (p.id === ds.id) throw new AppError('BAD_REQUEST', 'Desain sistem tidak bisa memakai dirinya sendiri');
  if (isDesignSystem(p.manifest)) throw new AppError('BAD_REQUEST', `"${p.id}" adalah desain sistem; desain sistem tidak memakai desain sistem lain`);
  const dir = toPosix(opts.dir?.trim() || p.manifest.designSystem?.dir || DS_DEFAULT_DIR);

  const value: DsManifest = { use: ds.id, ...(dir !== DS_DEFAULT_DIR ? { dir } : {}) };
  const m = await writeDsField(p, value); // validasi dir (relatif, tanpa "..") sebelum menyalin
  const consumer = { ...p, manifest: m };
  const files = await copyFiles(ds, consumer, dir);
  const link = opts.link === false ? { file: null, action: 'skipped' as const } : await linkFiles(consumer, dir, designSystemFiles(ds.manifest));
  const agentFiles = await syncAgentFiles(p.path, m, { home: opts.home ?? registry.home });
  return { id: p.id, designSystem: ds.id, dir, files, link, agentFiles };
}

export interface SyncResult {
  id: string;
  designSystem: string;
  files: DsFileResult[];
  error: string | null;
}

/**
 * Salin ulang file desain sistem. `id` boleh prototype pemakai (hanya itu) atau desain sistem
 * (semua pemakainya); tanpa id = semua pemakai.
 */
export async function syncDesignSystem(registry: Registry, id?: string): Promise<SyncResult[]> {
  const list = await registry.list();
  let targets: ResolvedPrototype[];
  if (id) {
    const p = requireValid(list, id);
    if (isDesignSystem(p.manifest)) targets = list.filter((c) => c.manifest?.designSystem?.use === p.id);
    else if (p.manifest.designSystem?.use) targets = [p];
    else if (p.manifest.designSystem?.local) {
      throw new AppError('BAD_REQUEST', `"${p.id}" memakai desain sistem sendiri (${p.manifest.designSystem.local.join(', ')}); tidak ada yang perlu disinkronkan`);
    } else throw new AppError('BAD_REQUEST', `"${p.id}" belum memakai desain sistem. Pasang dengan: prototyper ds use ${p.id} <desain-sistem>`);
  } else {
    targets = list.filter((c) => c.manifest?.designSystem?.use);
  }
  const out: SyncResult[] = [];
  for (const c of targets) {
    const m = c.manifest as Manifest;
    const use = m.designSystem?.use ?? '';
    try {
      const ds = requireDs(list, use);
      out.push({ id: c.id, designSystem: use, files: await copyFiles(ds, c, designSystemDir(m)), error: null });
    } catch (err) {
      out.push({ id: c.id, designSystem: use, files: [], error: (err as Error).message });
    }
  }
  return out;
}

export interface DetachResult {
  id: string;
  /** Id desain sistem yang dilepas; null bila yang dilepas desain sistem sendiri (local). */
  designSystem: string | null;
  /** Folder salinan yang dibiarkan (tidak dihapus agar tampilan tidak rusak tiba-tiba); null untuk local. */
  dir: string | null;
  /** Lokasi desain sistem sendiri yang dilepas (file tidak disentuh). */
  local: string[] | null;
  agentFiles: AgentFileResult[];
}

/**
 * Lepas desain sistem dari prototype: hapus `designSystem` dari manifest (pemakai atau desain
 * sistem sendiri). Tidak ada file yang dihapus.
 */
export async function detachDesignSystem(registry: Registry, id: string, opts: { home?: string } = {}): Promise<DetachResult> {
  const p = requireValid(await registry.list(), id);
  const d = p.manifest.designSystem;
  if (!d?.use && !d?.local) {
    throw new AppError('BAD_REQUEST', isDesignSystem(p.manifest)
      ? `"${p.id}" adalah desain sistem; ubah perannya lewat prototyper.json bila memang perlu`
      : `"${p.id}" tidak memakai desain sistem`);
  }
  const m = await writeDsField(p, undefined);
  const agentFiles = await syncAgentFiles(p.path, m, { home: opts.home ?? registry.home });
  return {
    id: p.id,
    designSystem: d.use ?? null,
    dir: d.use ? designSystemDir(p.manifest) : null,
    local: d.local ? d.local.map(toPosix) : null,
    agentFiles,
  };
}

// ---------- Desain sistem sendiri (designSystem.local) ----------
// Prototype yang sudah punya token/komponen sendiri di foldernya cukup mencatat lokasinya, agar
// agent memakainya (petunjuk di AGENTS.md) dan Web UI menampilkannya. Tidak ada yang disalin.

export interface LocalStatus {
  id: string;
  name: string;
  paths: Array<{ path: string; exists: boolean; kind: 'file' | 'dir' | null }>;
}

async function pathKind(abs: string): Promise<'file' | 'dir' | null> {
  try {
    return (await fs.stat(abs)).isDirectory() ? 'dir' : 'file';
  } catch {
    return null;
  }
}

/** Normalisasi & validasi daftar lokasi (relatif, di dalam folder prototype). */
function normalizeLocal(paths: string[]): string[] {
  const out = [...new Set(paths.map((x) => toPosix(x.trim())).filter(Boolean))];
  if (!out.length) throw new AppError('BAD_REQUEST', 'Isi minimal satu lokasi file/folder desain sistem, relatif ke folder prototype');
  return out;
}

export async function localStatus(p: ResolvedPrototype & { manifest: Manifest }): Promise<LocalStatus> {
  const paths: LocalStatus['paths'] = [];
  for (const rel of (p.manifest.designSystem?.local ?? []).map(toPosix)) {
    const kind = await pathKind(path.join(p.path, ...rel.split('/')));
    paths.push({ path: rel, exists: kind !== null, kind });
  }
  return { id: p.id, name: p.manifest.name, paths };
}

/** Semua prototype yang mencatat desain sistem sendiri. */
export async function listLocalDesignSystems(registry: Registry): Promise<LocalStatus[]> {
  const out: LocalStatus[] = [];
  for (const p of await registry.list()) {
    if (p.manifest?.designSystem?.local) out.push(await localStatus(p as ResolvedPrototype & { manifest: Manifest }));
  }
  return out;
}

export interface LocalResult {
  id: string;
  local: string[];
  /** Lokasi yang belum ada (tetap dicatat; mungkin akan dibuat agent). */
  missing: string[];
  /** Id desain sistem bersama yang digantikan, bila sebelumnya memakai satu. */
  replaced: string | null;
  agentFiles: AgentFileResult[];
}

/** Catat lokasi desain sistem milik prototype sendiri (menggantikan `use` bila ada). */
export async function setLocalDesignSystem(
  registry: Registry,
  id: string,
  paths: string[],
  opts: { home?: string } = {},
): Promise<LocalResult> {
  const p = requireValid(await registry.list(), id);
  if (isDesignSystem(p.manifest)) throw new AppError('BAD_REQUEST', `"${p.id}" sudah merupakan desain sistem; file bersamanya diatur lewat designSystem.files`);
  const local = normalizeLocal(paths);
  const m = await writeDsField(p, { local }); // validasi path (relatif, tanpa "..")
  const st = await localStatus({ ...p, manifest: m });
  const agentFiles = await syncAgentFiles(p.path, m, { home: opts.home ?? registry.home });
  return { id: p.id, local, missing: st.paths.filter((x) => !x.exists).map((x) => x.path), replaced: p.manifest.designSystem?.use ?? null, agentFiles };
}

const SKIP_DIRS = new Set(['node_modules', '.git', '.prototyper', 'dist', 'build', '.next', '.vite', 'coverage', DS_DEFAULT_DIR]);
const CANDIDATE_FILE = /^(design-?tokens|tokens|variables|vars|theme|colors|palette|design-?system)\.(css|scss|sass|less|json|js|ts|mjs)$/i;
const CANDIDATE_DIR = /^(design-?system|design-?tokens|tokens|theme|themes|ds|ui-kit|styles?)$/i;

/**
 * Tebak lokasi desain sistem di folder prototype (untuk diisi otomatis di Web UI/CLI): file
 * bernama tokens/variables/theme…, atau folder design-system/tokens/theme/styles. Maks. 4 tingkat.
 */
export async function detectLocalCandidates(dir: string, limit = 12): Promise<string[]> {
  const files: string[] = [];
  const dirs: string[] = [];
  async function walk(rel: string, depth: number): Promise<void> {
    if (depth > 4 || files.length + dirs.length > 200) return;
    let entries;
    try {
      entries = await fs.readdir(path.join(dir, ...rel.split('/').filter(Boolean)), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
        if (CANDIDATE_DIR.test(e.name)) dirs.push(r);
        await walk(r, depth + 1);
      } else if (e.isFile() && CANDIDATE_FILE.test(e.name)) {
        files.push(r);
      }
    }
  }
  await walk('', 1);
  // File token lebih spesifik daripada folder; yang dangkal lebih dulu.
  const byDepth = (a: string, b: string) => a.split('/').length - b.split('/').length || a.localeCompare(b);
  return [...files.sort(byDepth), ...dirs.sort(byDepth)].slice(0, limit);
}
