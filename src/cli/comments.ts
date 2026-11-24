import { promises as fs } from 'node:fs';
import type { Command } from 'commander';
import {
  addComment,
  AGENT_SOURCE,
  commentContext,
  countComments,
  deleteComment,
  listComments,
  reopenComment,
  replyComment,
  resolveComment,
  type Comment,
  type CommentContext,
  type Role,
  type Source,
} from '../core/comments.js';
import { AppError } from '../core/errors.js';
import { defineMessages } from '../core/i18n.js';
import type { Registry } from '../core/registry.js';
import { printJson } from './output.js';

const t = defineMessages({
  id: {
    imageTag: '[gambar]',
    waitingUser: 'menunggu pengguna',
    waitingAgent: 'menunggu agent',
    anchorText: '(teks: {text})',
    asks: '↳ {author} bertanya ({id}{multi}): {text}',
    multiAllowed: ', boleh lebih dari satu',
    notAnswered: '(belum dijawab)',
    answered: '↳ {author} menjawab {question}: {choices}{note}',
    resolvedBy: '✓ selesai oleh {by}{at}{resolution}',
    relatedResolved: 'Komentar selesai terkait ({n}):',
    none: '  (tidak ada)',
    sameElement: ' [elemen sama]',
    archived: ' [arsip]',
    previousDecisions: 'Keputusan sebelumnya ({n}):',
    roleMustBe: '--role harus "user" atau "agent"',
    defaultUserAuthor: 'pengguna',
    whatText: 'teks',
    whatComment: 'komentar',
    whatReply: 'balasan',
    whatQuestion: 'pertanyaan',
    whatNote: 'catatan',
    textBoth: 'Isi {what} lewat argumen atau --file, bukan keduanya',
    fileUnreadable: 'File {file} tidak bisa dibaca: {error}',
    textEmpty: 'Isi {what} kosong: berikan sebagai argumen atau lewat --file <path> (`-` = stdin)',
    optFile: 'baca teks dari file (`-` = stdin); pakai untuk teks multi-baris',
    commentsDesc: 'komentar pada prototype (disimpan di <folder>/.prototyper/comments.json)',
    commentsHelp: [
      '',
      'Contoh alur agent:',
      '  prototyper comments kasir-grosir --waiting agent --json   # yang perlu dikerjakan agent',
      '  prototyper comments context kasir-grosir c3 --json         # riwayat & keputusan terkait c3',
      '  prototyper comments resolve kasir-grosir c3 --note "Tombol bayar diperbesar"',
      '  prototyper comments ask kasir-grosir c4 "Warna tombol?" --option Ungu --option Hijau',
      '',
      'Teks multi-baris: argumen terpotong di baris pertama bila dipanggil lewat prototyper.cmd (Windows).',
      'Kirim lewat stdin atau file:',
      "  prototyper comments reply kasir-grosir c3 --file - <<'EOF'",
      '  Sudah diubah:',
      '  - tombol bayar diperbesar',
      '  EOF',
    ].join('\n'),
    listDesc: 'tampilkan komentar (default: hanya yang open)',
    optAll: 'termasuk yang sudah selesai',
    optResolved: 'hanya yang sudah selesai',
    optPage: 'hanya komentar pada halaman ini, mis. /kasir',
    optWaiting: 'hanya yang menunggu: agent | user',
    optIncludeArchive: 'sertakan komentar selesai yang sudah diarsipkan',
    listHeader: '{id}: {open} open ({waitingUser} menunggu pengguna), {resolved} selesai',
    noOpenComments: '(tidak ada komentar open)',
    noComments: '(tidak ada komentar)',
    contextDesc: 'konteks untuk mengerjakan satu komentar: thread, komentar selesai terkait (halaman/elemen sama), dan keputusan dari .prototyper/DECISIONS.md',
    optContextArchive: 'cari juga di komentar yang sudah diarsipkan',
    addDesc: 'tambah komentar',
    optAddPage: 'halaman yang dikomentari',
    optSelector: 'elemen yang dikomentari (selector CSS)',
    optQuote: 'teks yang dimaksud (dengan --selector)',
    optAuthor: 'nama penulis',
    optRole: 'agent | user (default agent)',
    added: '✓ komentar {id} ditambahkan pada {page}',
    replyDesc: 'balas komentar dengan teks bebas',
    replied: '✓ balasan ditambahkan ke {id}',
    askDesc: 'ajukan pertanyaan berpilihan; di Web UI tampil sebagai radio button / checkbox',
    optOption: 'opsi jawaban (ulangi 2-8 kali)',
    optMulti: 'boleh memilih lebih dari satu opsi',
    asked: '✓ pertanyaan {question} ditambahkan ke {id}; tunggu jawaban pengguna di Web UI',
    resolveDesc: 'tandai komentar selesai',
    optNote: 'ringkasan apa yang diubah',
    optNoteFile: 'baca ringkasan dari file (`-` = stdin); pakai untuk teks multi-baris',
    resolved: '✓ {id} ditandai selesai',
    reopenDesc: 'buka lagi komentar yang sudah selesai',
    reopened: '✓ {id} dibuka lagi',
    rmDesc: 'hapus komentar yang belum dikerjakan agent',
    optForce: 'hapus walaupun komentar sudah dikerjakan agent / sudah selesai',
    deleted: '✓ {id} dihapus',
  },
  en: {
    imageTag: '[image]',
    waitingUser: 'waiting for user',
    waitingAgent: 'waiting for agent',
    anchorText: '(text: {text})',
    asks: '↳ {author} asks ({id}{multi}): {text}',
    multiAllowed: ', multiple choices allowed',
    notAnswered: '(not answered yet)',
    answered: '↳ {author} answered {question}: {choices}{note}',
    resolvedBy: '✓ resolved by {by}{at}{resolution}',
    relatedResolved: 'Related resolved comments ({n}):',
    none: '  (none)',
    sameElement: ' [same element]',
    archived: ' [archived]',
    previousDecisions: 'Previous decisions ({n}):',
    roleMustBe: '--role must be "user" or "agent"',
    defaultUserAuthor: 'user',
    whatText: 'text',
    whatComment: 'comment',
    whatReply: 'reply',
    whatQuestion: 'question',
    whatNote: 'note',
    textBoth: 'Provide the {what} as an argument or with --file, not both',
    fileUnreadable: 'Cannot read file {file}: {error}',
    textEmpty: 'The {what} is empty: pass it as an argument or with --file <path> (`-` = stdin)',
    optFile: 'read the text from a file (`-` = stdin); use for multi-line text',
    commentsDesc: 'comments on a prototype (stored in <folder>/.prototyper/comments.json)',
    commentsHelp: [
      '',
      'Example agent workflow:',
      '  prototyper comments checkout --waiting agent --json   # what the agent needs to work on',
      '  prototyper comments context checkout c3 --json         # history & decisions related to c3',
      '  prototyper comments resolve checkout c3 --note "Made the pay button bigger"',
      '  prototyper comments ask checkout c4 "Button color?" --option Purple --option Green',
      '',
      'Multi-line text: arguments are cut off at the first line when called through prototyper.cmd (Windows).',
      'Send it through stdin or a file:',
      "  prototyper comments reply checkout c3 --file - <<'EOF'",
      '  Changed:',
      '  - made the pay button bigger',
      '  EOF',
    ].join('\n'),
    listDesc: 'show comments (default: open ones only)',
    optAll: 'include resolved ones',
    optResolved: 'resolved ones only',
    optPage: 'only comments on this page, e.g. /checkout',
    optWaiting: 'only those waiting for: agent | user',
    optIncludeArchive: 'include archived resolved comments',
    listHeader: '{id}: {open} open ({waitingUser} waiting for user), {resolved} resolved',
    noOpenComments: '(no open comments)',
    noComments: '(no comments)',
    contextDesc: 'context for working on one comment: the thread, related resolved comments (same page/element), and decisions from .prototyper/DECISIONS.md',
    optContextArchive: 'also search archived comments',
    addDesc: 'add a comment',
    optAddPage: 'page being commented on',
    optSelector: 'element being commented on (CSS selector)',
    optQuote: 'the text in question (with --selector)',
    optAuthor: 'author name',
    optRole: 'agent | user (default agent)',
    added: '✓ comment {id} added on {page}',
    replyDesc: 'reply to a comment with free text',
    replied: '✓ reply added to {id}',
    askDesc: 'ask a multiple-choice question; shown as radio buttons / checkboxes in the Web UI',
    optOption: 'answer option (repeat 2-8 times)',
    optMulti: 'allow choosing more than one option',
    asked: '✓ question {question} added to {id}; wait for the user to answer in the Web UI',
    resolveDesc: 'mark a comment as resolved',
    optNote: 'summary of what was changed',
    optNoteFile: 'read the summary from a file (`-` = stdin); use for multi-line text',
    resolved: '✓ {id} marked as resolved',
    reopenDesc: 'reopen a resolved comment',
    reopened: '✓ {id} reopened',
    rmDesc: 'delete a comment the agent has not worked on yet',
    optForce: 'delete even if the agent has already worked on it / it is resolved',
    deleted: '✓ {id} deleted',
  },
});

