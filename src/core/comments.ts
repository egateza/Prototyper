import { readFileSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { AppError, errorMessage } from './errors.js';
import { readJsonFile, writeJsonAtomic } from './fsutil.js';

/**
 * Komentar disimpan di folder prototype (`.prototyper/comments.json`), bukan di PROTOTYPER_HOME,
 * agar agent mana pun bisa membacanya langsung tanpa Prototyper berjalan.
 */
export const COMMENTS_FILE = path.join('.prototyper', 'comments.json');
/** Log keputusan (append-only): satu baris tiap komentar diselesaikan/dibuka lagi. */
export const DECISIONS_FILE = path.join('.prototyper', 'DECISIONS.md');
/** Komentar resolved yang sudah lama dipindah ke sini, satu file per bulan (`YYYY-MM.json`). */
export const ARCHIVE_DIR = path.join('.prototyper', 'comments-archive');
/** Default `comments.archiveDays` di manifest. 0 = tidak pernah diarsipkan. */
export const DEFAULT_ARCHIVE_DAYS = 30;

const MAX_TEXT = 5000;
const MAX_OPTION = 200;
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 8;
const MAX_HTML = 2000;

/** Siapa yang menulis: pengguna (Web UI) atau agent (CLI). Menentukan giliran "menunggu siapa". */
export type Role = 'user' | 'agent';

/** Data lama (sebelum ada `role`) disimpulkan dari nama penulis. */
const withRole = (v: unknown) => {
  if (v && typeof v === 'object' && !('role' in v)) {
    const author = (v as { author?: unknown }).author;
    return { ...v, role: author === 'agent' ? 'agent' : 'user' };
  }
  return v;
};

const replySchema = z.preprocess(
  withRole,
  z.object({
    id: z.string(),
    author: z.string(),
    role: z.enum(['user', 'agent']),
    text: z.string(),
    createdAt: z.string(),
    /** Ada bila balasan ini pertanyaan berpilihan. */
    options: z.array(z.string()).optional(),
    /** Boleh memilih lebih dari satu opsi. */
    multi: z.boolean().optional(),
    /** Ada bila balasan ini jawaban atas pertanyaan berpilihan (id balasan pertanyaan). */
    answerTo: z.string().optional(),
    /** Opsi yang dipilih (teks opsi). */
    choices: z.array(z.string()).optional(),
  }),
);

/** Elemen yang dikomentari (dari klik/blok teks di pratinjau). */
const anchorSchema = z.object({
  /** Selector CSS elemen. */
  selector: z.string(),
  /** Nama tag, mis. "button". */
  tag: z.string().optional(),
  /** Cuplikan teks elemen. */
  text: z.string().optional(),
  /** Teks yang diblok pengguna (bila komentar dibuat dari seleksi teks). */
  quote: z.string().optional(),
  /** Potongan outerHTML saat komentar dibuat, agar tetap bermakna bila selector usang. */
  html: z.string().optional(),
});
export type CommentAnchor = z.output<typeof anchorSchema>;

const commentSchema = z.preprocess(
  withRole,
  z.object({
    id: z.string(),
    /** Halaman/path di prototype, mis. "/" atau "/kasir". */
    page: z.string(),
    author: z.string(),
    role: z.enum(['user', 'agent']),
    text: z.string(),
    status: z.enum(['open', 'resolved']),
    createdAt: z.string(),
    updatedAt: z.string(),
    resolvedAt: z.string().nullable().default(null),
    resolvedBy: z.string().nullable().default(null),
    /** Catatan penyelesaian, mis. ringkasan perubahan dari agent. */
    resolution: z.string().nullable().default(null),
    replies: z.array(replySchema).default([]),
    anchor: anchorSchema.optional(),
  }),
);

const fileSchema = z.object({
  version: z.literal(1),
  nextId: z.number().int().min(1),
  comments: z.array(commentSchema),
});

type StoredComment = z.output<typeof commentSchema>;
type StoredReply = z.output<typeof replySchema>;
type CommentsFile = z.output<typeof fileSchema>;

export interface QuestionAnswer {
  /** id balasan yang berisi jawaban. */
  replyId: string;
  author: string;
  choices: string[];
  text: string;
  createdAt: string;
}

/** Balasan seperti di file, ditambah `answer` (dihitung) untuk pertanyaan berpilihan. */
export type CommentReply = StoredReply & { answer?: QuestionAnswer | null };

/** Komentar seperti di file, ditambah field turunan untuk UI dan agent. */
export type Comment = Omit<StoredComment, 'replies'> & {
  replies: CommentReply[];
  /** Untuk komentar open: giliran siapa (penulis entri terakhir menentukan). null bila sudah selesai. */
  waitingFor: Role | null;
  /** id pertanyaan berpilihan yang belum dijawab. */
  pendingQuestions: string[];
  /** true bila komentar dibaca dari arsip (`comments-archive/`). */
  archived?: true;
};
export type CommentStatus = Comment['status'];

export interface CommentCounts {
  open: number;
  resolved: number;
  /** Komentar open yang menunggu jawaban/keputusan pengguna. */
  waitingUser: number;
}

export interface Source {
  author: string;
  role: Role;
}

export const USER_SOURCE: Source = { author: 'pengguna', role: 'user' };
export const AGENT_SOURCE: Source = { author: 'agent', role: 'agent' };

export function commentsPath(dir: string): string {
  return path.join(dir, COMMENTS_FILE);
}

function cleanText(v: unknown, field = 'text'): string {
  if (typeof v !== 'string' || !v.trim()) throw new AppError('BAD_REQUEST', `${field} wajib diisi`);
  const t = v.trim();
  if (t.length > MAX_TEXT) throw new AppError('BAD_REQUEST', `${field} terlalu panjang (maks. ${MAX_TEXT} karakter)`);
  return t;
}

function optionalText(v: unknown, field = 'text'): string {
  if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) return '';
  return cleanText(v, field);
}

