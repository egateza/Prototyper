import { promises as fs } from 'node:fs';
import path from 'node:path';
import { resolveHome } from './config.js';
import { errorMessage } from './errors.js';
import type { Manifest } from './manifest.js';

/**
 * Petunjuk untuk LLM agent di folder prototype. Prototyper memelihara satu bagian bertanda di
 * AGENTS.md (dibaca Codex, Cursor, dll.) dan memastikan CLAUDE.md mengimpornya (Claude Code),
 * sehingga agent yang dibuka di folder prototype langsung tahu cara memakai Prototyper.
 * Isi di luar penanda tidak pernah diubah.
 */
export const MARK_START = '<!-- prototyper:start -->';
export const MARK_END = '<!-- prototyper:end -->';

export type AgentFileAction = 'created' | 'updated' | 'unchanged' | 'skipped' | 'missing' | 'error';

export interface AgentFileResult {
  file: string;
  action: AgentFileAction;
  error?: string;
}

export interface SyncOptions {
  /** Folder data Prototyper; menentukan path shim di petunjuk (default: PROTOTYPER_HOME / ~/.prototyper). */
  home?: string;
  /**
   * Sinkron otomatis: hanya perbarui bagian Prototyper yang sudah ada. File yang belum ada atau
   * tidak punya penanda dilewati ('missing'), dan CLAUDE.md tidak disentuh.
   */
  onlyExisting?: boolean;
}

/**
 * Shim CLI di folder data (ditulis ulang daemon tiap menyala, lihat ensureShim). Dipakai di petunjuk
 * agar isinya sama walau Prototyper dijalankan dari exe, portable, npm, atau source.
 */
export function shimCommand(home: string, platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? path.win32.join(home, 'bin', 'prototyper.cmd') : path.posix.join(home.replace(/\\/g, '/'), 'bin', 'prototyper');
}

export function instructionsFile(m: Manifest): string {
  return m.agent?.instructions ?? 'AGENTS.md';
}

/** Isi bagian Prototyper (di antara penanda) untuk sebuah manifest. */
export function prototyperSection(m: Manifest, home: string = resolveHome()): string {
  const id = m.id;
  const lines = [
    MARK_START,
    '## Prototyper',
    '',
    `Folder ini adalah prototype **${m.name}** (id \`${id}\`, mode ${m.type}) yang dikelola Prototyper.`,
    'Bagian ini dibuat otomatis — jangan diedit manual; perbarui dengan `prototyper agents sync`.',
    '',
    `- Info & URL: \`prototyper info ${id} --json\` · jalankan: \`prototyper start ${id} --json\` · log: \`prototyper logs ${id} -n 100 --json\``,
  ];
  if (m.type === 'static') {
    const entry = path.posix.join(m.static.root.replace(/\\/g, '/'), m.static.index);
    lines.push(
      `- Mode static: file disajikan apa adanya (\`Cache-Control: no-store\`). ${m.static.inject && m.static.liveReload ? 'Halaman yang sedang dibuka dimuat ulang otomatis setelah file berubah (live-reload)' : 'Setelah edit cukup refresh'}, tidak perlu restart. Titik masuk: \`${entry}\`${m.static.spa ? ' (SPA)' : ''}.`,
    );
  } else {
    lines.push(
      `- Mode command: dijalankan dengan \`${m.command.run}\`. Dev server dengan HMR tidak perlu restart; \`prototyper restart ${id}\` bila tidak ada HMR atau setelah mengubah \`prototyper.json\`.`,
    );
    if (m.command.install) lines.push(`- Dependensi: \`prototyper install ${id}\` (\`${m.command.install}\`).`);
  }
  lines.push(
    '- Jangan mengubah `prototyper.json` kecuali memang perlu mengubah cara menjalankan prototype.',
    '',
    '### Komentar dari pengguna',
    '',
    'Pengguna menulis komentar di Web UI Prototyper. Bila diminta "kerjakan komentar" (atau sejenisnya):',
    '',
    `1. Ambil yang giliran agent: \`prototyper comments ${id} --waiting agent --json\`. Perhatikan \`page\`, \`anchor\` (elemen yang diklik/diblok pengguna: \`selector\` CSS, \`text\`, \`quote\` — cari elemen itu di kode), balasan, dan \`answer\` pada pertanyaan berpilihan.`,
    `2. Kerjakan satu per satu, lalu laporkan lewat \`prototyper comments reply ${id} <commentId> "<ringkasan perubahan>"\` dan biarkan komentar tetap open.`,
    `   **Jangan menutup komentar** (\`prototyper comments resolve\`): penggunalah yang memeriksa hasil dan menentukan pekerjaan selesai. Resolve hanya bila pengguna secara eksplisit memintanya.`,
    `3. Bila ada beberapa kemungkinan, jangan menebak: \`prototyper comments ask ${id} <commentId> "<pertanyaan>" --option "A" --option "B"\` (\`--multi\` bila boleh lebih dari satu), lalu biarkan open.`,
    `4. Pertanyaan balik atau permintaan revisi dari pengguna dijawab dengan \`prototyper comments reply ${id} <commentId> "<jawaban>"\`.`,
    '5. Komentar dengan `waitingFor: "user"` sedang menunggu pengguna — jangan dikerjakan dulu.',
    '',
    `Bila perintah \`prototyper\` tidak ditemukan, pakai shim-nya: \`"${shimCommand(home)}" <perintah>\`.`,
    MARK_END,
  );
  return lines.join('\n');
}