interface Ctx {
  json: boolean;
  registry: Registry;
}

type Act = (fn: (ctx: Ctx, args: Array<string | undefined>, cmd: Command) => Promise<void>) => (...raw: unknown[]) => Promise<void>;

function when(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function indent(text: string, pre: string): string {
  return text.split(/\r?\n/).map((l) => `${pre}${l}`).join('\n');
}

/** Baris lampiran gambar (path relatif terhadap folder prototype). */
const attachmentLines = (list: readonly string[] | undefined, pre: string) => (list ?? []).map((a) => `${pre}${t('imageTag')} ${a}`);

const waitingLabel = (role: Role): string => (role === 'user' ? t('waitingUser') : t('waitingAgent'));

export function formatComment(c: Comment): string {
  const head = `${c.id}  [${c.status}${c.waitingFor ? ` · ${waitingLabel(c.waitingFor)}` : ''}]  ${c.page}  — ${c.author}, ${when(c.createdAt)}`;
  const lines = [head];
  if (c.anchor) {
    const a = c.anchor;
    lines.push(`    @ ${a.selector}${a.quote ? `  «${a.quote}»` : a.text ? `  ${t('anchorText', { text: a.text })}` : ''}`);
  }
  if (c.text) lines.push(indent(c.text, '    '));
  lines.push(...attachmentLines(c.attachments, '    '));
  for (const r of c.replies) {
    if (r.options) {
      lines.push(indent(t('asks', { author: r.author, id: r.id, multi: r.multi ? t('multiAllowed') : '', text: r.text }), '    '));
      for (const o of r.options) {
        const picked = r.answer?.choices.includes(o);
        lines.push(`        ${picked ? '[x]' : '[ ]'} ${o}`);
      }
      if (!r.answer && c.status === 'open') lines.push(`        ${t('notAnswered')}`);
    } else if (r.answerTo) {
      lines.push(indent(t('answered', { author: r.author, question: r.answerTo, choices: (r.choices ?? []).join(', '), note: r.text ? ` — ${r.text}` : '' }), '    '));
    } else {
      lines.push(indent(`↳ ${r.author}: ${r.text}`, '    '));
      lines.push(...attachmentLines(r.attachments, '      '));
    }
  }
  if (c.status === 'resolved') {
    lines.push(`    ${t('resolvedBy', { by: c.resolvedBy ?? '-', at: c.resolvedAt ? `, ${when(c.resolvedAt)}` : '', resolution: c.resolution ? `: ${c.resolution}` : '' })}`);
  }
  return lines.join('\n');
}

/** Teks `comments context`: komentar lengkap, lalu komentar selesai terkait dan keputusan secara ringkas. */
export function formatContext(ctx: CommentContext): string {
  const out = [formatComment(ctx.comment)];
  out.push('', t('relatedResolved', { n: ctx.related.length }));
  if (!ctx.related.length) out.push(t('none'));
  for (const r of ctx.related) {
    const outcome = r.resolution ?? [...r.replies].reverse().find((x) => x.role === 'agent' && !x.options && !x.answerTo)?.text;
    out.push(`  ${r.id}${r.sameAnchor ? t('sameElement') : ''}${r.archived ? t('archived') : ''}${r.anchor ? ` @ ${r.anchor.selector}` : ''}: ${r.text.replace(/\s+/g, ' ')}`);
    if (outcome) out.push(`      → ${outcome.replace(/\s+/g, ' ')}`);
  }
  out.push('', t('previousDecisions', { n: ctx.decisions.length }));
  if (!ctx.decisions.length) out.push(t('none'));
  for (const d of ctx.decisions) out.push(`  ${d.date} · ${d.id}${d.selector ? ` · ${d.selector}` : ''} · ${d.text}`);
  return out.join('\n');
}

function parseRole(v: string | undefined): Role | undefined {
  if (v === undefined) return undefined;
  if (v !== 'user' && v !== 'agent') throw new AppError('BAD_REQUEST', t('roleMustBe'));
  return v;
}

/** Penulis dari CLI: default agent; `--role user` untuk menulis atas nama pengguna. */
function cliSource(o: { author?: string; role?: string }): Source {
  const role = parseRole(o.role) ?? 'agent';
  return { author: o.author ?? (role === 'agent' ? AGENT_SOURCE.author : t('defaultUserAuthor')), role };
}

const collect = (v: string, prev: string[]) => [...prev, v];

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Teks dari argumen atau dari `--file` (`-` = stdin). Argumen multi-baris terpotong di baris
 * pertama bila CLI dipanggil lewat shim `.cmd` (cmd.exe memotong `%*` di newline), jadi teks
 * panjang/multi-baris sebaiknya lewat file atau stdin.
 */
export async function resolveTextInput(text: string | undefined, file: string | undefined, what = t('whatText')): Promise<string> {
  if (file !== undefined) {
    if (text !== undefined) throw new AppError('BAD_REQUEST', t('textBoth', { what }));
    const raw = file === '-' ? await readStdin() : await fs.readFile(file, 'utf8').catch((err: NodeJS.ErrnoException) => {
      throw new AppError('BAD_REQUEST', t('fileUnreadable', { file, error: err.code ?? err.message }));
    });
    return raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\s+$/, '');
  }
  if (text === undefined) throw new AppError('BAD_REQUEST', t('textEmpty', { what }));
  return text;
}