function source(input: { author?: unknown; role?: unknown }, def: Source): Source {
  const author = typeof input.author === 'string' && input.author.trim() ? input.author.trim().slice(0, 80) : def.author;
  if (input.role !== undefined && input.role !== 'user' && input.role !== 'agent') {
    throw new AppError('BAD_REQUEST', 'role harus "user" atau "agent"');
  }
  return { author, role: (input.role as Role | undefined) ?? def.role };
}

function cleanOptions(v: unknown): string[] {
  if (!Array.isArray(v)) throw new AppError('BAD_REQUEST', 'options harus berupa array teks');
  const opts = v.map((o) => (typeof o === 'string' ? o.trim() : ''));
  if (opts.some((o) => !o)) throw new AppError('BAD_REQUEST', 'setiap opsi harus berupa teks yang tidak kosong');
  if (opts.some((o) => o.length > MAX_OPTION)) throw new AppError('BAD_REQUEST', `opsi terlalu panjang (maks. ${MAX_OPTION} karakter)`);
  if (opts.length < MIN_OPTIONS || opts.length > MAX_OPTIONS) {
    throw new AppError('BAD_REQUEST', `jumlah opsi harus ${MIN_OPTIONS}-${MAX_OPTIONS}`);
  }
  if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) throw new AppError('BAD_REQUEST', 'opsi tidak boleh kembar');
  return opts;
}

function clip(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : undefined;
}

/** Validasi anchor dari klien. undefined/null = komentar tanpa elemen. */
export function cleanAnchor(v: unknown): CommentAnchor | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'object' || Array.isArray(v)) throw new AppError('BAD_REQUEST', 'anchor harus objek { selector, tag?, text?, quote?, html? }');
  const a = v as Record<string, unknown>;
  const selector = typeof a.selector === 'string' ? a.selector.trim() : '';
  if (!selector) throw new AppError('BAD_REQUEST', 'anchor.selector wajib diisi');
  if (selector.length > 1000) throw new AppError('BAD_REQUEST', 'anchor.selector terlalu panjang (maks. 1000 karakter)');
  const tag = clip(a.tag, 40);
  const text = clip(a.text, 300);
  const quote = clip(a.quote, 1000);
  const html = clip(a.html, MAX_HTML);
  return { selector, ...(tag ? { tag } : {}), ...(text ? { text } : {}), ...(quote ? { quote } : {}), ...(html ? { html } : {}) };
}

/** Normalkan path halaman: selalu diawali "/", tanpa origin. */
export function normalizePage(v: unknown): string {
  if (typeof v !== 'string' || !v.trim()) return '/';
  let p = v.trim();
  try {
    if (/^https?:\/\//i.test(p)) {
      const u = new URL(p);
      p = `${u.pathname}${u.search}${u.hash}`;
    }
  } catch {
    /* biarkan apa adanya */
  }
  if (!p.startsWith('/')) p = `/${p}`;
  return p.slice(0, 500);
}

