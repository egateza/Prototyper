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
import type { Registry } from '../core/registry.js';
import { printJson } from './output.js';

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

const WAITING_LABEL: Record<Role, string> = { user: 'menunggu pengguna', agent: 'menunggu agent' };

export function formatComment(c: Comment): string {
  const head = `${c.id}  [${c.status}${c.waitingFor ? ` · ${WAITING_LABEL[c.waitingFor]}` : ''}]  ${c.page}  — ${c.author}, ${when(c.createdAt)}`;
  const lines = [head];
  if (c.anchor) {
    const a = c.anchor;
    lines.push(`    @ ${a.selector}${a.quote ? `  «${a.quote}»` : a.text ? `  (teks: ${a.text})` : ''}`);
  }
  lines.push(indent(c.text, '    '));
  for (const r of c.replies) {
    if (r.options) {
      lines.push(indent(`↳ ${r.author} bertanya (${r.id}${r.multi ? ', boleh lebih dari satu' : ''}): ${r.text}`, '    '));
      for (const o of r.options) {
        const picked = r.answer?.choices.includes(o);
        lines.push(`        ${picked ? '[x]' : '[ ]'} ${o}`);
      }
      if (!r.answer && c.status === 'open') lines.push('        (belum dijawab)');
    } else if (r.answerTo) {
      lines.push(indent(`↳ ${r.author} menjawab ${r.answerTo}: ${(r.choices ?? []).join(', ')}${r.text ? ` — ${r.text}` : ''}`, '    '));
    } else {
      lines.push(indent(`↳ ${r.author}: ${r.text}`, '    '));
    }
  }
  if (c.status === 'resolved') {
    lines.push(`    ✓ selesai oleh ${c.resolvedBy ?? '-'}${c.resolvedAt ? `, ${when(c.resolvedAt)}` : ''}${c.resolution ? `: ${c.resolution}` : ''}`);
  }
  return lines.join('\n');
}

/** Teks `comments context`: komentar lengkap, lalu komentar selesai terkait dan keputusan secara ringkas. */
export function formatContext(ctx: CommentContext): string {
  const out = [formatComment(ctx.comment)];
  out.push('', `Komentar selesai terkait (${ctx.related.length}):`);
  if (!ctx.related.length) out.push('  (tidak ada)');
  for (const r of ctx.related) {
    const outcome = r.resolution ?? [...r.replies].reverse().find((x) => x.role === 'agent' && !x.options && !x.answerTo)?.text;
    out.push(`  ${r.id}${r.sameAnchor ? ' [elemen sama]' : ''}${r.archived ? ' [arsip]' : ''}${r.anchor ? ` @ ${r.anchor.selector}` : ''}: ${r.text.replace(/\s+/g, ' ')}`);
    if (outcome) out.push(`      → ${outcome.replace(/\s+/g, ' ')}`);
  }
  out.push('', `Keputusan sebelumnya (${ctx.decisions.length}):`);
  if (!ctx.decisions.length) out.push('  (tidak ada)');
  for (const d of ctx.decisions) out.push(`  ${d.date} · ${d.id}${d.selector ? ` · ${d.selector}` : ''} · ${d.text}`);
  return out.join('\n');
}

function parseRole(v: string | undefined): Role | undefined {
  if (v === undefined) return undefined;
  if (v !== 'user' && v !== 'agent') throw new AppError('BAD_REQUEST', '--role harus "user" atau "agent"');
  return v;
}

/** Penulis dari CLI: default agent; `--role user` untuk menulis atas nama pengguna. */
function cliSource(o: { author?: string; role?: string }): Source {
  const role = parseRole(o.role) ?? 'agent';
  return { author: o.author ?? (role === 'agent' ? AGENT_SOURCE.author : 'pengguna'), role };
}

const collect = (v: string, prev: string[]) => [...prev, v];