async function readText(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

/** Ganti blok bertanda, atau tambahkan di akhir bila belum ada. */
export function upsertBlock(text: string, block: string): string {
  const start = text.indexOf(MARK_START);
  const end = text.indexOf(MARK_END, start);
  if (start >= 0 && end > start) return text.slice(0, start) + block + text.slice(end + MARK_END.length);
  const base = text.replace(/\s+$/, '');
  return base ? `${base}\n\n${block}\n` : `${block}\n`;
}

async function writeIfChanged(file: string, before: string | null, after: string): Promise<AgentFileAction> {
  if (before === after) return 'unchanged';
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, after, 'utf8');
  return before === null ? 'created' : 'updated';
}

/**
 * Pasang/perbarui petunjuk agent di folder prototype. Tidak pernah melempar error: kegagalan
 * menulis (mis. folder read-only) dilaporkan sebagai action "error" agar pendaftaran tetap jalan.
 */
export async function syncAgentFiles(dir: string, m: Manifest, opts: SyncOptions = {}): Promise<AgentFileResult[]> {
  const rel = instructionsFile(m);
  if (m.agent?.syncInstructions === false) return [{ file: rel, action: 'skipped' }];
  const out: AgentFileResult[] = [];
  const section = prototyperSection(m, opts.home);

  const instr = path.join(dir, rel);
  try {
    const before = (await readText(instr))?.replace(/^﻿/, '') ?? null;
    if (opts.onlyExisting && !before?.includes(MARK_START)) return [{ file: rel, action: 'missing' }];
    const after = before === null ? `# ${m.name}\n\n${section}\n` : upsertBlock(before, section);
    out.push({ file: rel, action: await writeIfChanged(instr, before, after) });
  } catch (err) {
    out.push({ file: rel, action: 'error', error: errorMessage(err) });
  }
  if (opts.onlyExisting) return out; // CLAUDE.md hanya berisi impor; tidak berubah antar versi

  // Claude Code membaca CLAUDE.md; impor file instruksi agar isinya sama.
  const claude = path.join(dir, 'CLAUDE.md');
  const importLine = `@${rel.replace(/\\/g, '/')}`;
  try {
    const before = (await readText(claude))?.replace(/^﻿/, '') ?? null;
    let after: string;
    if (before === null) after = `${importLine}\n`;
    else if (before.split(/\r?\n/).some((l) => l.trim() === importLine)) after = before;
    else after = upsertBlock(before, `${MARK_START}\n${importLine}\n${MARK_END}`);
    out.push({ file: 'CLAUDE.md', action: await writeIfChanged(claude, before, after) });
  } catch (err) {
    out.push({ file: 'CLAUDE.md', action: 'error', error: errorMessage(err) });
  }
  return out;
}

const ACTION_LABEL: Record<AgentFileAction, string> = {
  created: 'dibuat',
  updated: 'diperbarui',
  unchanged: 'sudah terbaru',
  skipped: 'dilewati (agent.syncInstructions: false)',
  missing: 'tidak punya bagian Prototyper (pasang dengan `prototyper agents sync`)',
  error: 'gagal',
};

export function describeAgentFiles(results: AgentFileResult[]): string[] {
  return results.map((r) => `${r.file} ${ACTION_LABEL[r.action]}${r.error ? `: ${r.error}` : ''}`);
}