/** Tambahkan field turunan: jawaban tiap pertanyaan, pertanyaan tertunda, dan giliran. */
function decorate(c: StoredComment): Comment {
  const answers = new Map<string, QuestionAnswer>();
  for (const r of c.replies) {
    if (r.answerTo) {
      answers.set(r.answerTo, { replyId: r.id, author: r.author, choices: r.choices ?? [], text: r.text, createdAt: r.createdAt });
    }
  }
  const replies: CommentReply[] = c.replies.map((r) => (r.options ? { ...r, answer: answers.get(r.id) ?? null } : { ...r }));
  const pendingQuestions = c.status === 'open' ? replies.filter((r) => r.options && !r.answer).map((r) => r.id) : [];
  const lastRole = (c.replies[c.replies.length - 1] ?? c).role;
  const waitingFor: Role | null = c.status !== 'open' ? null : lastRole === 'agent' ? 'user' : 'agent';
  return { ...c, replies, waitingFor, pendingQuestions };
}

// Tulis berurutan per file agar dua request bersamaan di daemon tidak saling menimpa.
const locks = new Map<string, Promise<unknown>>();
function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(key, next.catch(() => {}));
  return next;
}

function parseFile(data: unknown, file: string): CommentsFile {
  const r = fileSchema.safeParse(data);
  if (!r.success) throw new AppError('INTERNAL', `${file} rusak: ${r.error.issues[0]?.message ?? 'format tidak dikenal'}`);
  return r.data;
}

async function readFile(dir: string): Promise<CommentsFile> {
  const file = commentsPath(dir);
  let data: unknown;
  try {
    data = await readJsonFile(file);
  } catch (err) {
    throw new AppError('INTERNAL', `${file} bukan JSON yang valid: ${errorMessage(err)}`);
  }
  if (data === undefined) return { version: 1, nextId: 1, comments: [] };
  return parseFile(data, file);
}

function find(data: CommentsFile, id: string): StoredComment {
  const c = data.comments.find((x) => x.id === id);
  if (!c) throw new AppError('NOT_FOUND', `Komentar "${id}" tidak ditemukan`);
  return c;
}

function countsOf(comments: StoredComment[]): CommentCounts {
  const open = comments.filter((c) => c.status === 'open');
  return {
    open: open.length,
    resolved: comments.length - open.length,
    waitingUser: open.filter((c) => decorate(c).waitingFor === 'user').length,
  };
}

/** Jumlah komentar (sinkron, dipakai di view). File rusak/tidak ada dianggap kosong. */
export function countComments(dir: string): CommentCounts {
  try {
    const file = commentsPath(dir);
    const raw = readFileSync(file, 'utf8').replace(/^﻿/, '');
    return countsOf(parseFile(JSON.parse(raw), file).comments);
  } catch {
    return { open: 0, resolved: 0, waitingUser: 0 };
  }
}

export interface ListFilter {
  status?: CommentStatus | 'all';
  page?: string;
  waitingFor?: Role;
  /** Sertakan komentar dari arsip (`comments-archive/`). */
  includeArchive?: boolean;
}

/** Komentar aktif, ditambah arsip bila diminta (yang ada di comments.json menang bila id kembar). */
async function pool(dir: string, includeArchive = false): Promise<Array<{ c: StoredComment; archived: boolean }>> {
  const live = (await readFile(dir)).comments.map((c) => ({ c, archived: false }));
  if (!includeArchive) return live;
  const ids = new Set(live.map((x) => x.c.id));
  const old = (await readArchive(dir)).filter((c) => !ids.has(c.id)).map((c) => ({ c, archived: true }));
  return [...old, ...live].sort((a, b) => a.c.createdAt.localeCompare(b.c.createdAt));
}

const decorateEntry = ({ c, archived }: { c: StoredComment; archived: boolean }): Comment =>
  archived ? { ...decorate(c), archived: true } : decorate(c);

/**
 * Daftar komentar dengan field turunan. Urutan: yang menunggu pengguna/agent sesuai filter,
 * selebihnya urutan pembuatan.
 */
export async function listComments(dir: string, filter: ListFilter = {}): Promise<Comment[]> {
  const page = filter.page !== undefined ? normalizePage(filter.page) : undefined;
  return (await pool(dir, filter.includeArchive))
    .filter(({ c }) => (!filter.status || filter.status === 'all' || c.status === filter.status) && (page === undefined || c.page === page))
    .map(decorateEntry)
    .filter((c) => !filter.waitingFor || c.waitingFor === filter.waitingFor);
}

