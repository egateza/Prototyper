import { AppError, errorBody, errorMessage, type ErrorCode } from '../core/errors.js';
import type { LogLine } from '../core/logs.js';
import type { PrototypeView } from '../core/views.js';

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

function statusLabel(v: PrototypeView): string {
  return v.valid ? v.status : 'invalid';
}

export function printTable(views: PrototypeView[]): void {
  if (!views.length) {
    console.log('Belum ada prototype. Daftarkan dengan: prototyper init <folder> lalu prototyper add <folder>');
    return;
  }
  const head = ['ID', 'STATUS', 'TYPE', 'URL', 'PATH'];
  const rows = views.map((v) => [v.id, statusLabel(v), v.type ?? '-', v.url ?? '-', v.path]);
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
    ['Nama', v.name],
    ['Tipe', v.type ?? '-'],
    ['Status', statusLabel(v)],
    ['URL', v.url ?? '-'],
    ...v.lanUrls.map((u): [string, string] => ['URL LAN', u]),
    ['Path', v.path],
    ['Instruksi', `${v.instructions.path}${v.instructions.exists ? '' : ' (belum ada)'}`],
    ['Komentar', `${v.comments.open} open, ${v.comments.resolved} selesai${v.comments.open ? ` (lihat: prototyper comments ${v.id})` : ''}`],
  ];
  if (v.description) lines.splice(2, 0, ['Deskripsi', v.description]);
  if (m?.type === 'command') {
    lines.push(['Run', m.command.run]);
    if (m.command.install) lines.push(['Install', m.command.install]);
  }
  if (m?.type === 'static') lines.push(['Root', m.static.root]);
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