/** Daftarkan `prototyper comments …`. Membaca/menulis langsung di folder prototype (tanpa daemon). */
export function registerCommentCommands(program: Command, act: Act): void {
  const comments = program
    .command('comments')
    .description(t('commentsDesc'))
    .addHelpText('after', t('commentsHelp'));

  comments
    .command('list <id>', { isDefault: true })
    .description(t('listDesc'))
    .option('-a, --all', t('optAll'))
    .option('--resolved', t('optResolved'))
    .option('--page <path>', t('optPage'))
    .option('-w, --waiting <role>', t('optWaiting'))
    .option('--include-archive', t('optIncludeArchive'))
    .action(
      act(async (ctx, [id], cmd) => {
        const o = cmd.opts<{ all?: boolean; resolved?: boolean; page?: string; waiting?: string; includeArchive?: boolean }>();
        const waitingFor = parseRole(o.waiting);
        const p = await ctx.registry.require(id ?? '');
        const status = o.all ? 'all' : o.resolved ? 'resolved' : 'open';
        const list = await listComments(p.path, {
          status,
          ...(o.page ? { page: o.page } : {}),
          ...(waitingFor ? { waitingFor } : {}),
          includeArchive: !!o.includeArchive,
        });
        const counts = countComments(p.path);
        if (ctx.json) return printJson({ id: p.id, counts, comments: list });
        console.log(`${t('listHeader', { id: p.id, open: counts.open, waitingUser: counts.waitingUser, resolved: counts.resolved })}\n`);
        if (!list.length) console.log(status === 'open' ? t('noOpenComments') : t('noComments'));
        console.log(list.map(formatComment).join('\n\n'));
      }),
    );

  comments
    .command('context <id> <commentId>')
    .description(t('contextDesc'))
    .option('--include-archive', t('optContextArchive'))
    .action(
      act(async (ctx, [id, cid], cmd) => {
        const o = cmd.opts<{ includeArchive?: boolean }>();
        const p = await ctx.registry.require(id ?? '');
        const c = await commentContext(p.path, cid ?? '', { includeArchive: !!o.includeArchive });
        if (ctx.json) return printJson(c);
        console.log(formatContext(c));
      }),
    );

  comments
    .command('add <id> [text]')
    .description(t('addDesc'))
    .option('-F, --file <path>', t('optFile'))
    .option('--page <path>', t('optAddPage'), '/')
    .option('--selector <css>', t('optSelector'))
    .option('--quote <text>', t('optQuote'))
    .option('--author <name>', t('optAuthor'))
    .option('--role <role>', t('optRole'))
    .action(
      act(async (ctx, [id, text], cmd) => {
        const o = cmd.opts<{ page: string; selector?: string; quote?: string; author?: string; role?: string; file?: string }>();
        const p = await ctx.registry.require(id ?? '');
        const anchor = o.selector ? { selector: o.selector, ...(o.quote ? { quote: o.quote } : {}) } : undefined;
        const body = await resolveTextInput(text, o.file, t('whatComment'));
        const c = await addComment(p.path, { text: body, page: o.page, anchor }, cliSource(o));
        if (ctx.json) return printJson(c);
        console.log(t('added', { id: c.id, page: c.page }));
      }),
    );

  comments
    .command('reply <id> <commentId> [text]')
    .description(t('replyDesc'))
    .option('-F, --file <path>', t('optFile'))
    .option('--author <name>', t('optAuthor'))
    .option('--role <role>', t('optRole'))
    .action(
      act(async (ctx, [id, cid, text], cmd) => {
        const o = cmd.opts<{ author?: string; role?: string; file?: string }>();
        const p = await ctx.registry.require(id ?? '');
        const body = await resolveTextInput(text, o.file, t('whatReply'));
        const c = await replyComment(p.path, cid ?? '', { text: body }, cliSource(o));
        if (ctx.json) return printJson(c);
        console.log(t('replied', { id: c.id }));
      }),
    );

  comments
    .command('ask <id> <commentId> [question]')
    .description(t('askDesc'))
    .option('-F, --file <path>', t('optFile'))
    .option('-o, --option <text>', t('optOption'), collect, [] as string[])
    .option('--multi', t('optMulti'))
    .option('--author <name>', t('optAuthor'))
    .action(
      act(async (ctx, [id, cid, question], cmd) => {
        const o = cmd.opts<{ option: string[]; multi?: boolean; author?: string; file?: string }>();
        const p = await ctx.registry.require(id ?? '');
        const body = await resolveTextInput(question, o.file, t('whatQuestion'));
        const c = await replyComment(p.path, cid ?? '', { text: body, options: o.option, multi: !!o.multi }, cliSource(o));
        if (ctx.json) return printJson(c);
        console.log(t('asked', { question: c.replies[c.replies.length - 1]?.id, id: c.id }));
      }),
    );

  comments
    .command('resolve <id> <commentId>')
    .description(t('resolveDesc'))
    .option('--note <text>', t('optNote'))
    .option('--note-file <path>', t('optNoteFile'))
    .option('--author <name>', t('optAuthor'))
    .action(
      act(async (ctx, [id, cid], cmd) => {
        const o = cmd.opts<{ note?: string; noteFile?: string; author?: string }>();
        const p = await ctx.registry.require(id ?? '');
        const note = o.noteFile !== undefined || o.note !== undefined ? await resolveTextInput(o.note, o.noteFile, t('whatNote')) : undefined;
        const c = await resolveComment(p.path, cid ?? '', { note }, cliSource(o));
        if (ctx.json) return printJson(c);
        console.log(t('resolved', { id: c.id }));
      }),
    );

  comments
    .command('reopen <id> <commentId>')
    .description(t('reopenDesc'))
    .action(
      act(async (ctx, [id, cid]) => {
        const p = await ctx.registry.require(id ?? '');
        const c = await reopenComment(p.path, cid ?? '');
        if (ctx.json) return printJson(c);
        console.log(t('reopened', { id: c.id }));
      }),
    );

  comments
    .command('rm <id> <commentId>')
    .alias('delete')
    .description(t('rmDesc'))
    .option('--force', t('optForce'))
    .action(
      act(async (ctx, [id, cid], cmd) => {
        const p = await ctx.registry.require(id ?? '');
        const c = await deleteComment(p.path, cid ?? '', { force: cmd.opts<{ force?: boolean }>().force === true });
        if (ctx.json) return printJson({ removed: { id: c.id } });
        console.log(t('deleted', { id: c.id }));
      }),
    );
}