export async function getComment(dir: string, id: string): Promise<Comment> {
  return decorate(find(await readFile(dir), id));
}

export interface RelatedComment extends Comment {
  /** true bila anchor-nya sama (selector sama) dengan komentar yang ditanyakan. */
  sameAnchor: boolean;
}

export interface CommentContext {
  comment: Comment;
  /** Komentar resolved di halaman yang sama; yang ber-anchor sama lebih dulu, lalu yang terbaru. */
  related: RelatedComment[];
  /** Baris DECISIONS.md untuk halaman ini / komentar terkait, urut kronologis (terbaru di akhir). */
  decisions: Decision[];
}

export const CONTEXT_LIMITS = { related: 10, decisions: 20 } as const;

/**
 * Konteks untuk mengerjakan satu komentar tanpa membaca seluruh comments.json: komentar beserta
 * thread, komentar selesai yang terkait, dan keputusan sebelumnya. Dibatasi agar hemat token.
 */
export async function commentContext(dir: string, id: string, opts: { includeArchive?: boolean } = {}): Promise<CommentContext> {
  const all = await pool(dir, opts.includeArchive);
  const self = all.find((x) => x.c.id === id);
  if (!self) {
    const hint = opts.includeArchive ? '' : ' (bila sudah diarsipkan, pakai --include-archive)';
    throw new AppError('NOT_FOUND', `Komentar "${id}" tidak ditemukan${hint}`);
  }
  const c = self.c;
  const selector = c.anchor?.selector;
  const time = (x: StoredComment) => x.resolvedAt ?? x.updatedAt;
  const related = all
    .filter((x) => x.c.id !== id && x.c.status === 'resolved' && x.c.page === c.page)
    .map((x) => ({ x, same: !!selector && x.c.anchor?.selector === selector }))
    .sort((a, b) => Number(b.same) - Number(a.same) || time(b.x.c).localeCompare(time(a.x.c)))
    .slice(0, CONTEXT_LIMITS.related)
    .map(({ x, same }): RelatedComment => ({ ...decorateEntry(x), sameAnchor: same }));
  const ids = new Set([id, ...related.map((r) => r.id)]);
  const decisions = (await readDecisions(dir))
    .filter((d) => ids.has(d.id) || d.page === c.page)
    .slice(-CONTEXT_LIMITS.decisions);
  return { comment: decorateEntry(self), related, decisions };
}

// ---------- Arsip ----------

const archiveFileSchema = z.object({ version: z.literal(1), comments: z.array(commentSchema) });
const ARCHIVE_NAME = /^\d{4}-\d{2}\.json$/;

/**
 * `comments.archiveDays` dari prototyper.json. Dibaca longgar (tanpa validasi manifest penuh)
 * agar manifest yang sedang rusak tidak membuat komentar gagal disimpan.
 */
async function archiveDaysOf(dir: string): Promise<number> {
  try {
    const m = await readJsonFile<{ comments?: { archiveDays?: unknown } }>(path.join(dir, 'prototyper.json'));
    const v = m?.comments?.archiveDays;
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0) return v;
  } catch {
    /* pakai default */
  }
  return DEFAULT_ARCHIVE_DAYS;
}

async function readArchiveFile(file: string): Promise<StoredComment[]> {
  let data: unknown;
  try {
    data = await readJsonFile(file);
  } catch (err) {
    throw new AppError('INTERNAL', `${file} bukan JSON yang valid: ${errorMessage(err)}`);
  }
  if (data === undefined) return [];
  const r = archiveFileSchema.safeParse(data);
  if (!r.success) throw new AppError('INTERNAL', `${file} rusak: ${r.error.issues[0]?.message ?? 'format tidak dikenal'}`);
  return r.data.comments;
}

