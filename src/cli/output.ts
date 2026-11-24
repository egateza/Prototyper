import { AppError, errorBody, errorMessage, type ErrorCode } from '../core/errors.js';
import type { LogLine } from '../core/logs.js';
import type { PrototypeView } from '../core/views.js';
import { defineMessages } from '../core/i18n.js';

const t = defineMessages({
  id: {
    dsSource: 'desain sistem',
    dsOwn: 'sendiri',
    noPrototypes: 'Belum ada prototype. Daftarkan dengan: prototyper init <folder> lalu prototyper add <folder>',
    name: 'Nama',
    type: 'Tipe',
    lanUrl: 'URL LAN',
    instructions: 'Instruksi',
    notYet: ' (belum ada)',
    comments: 'Komentar',
    commentCounts: '{open} open, {resolved} selesai',
    commentsHint: ' (lihat: prototyper comments {id})',
    description: 'Deskripsi',
    designSystem: 'Desain sistem',
    dsIsSource: 'ya, dipakai prototype lain (lihat: prototyper ds list)',
    dsUses: '{ds} (salinan di {dir}/)',
    dsLocal: 'sendiri: {paths}',
  },
  en: {
    dsSource: 'design system',
    dsOwn: 'own',
    noPrototypes: 'No prototypes yet. Register one with: prototyper init <folder> then prototyper add <folder>',
    name: 'Name',
    type: 'Type',
    lanUrl: 'LAN URL',
    instructions: 'Instructions',
    notYet: ' (not created yet)',
    comments: 'Comments',
    commentCounts: '{open} open, {resolved} resolved',
    commentsHint: ' (see: prototyper comments {id})',
    description: 'Description',
    designSystem: 'Design system',
    dsIsSource: 'yes, used by other prototypes (see: prototyper ds list)',
    dsUses: '{ds} (copy in {dir}/)',
    dsLocal: 'own: {paths}',
  },
});

export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function reportError(err: unknown, json: boolean): void {
  const code: ErrorCode = err instanceof AppError ? err.code : 'INTERNAL';
  const details = err instanceof AppError ? err.details : undefined;
  const message = errorMessage(err);
  if (json) {
    printJson(errorBody(code, message, details));
    return;
  }
  console.error(`Error: ${message}`);
  // details sudah tercakup di message untuk INVALID_MANIFEST; tampilkan per baris agar mudah dibaca
  if (details?.length) for (const d of details) console.error(`  - ${d}`);
}

/** Peran desain sistem untuk kolom DS: desain sistem, memakai <id>, atau milik sendiri. */
export function dsLabel(v: PrototypeView): string {
  const d = v.manifest?.designSystem;
  if (d?.source) return t('dsSource');
  if (d?.use) return `→ ${d.use}`;
  if (d?.local) return t('dsOwn');
  return '-';
}

function statusLabel(v: PrototypeView): string {
  return v.valid ? v.status : 'invalid';
}

export function printTable(views: PrototypeView[]): void {
  if (!views.length) {
    console.log(t('noPrototypes'));
    return;
  }
  // Desain sistem di atas, lalu prototype; urutan lain dipertahankan.
  const sorted = [...views].sort((a, b) => Number(!!b.manifest?.designSystem?.source) - Number(!!a.manifest?.designSystem?.source));
  const head = ['ID', 'STATUS', 'TYPE', 'DS', 'URL', 'PATH'];
  const rows = sorted.map((v) => [v.id, statusLabel(v), v.type ?? '-', dsLabel(v), v.url ?? '-', v.path]);
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)));
  const fmt = (r: string[]) => r.map((c, i) => (i === r.length - 1 ? c : c.padEnd(widths[i] ?? 0))).join('  ');
  console.log(fmt(head));
  for (const r of rows) console.log(fmt(r));
  for (const v of views) if (v.error) console.log(`\n! ${v.id}: ${v.error}`);
}

export function printInfo(v: PrototypeView): void {
  const m = v.manifest;
  const lines: Array<[string, string]> = [
    ['ID', v.id],
    [t('name'), v.name],
    [t('type'), v.type ?? '-'],
    ['Status', statusLabel(v)],
    ['URL', v.url ?? '-'],
    ...v.lanUrls.map((u): [string, string] => [t('lanUrl'), u]),
    ['Path', v.path],
    [t('instructions'), `${v.instructions.path}${v.instructions.exists ? '' : t('notYet')}`],
    [t('comments'), `${t('commentCounts', { open: v.comments.open, resolved: v.comments.resolved })}${v.comments.open ? t('commentsHint', { id: v.id }) : ''}`],
  ];
  if (v.description) lines.splice(2, 0, [t('description'), v.description]);
  if (m?.type === 'command') {
    lines.push(['Run', m.command.run]);
    if (m.command.install) lines.push(['Install', m.command.install]);
  }
  if (m?.type === 'static') lines.push(['Root', m.static.root]);
  const ds = m?.designSystem;
  if (ds?.source) lines.push([t('designSystem'), t('dsIsSource')]);
  else if (ds?.use) lines.push([t('designSystem'), t('dsUses', { ds: ds.use, dir: ds.dir ?? 'design-system' })]);
  else if (ds?.local) lines.push([t('designSystem'), t('dsLocal', { paths: ds.local.join(', ') })]);
  if (v.pid) lines.push(['PID', String(v.pid)]);
  if (v.error) lines.push(['Error', v.error]);
  const w = Math.max(...lines.map(([k]) => k.length));
  for (const [k, val] of lines) console.log(`${k.padEnd(w)} : ${val}`);
}

export function formatLogLine(l: LogLine): string {
  const t = l.ts ? l.ts.slice(11, 19) : '--:--:--';
  const mark = l.stream === 'stderr' ? '!' : ' ';
  return `${t} ${mark} ${l.line}`;
}