/** Daftarkan `prototyper comments …`. Membaca/menulis langsung di folder prototype (tanpa daemon). */
export function registerCommentCommands(program: Command, act: Act): void {
  const comments = program
    .command('comments')
    .description('komentar pada prototype (disimpan di <folder>/.prototyper/comments.json)')
    .addHelpText(
      'after',
      [
        '',
        'Contoh alur agent:',
        '  prototyper comments kasir-grosir --waiting agent --json   # yang perlu dikerjakan agent',
        '  prototyper comments context kasir-grosir c3 --json         # riwayat & keputusan terkait c3',
        '  prototyper comments resolve kasir-grosir c3 --note "Tombol bayar diperbesar"',
        '  prototyper comments ask kasir-grosir c4 "Warna tombol?" --option Ungu --option Hijau',
      ].join('\n'),
    );

  comments
    .command('list <id>', { isDefault: true })
    .description('tampilkan komentar (default: hanya yang open)')
    .option('-a, --all', 'termasuk yang sudah selesai')
    .option('--resolved', 'hanya yang sudah selesai')
    .option('--page <path>', 'hanya komentar pada halaman ini, mis. /kasir')
    .option('-w, --waiting <role>', 'hanya yang menunggu: agent | user')
    .option('--include-archive', 'sertakan komentar selesai yang sudah diarsipkan')
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
        console.log(`${p.id}: ${counts.open} open (${counts.waitingUser} menunggu pengguna), ${counts.resolved} selesai\n`);
        if (!list.length) console.log(status === 'open' ? '(tidak ada komentar open)' : '(tidak ada komentar)');
        console.log(list.map(formatComment).join('\n\n'));
      }),
    );

  comments
    .command('context <id> <commentId>')
    .description('konteks untuk mengerjakan satu komentar: thread, komentar selesai terkait (halaman/elemen sama), dan keputusan dari .prototyper/DECISIONS.md')
    .option('--include-archive', 'cari juga di komentar yang sudah diarsipkan')
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
    .command('add <id> <text>')
    .description('tambah komentar')
    .option('--page <path>', 'halaman yang dikomentari', '/')
    .option('--selector <css>', 'elemen yang dikomentari (selector CSS)')
    .option('--quote <text>', 'teks yang dimaksud (dengan --selector)')
    .option('--author <name>', 'nama penulis')
    .option('--role <role>', 'agent | user (default agent)')
    .action(
      act(async (ctx, [id, text], cmd) => {
        const o = cmd.opts<{ page: string; selector?: string; quote?: string; author?: string; role?: string }>();
        const p = await ctx.registry.require(id ?? '');
        const anchor = o.selector ? { selector: o.selector, ...(o.quote ? { quote: o.quote } : {}) } : undefined;
        const c = await addComment(p.path, { text, page: o.page, anchor }, cliSource(o));
        if (ctx.json) return printJson(c);
        console.log(`✓ komentar ${c.id} ditambahkan pada ${c.page}`);
      }),
    );

  comments
    .command('reply <id> <commentId> <text>')
    .description('balas komentar dengan teks bebas')
    .option('--author <name>', 'nama penulis')
    .option('--role <role>', 'agent | user (default agent)')
    .action(
      act(async (ctx, [id, cid, text], cmd) => {
        const p = await ctx.registry.require(id ?? '');
        const c = await replyComment(p.path, cid ?? '', { text }, cliSource(cmd.opts()));
        if (ctx.json) return printJson(c);
        console.log(`✓ balasan ditambahkan ke ${c.id}`);
      }),
    );

  comments
    .command('ask <id> <commentId> <question>')
    .description('ajukan pertanyaan berpilihan; di Web UI tampil sebagai radio button / checkbox')
    .option('-o, --option <text>', 'opsi jawaban (ulangi 2-8 kali)', collect, [] as string[])
    .option('--multi', 'boleh memilih lebih dari satu opsi')
    .option('--author <name>', 'nama penulis')
    .action(
      act(async (ctx, [id, cid, question], cmd) => {
        const o = cmd.opts<{ option: string[]; multi?: boolean; author?: string }>();
        const p = await ctx.registry.require(id ?? '');
        const c = await replyComment(p.path, cid ?? '', { text: question, options: o.option, multi: !!o.multi }, cliSource(o));
        if (ctx.json) return printJson(c);
        console.log(`✓ pertanyaan ${c.replies[c.replies.length - 1]?.id} ditambahkan ke ${c.id}; tunggu jawaban pengguna di Web UI`);
      }),
    );

  comments
    .command('resolve <id> <commentId>')
    .description('tandai komentar selesai')
    .option('--note <text>', 'ringkasan apa yang diubah')
    .option('--author <name>', 'nama penulis')
    .action(
      act(async (ctx, [id, cid], cmd) => {
        const o = cmd.opts<{ note?: string; author?: string }>();
        const p = await ctx.registry.require(id ?? '');
        const c = await resolveComment(p.path, cid ?? '', { note: o.note }, cliSource(o));
        if (ctx.json) return printJson(c);
        console.log(`✓ ${c.id} ditandai selesai`);
      }),
    );

  comments
    .command('reopen <id> <commentId>')
    .description('buka lagi komentar yang sudah selesai')
    .action(
      act(async (ctx, [id, cid]) => {
        const p = await ctx.registry.require(id ?? '');
        const c = await reopenComment(p.path, cid ?? '');
        if (ctx.json) return printJson(c);
        console.log(`✓ ${c.id} dibuka lagi`);
      }),
    );

  comments
    .command('rm <id> <commentId>')
    .alias('delete')
    .description('hapus komentar')
    .action(
      act(async (ctx, [id, cid]) => {
        const p = await ctx.registry.require(id ?? '');
        const c = await deleteComment(p.path, cid ?? '');
        if (ctx.json) return printJson({ removed: { id: c.id } });
        console.log(`✓ ${c.id} dihapus`);
      }),
    );
}