/** Semua komentar di arsip, urut pembuatan. */
export async function readArchive(dir: string): Promise<StoredComment[]> {
  const root = path.join(dir, ARCHIVE_DIR);
  const names = (await fs.readdir(root).catch(() => [] as string[])).filter((n) => ARCHIVE_NAME.test(n)).sort();
  const all: StoredComment[] = [];
  for (const n of names) all.push(...(await readArchiveFile(path.join(root, n))));
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Pindahkan komentar resolved yang lebih tua dari `days` hari ke arsip bulanan (menurut resolvedAt). */
async function archiveOld(dir: string, data: CommentsFile, now: string, days: number): Promise<boolean> {
  if (days <= 0) return false;
  const limit = Date.parse(now) - days * 86_400_000;
  const old = data.comments.filter((c) => c.status === 'resolved' && c.resolvedAt && Date.parse(c.resolvedAt) < limit);
  if (!old.length) return false;
  const byMonth = new Map<string, StoredComment[]>();
  for (const c of old) {
    const month = (c.resolvedAt ?? c.createdAt).slice(0, 7);
    byMonth.set(month, [...(byMonth.get(month) ?? []), c]);
  }
  // Arsip ditulis dulu; bila proses mati sebelum comments.json ditulis, duplikat diabaikan saat dibaca.
  for (const [month, list] of byMonth) {
    const file = path.join(dir, ARCHIVE_DIR, `${month}.json`);
    const ids = new Set(list.map((c) => c.id));
    const kept = (await readArchiveFile(file)).filter((c) => !ids.has(c.id));
    await writeJsonAtomic(file, { version: 1, comments: [...kept, ...list] });
  }
  const moved = new Set(old);
  data.comments = data.comments.filter((c) => !moved.has(c));
  return true;
}

// ---------- Log keputusan (DECISIONS.md) ----------

export interface Decision {
  /** YYYY-MM-DD (waktu lokal). */
  date: string;
  /** id komentar. */
  id: string;
  page: string;
  /** Selector anchor, null bila komentar tanpa elemen. */
  selector: string | null;
  text: string;
}

const DECISIONS_HEADER = [
  '# Keputusan',
  '',
  'Dicatat otomatis oleh Prototyper setiap komentar diselesaikan atau dibuka lagi (append-only).',
  'Format: `tanggal · komentar · halaman · elemen · permintaan → hasil`.',
  '',
  '',
].join('\n');
const SEP = ' · ';

export function decisionsPath(dir: string): string {
  return path.join(dir, DECISIONS_FILE);
}

const oneLine = (s: string, max: number) => {
  const t = s.replace(/\s+/g, ' ').replaceAll(SEP, ' - ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

function localDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Balasan teks terakhir dari agent (bukan pertanyaan): biasanya ringkasan perubahan. */
function lastAgentReport(c: StoredComment): string | null {
  for (let i = c.replies.length - 1; i >= 0; i--) {
    const r = c.replies[i];
    if (r && r.role === 'agent' && !r.options && !r.answerTo && r.text) return r.text;
  }
  return null;
}

/** Satu baris log untuk komentar `c`; `outcome` null = pakai catatan resolve / laporan agent terakhir. */
export function decisionLine(c: StoredComment, now: string, outcome: string | null = null): string {
  const result = outcome ?? c.resolution ?? lastAgentReport(c);
  const text = `${oneLine(c.text, 160)}${result ? ` → ${oneLine(result, 240)}` : ''}`;
  return `- ${[localDate(now), c.id, c.page, c.anchor ? oneLine(c.anchor.selector, 200) : '-', text].join(SEP)}`;
}

export function parseDecision(line: string): Decision | null {
  const m = /^-\s+(\d{4}-\d{2}-\d{2}) · (\S+) · (.*?) · (.*?) · (.*)$/.exec(line.trim());
  if (!m) return null;
  const [, date = '', id = '', page = '', selector = '', text = ''] = m;
  return { date, id, page, selector: selector === '-' ? null : selector, text };
}

/** Semua baris keputusan, urut kronologis. File tidak ada = kosong. */
export async function readDecisions(dir: string): Promise<Decision[]> {
  const raw = await fs.readFile(decisionsPath(dir), 'utf8').catch(() => '');
  return raw.split(/\r?\n/).map(parseDecision).filter((d): d is Decision => d !== null);
}

async function appendDecisions(dir: string, lines: string[]): Promise<void> {
  if (!lines.length) return;
  const file = decisionsPath(dir);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const exists = await fs.stat(file).then(() => true, () => false);
  await fs.appendFile(file, `${exists ? '' : DECISIONS_HEADER}${lines.join('\n')}\n`, 'utf8');
}

// ---------- Tulis ----------

interface UpdateResult<T> {
  value: T;
  changed: boolean;
  /** Baris yang ditambahkan ke DECISIONS.md setelah comments.json ditulis. */
  decisions?: string[];
}

/**
 * Baca-ubah-tulis comments.json di bawah kunci; ditulis hanya bila `changed`. Setiap penulisan
 * juga memindahkan komentar resolved yang sudah lama ke arsip dan menambahkan log keputusan.
 */
function update<T>(dir: string, fn: (data: CommentsFile, now: string) => UpdateResult<T>): Promise<T> {
  const file = commentsPath(dir);
  return withLock(path.resolve(file).toLowerCase(), async () => {
    const data = await readFile(dir);
    const now = new Date().toISOString();
    const out = fn(data, now);
    if (out.changed) {
      await archiveOld(dir, data, now, await archiveDaysOf(dir));
      await writeJsonAtomic(file, data);
      await appendDecisions(dir, out.decisions ?? []);
    }
    return out.value;
  });
}

function mutate(dir: string, fn: (data: CommentsFile, now: string) => StoredComment, decision?: (c: StoredComment, now: string) => string | null): Promise<Comment> {
  return update(dir, (data, now) => {
    const c = fn(data, now);
    const line = decision?.(c, now);
    return { value: decorate(c), changed: true, ...(line ? { decisions: [line] } : {}) };
  });
}

export async function addComment(
  dir: string,
  input: { text: unknown; page?: unknown; author?: unknown; role?: unknown; anchor?: unknown },
  def: Source = USER_SOURCE,
): Promise<Comment> {
  const text = cleanText(input.text);
  const page = normalizePage(input.page);
  const src = source(input, def);
  const anchor = cleanAnchor(input.anchor);
  return mutate(dir, (data, now) => {
    const c: StoredComment = {
      id: `c${data.nextId++}`,
      page,
      author: src.author,
      role: src.role,
      text,
      status: 'open',
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
      resolvedBy: null,
      resolution: null,
      replies: [],
      ...(anchor ? { anchor } : {}),
    };
    data.comments.push(c);
    return c;
  });
}

export interface ReplyInput {
  text?: unknown;
  author?: unknown;
  role?: unknown;
  /** Jadikan balasan ini pertanyaan berpilihan. */
  options?: unknown;
  multi?: unknown;
  /** Jawab pertanyaan berpilihan (id balasan pertanyaan). */
  answerTo?: unknown;
  choices?: unknown;
}

/**
 * Balas komentar. Tiga bentuk:
 * - balasan biasa: `text`;
 * - pertanyaan berpilihan: `text` + `options` (+ `multi`);
 * - jawaban: `answerTo` + `choices` (+ `text` opsional sebagai catatan).
 * Balasan teks tanpa `answerTo` saat ada pertanyaan tertunda = pertanyaan balik; pertanyaannya tetap terbuka.
 */
export async function replyComment(dir: string, id: string, input: ReplyInput, def: Source = USER_SOURCE): Promise<Comment> {
  const src = source(input, def);
  const isQuestion = input.options !== undefined;
  const isAnswer = input.answerTo !== undefined;
  if (isQuestion && isAnswer) throw new AppError('BAD_REQUEST', 'Balasan tidak bisa sekaligus pertanyaan dan jawaban');

  if (isQuestion) {
    const text = cleanText(input.text, 'pertanyaan');
    const options = cleanOptions(input.options);
    const multi = input.multi === true;
    return mutate(dir, (data, now) => {
      const c = find(data, id);
      c.replies.push({ id: `${c.id}-r${c.replies.length + 1}`, author: src.author, role: src.role, text, createdAt: now, options, ...(multi ? { multi } : {}) });
      c.updatedAt = now;
      return c;
    });
  }

  if (isAnswer) {
    if (typeof input.answerTo !== 'string') throw new AppError('BAD_REQUEST', 'answerTo harus id balasan pertanyaan');
    const answerTo = input.answerTo;
    const text = optionalText(input.text);
    if (!Array.isArray(input.choices) || !input.choices.length) throw new AppError('BAD_REQUEST', 'Pilih minimal satu opsi');
    const picked = input.choices.map((x) => (typeof x === 'string' ? x.trim() : ''));
    return mutate(dir, (data, now) => {
      const c = find(data, id);
      const q = c.replies.find((r) => r.id === answerTo);
      if (!q?.options) throw new AppError('NOT_FOUND', `Pertanyaan "${answerTo}" tidak ditemukan di komentar ${c.id}`);
      const bad = picked.filter((p) => !q.options?.includes(p));
      if (bad.length) throw new AppError('BAD_REQUEST', `Opsi tidak dikenal: ${bad.join(', ')}`);
      const choices = q.options.filter((o) => picked.includes(o)); // urutan mengikuti opsi
      if (!q.multi && choices.length !== 1) throw new AppError('BAD_REQUEST', 'Pertanyaan ini hanya boleh satu pilihan');
      c.replies.push({ id: `${c.id}-r${c.replies.length + 1}`, author: src.author, role: src.role, text, createdAt: now, answerTo, choices });
      c.updatedAt = now;
      return c;
    });
  }

  const text = cleanText(input.text);
  return mutate(dir, (data, now) => {
    const c = find(data, id);
    c.replies.push({ id: `${c.id}-r${c.replies.length + 1}`, author: src.author, role: src.role, text, createdAt: now });
    c.updatedAt = now;
    return c;
  });
}

export async function resolveComment(
  dir: string,
  id: string,
  input: { note?: unknown; author?: unknown } = {},
  def: Source = USER_SOURCE,
): Promise<Comment> {
  const note = typeof input.note === 'string' && input.note.trim() ? cleanText(input.note, 'note') : null;
  const { author } = source(input, def);
  return mutate(dir, (data, now) => {
    const c = find(data, id);
    c.status = 'resolved';
    c.resolvedAt = now;
    c.resolvedBy = author;
    c.resolution = note;
    c.updatedAt = now;
    return c;
  }, (c, now) => decisionLine(c, now));
}

export async function reopenComment(dir: string, id: string): Promise<Comment> {
  let wasResolved = false;
  return mutate(dir, (data, now) => {
    const c = find(data, id);
    wasResolved = c.status === 'resolved';
    c.status = 'open';
    c.resolvedAt = null;
    c.resolvedBy = null;
    c.resolution = null;
    c.updatedAt = now;
    return c;
  }, (c, now) => (wasResolved ? decisionLine(c, now, '↺ dibuka lagi') : null));
}

/**
 * Catat di komentar bahwa perubahan dari sebuah run agent dibatalkan. Komentar yang disentuh:
 * yang dibalas atau di-resolve agent dalam rentang waktu run, ditambah `ids` (komentar yang diminta
 * dikerjakan). Komentar yang di-resolve dalam run dibuka lagi. Balasan berperan agent sehingga
 * giliran kembali ke pengguna. Mengembalikan id komentar yang diberi balasan.
 */
export async function noteUndo(
  dir: string,
  run: { since: string; until: string; ids?: readonly string[] },
  text: string,
  author = 'prototyper',
): Promise<string[]> {
  const since = Date.parse(run.since);
  const until = Date.parse(run.until) + 2000; // balasan yang ditulis tepat saat proses keluar
  const inRun = (iso: string | null) => {
    const t = iso ? Date.parse(iso) : NaN;
    return t >= since && t <= until;
  };
  const wanted = new Set(run.ids ?? []);
  return update(dir, (data, now) => {
    const touched: string[] = [];
    const decisions: string[] = [];
    for (const c of data.comments) {
      const resolvedInRun = c.status === 'resolved' && inRun(c.resolvedAt);
      const repliedInRun = c.replies.some((r) => r.role === 'agent' && inRun(r.createdAt));
      if (!resolvedInRun && !repliedInRun && !wanted.has(c.id)) continue;
      if (resolvedInRun) {
        c.status = 'open';
        c.resolvedAt = null;
        c.resolvedBy = null;
        c.resolution = null;
      }
      if (c.status !== 'open') continue;
      // Dicatat sebelum balasan pembatalan ditambahkan, agar "hasil" = laporan agent yang dibatalkan.
      const report = lastAgentReport(c);
      decisions.push(decisionLine(c, now, `↺ perubahan agent dibatalkan${report ? ` (${report})` : ''}${resolvedInRun ? ', dibuka lagi' : ''}`));
      c.replies.push({ id: `${c.id}-r${c.replies.length + 1}`, author, role: 'agent', text, createdAt: now });
      c.updatedAt = now;
      touched.push(c.id);
    }
    return { value: touched, changed: touched.length > 0, decisions };
  });
}

export async function deleteComment(dir: string, id: string): Promise<Comment> {
  return mutate(dir, (data) => {
    const c = find(data, id);
    data.comments = data.comments.filter((x) => x !== c);
    return c;
  });
}
