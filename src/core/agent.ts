import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { APP_MODE, cliCommand, type AppMode } from './appfiles.js';
import { Checkpoints, removeCheckpoints, type FileChange, type UndoResult } from './checkpoint.js';
import { noteUndo } from './comments.js';
import type { Config } from './config.js';
import { AppError, errorMessage } from './errors.js';
import { LogStore } from './logs.js';
import type { ResolvedPrototype } from './registry.js';
import { killTree } from './runtime.js';

/**
 * Menjalankan agent coding CLI (Claude Code, Codex, Gemini CLI, GitHub Copilot CLI) di folder
 * prototype atas permintaan pengguna dari Web UI. Prototyper tidak pernah membaca/menyimpan
 * kredensial: ia hanya menjalankan binary agent seperti pengguna menjalankannya di terminal,
 * dalam mode non-interaktif dengan izin yang dibatasi sejauh didukung agent tersebut.
 */

export const AGENT_IDS = ['claude', 'codex', 'gemini', 'copilot'] as const;
export type AgentId = (typeof AGENT_IDS)[number];
export const isAgentId = (v: unknown): v is AgentId => typeof v === 'string' && (AGENT_IDS as readonly string[]).includes(v);

export type AgentRunStatus = 'running' | 'done' | 'failed' | 'stopped';

export interface AgentRunInfo {
  agent: AgentId;
  status: AgentRunStatus;
  startedAt: string;
  endedAt: string | null;
  exitCode: number | null;
  /** Komentar yang diminta untuk dikerjakan (kosong = semua yang giliran agent). */
  commentIds: string[];
  /** Jawaban akhir agent (Claude: hasil akhir; agent lain: baris terakhir output). */
  summary: string | null;
  /** Estimasi biaya (hanya Claude Code; untuk login langganan hanya perkiraan). */
  costUsd: number | null;
  turns: number | null;
  error: string | null;
  /** Snapshot folder sebelum/sesudah run (null bila checkpoint mati atau gagal dibuat). */
  checkpoint: AgentCheckpoint | null;
  /** Alasan checkpoint tidak dibuat (mis. git tidak ditemukan). */
  checkpointError: string | null;
}

export interface AgentCheckpoint {
  before: string;
  /** Diisi saat run berakhir. */
  after: string | null;
  /** File yang diubah agent (before → after). */
  changes: FileChange[];
  /** Waktu perubahan dibatalkan lewat undo. */
  undoneAt: string | null;
}

export interface AgentInfo {
  id: AgentId;
  name: string;
  /** "tested" = diuji dengan agent aslinya; "experimental" = preset belum diuji. */
  support: 'tested' | 'experimental';
  available: boolean;
  version: string | null;
  /** Path executable yang ditemukan. */
  path: string | null;
  error: string | null;
  install: string;
  /** Cara agent dibatasi saat dijalankan dari Prototyper. */
  permissions: string;
}

export interface AgentRunOptions {
  agent?: AgentId;
  commentIds?: string[];
  message?: string;
}

/** Perintah yang dijalankan: executable + argumen awal (mis. node + skrip JS di balik shim npm). */
export interface AgentCommand {
  bin: string;
  prefixArgs: string[];
}
/** @deprecated nama lama */
export type AgentCommandOverride = AgentCommand;

interface Preset {
  id: AgentId;
  name: string;
  exe: string;
  support: 'tested' | 'experimental';
  install: string;
  permissions: string;
  output: 'claude-stream' | 'text';
  args(prompt: string, opts: { apikey: boolean; env: NodeJS.ProcessEnv }): string[];
}

const CLAUDE_TOOLS = ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash(prototyper *)', 'PowerShell(prototyper *)'];

const BASE_RULES = [
  'Kamu dijalankan oleh Prototyper tanpa sesi interaktif; pengguna membaca hasilmu di Web UI Prototyper.',
  'Pengguna tidak bisa membalas jawaban akhirmu. Untuk bertanya, gunakan `prototyper comments ask` (dengan opsi) atau `prototyper comments reply` pada komentar terkait.',
  'Hanya ubah file di folder kerja ini. Jangan ubah prototyper.json, folder .prototyper/, AGENTS.md, atau CLAUDE.md.',
  'Selalu baca isi file yang relevan sebelum mengeditnya.',
  'Jangan menutup komentar dengan `prototyper comments resolve`; laporkan hasil dengan `prototyper comments reply` dan biarkan pengguna yang menutupnya.',
];

/**
 * Aturan per agent. Agent dengan tool baca/edit khusus (Claude, Gemini, Copilot) cukup diberi shell
 * `prototyper`. Codex membaca file lewat shell dan mengedit dengan apply_patch, jadi shell harus
 * boleh dipakai untuk membaca/mencari; batas tulisnya dijaga sandbox workspace-write.
 */
export function agentRules(id: AgentId): string {
  const extra =
    id === 'codex'
      ? 'Gunakan perintah shell untuk membaca dan mencari file di folder ini (mis. `Get-Content`, `rg`), `apply_patch` untuk mengedit, dan `prototyper …` untuk komentar. Jangan menginstal paket atau mengakses jaringan.'
      : 'Gunakan tool baca/edit file untuk membaca dan mengubah file. Perintah shell yang boleh dipakai hanya `prototyper …`.';
  return [...BASE_RULES, extra].join(' ');
}

export const PRESETS: Record<AgentId, Preset> = {
  claude: {
    id: 'claude',
    name: 'Claude Code',
    exe: 'claude',
    support: 'tested',
    install: 'Install Claude Code (https://code.claude.com), lalu login dengan `claude`.',
    permissions: 'baca/edit file + perintah `prototyper`; lainnya ditolak otomatis (--permission-mode dontAsk)',
    output: 'claude-stream',
    args: (prompt, { apikey }) => [
      '-p', prompt,
      '--output-format', 'stream-json', '--verbose',
      '--permission-mode', 'dontAsk',
      '--permission-prompts', 'none',
      '--allowedTools', CLAUDE_TOOLS.join(','),
      '--append-system-prompt', agentRules('claude'),
      ...(apikey ? ['--bare'] : []),
    ],
  },
  codex: {
    id: 'codex',
    name: 'OpenAI Codex',
    exe: 'codex',
    support: 'tested',
    install: '`npm install -g @openai/codex`, lalu `codex login` (Sign in with ChatGPT).',
    permissions: 'sandbox workspace-write: perintah berjalan di sandbox, hanya bisa menulis di folder prototype, tanpa jaringan; config.toml tidak dimuat (--ignore-user-config) kecuali [windows] sandbox',
    output: 'text',
    // --ignore-user-config: model/MCP dari config.toml (mis. milik aplikasi Codex desktop) bisa tidak
    // didukung CLI dengan login ChatGPT; login tetap dipakai. Model bisa dipilih lewat PROTOTYPER_AGENT_CODEX_MODEL.
    args: (prompt, { env }) => [
      'exec', '--ignore-user-config', '--sandbox', 'workspace-write', '--skip-git-repo-check',
      ...((sb) => (sb ? ['-c', `windows.sandbox="${sb}"`] : []))(codexWindowsSandbox(env)),
      ...(env.PROTOTYPER_AGENT_CODEX_MODEL ? ['-m', env.PROTOTYPER_AGENT_CODEX_MODEL] : []),
      `${prompt}\n\n${agentRules('codex')}`,
    ],
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini CLI',
    exe: 'gemini',
    support: 'experimental',
    install: '`npm install -g @google/gemini-cli`, lalu jalankan `gemini` sekali untuk login.',
    permissions: 'edit file disetujui otomatis (--approval-mode auto_edit); shell hanya `prototyper`',
    output: 'text',
    args: (prompt) => ['-p', `${prompt}\n\n${agentRules('gemini')}`, '--approval-mode', 'auto_edit', '--allowed-tools', 'run_shell_command(prototyper)'],
  },
  copilot: {
    id: 'copilot',
    name: 'GitHub Copilot CLI',
    exe: 'copilot',
    support: 'experimental',
    install: 'Jalankan `copilot` sekali di terminal untuk menginstal, lalu login dengan akun GitHub.',
    permissions: 'tulis file + shell `prototyper` saja (--allow-tool)',
    output: 'text',
    args: (prompt) => ['-p', `${prompt}\n\n${agentRules('copilot')}`, '--allow-tool', 'write', '--allow-tool', 'shell(prototyper)'],
  },
};

/**
 * Ambil hanya `[windows] sandbox = "…"` dari config.toml Codex (mis. "elevated" yang disiapkan aplikasi
 * Codex desktop). Tanpa nilai ini, sandbox workspace-write di Windows turun menjadi read-only.
 * Isi config lain (model, MCP, token, dsb.) sengaja tidak dibaca.
 */
export function codexWindowsSandbox(env: NodeJS.ProcessEnv): string | null {
  if (process.platform !== 'win32' && !env.CODEX_HOME) return null;
  const home = env.CODEX_HOME || path.join(env.USERPROFILE || env.HOME || '', '.codex');
  let text: string;
  try {
    text = readFileSync(path.join(home, 'config.toml'), 'utf8');
  } catch {
    return null;
  }
  return parseCodexWindowsSandbox(text);
}

export function parseCodexWindowsSandbox(toml: string): string | null {
  let inWindows = false;
  for (const raw of toml.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('[')) {
      inWindows = /^\[\s*windows\s*\]$/.test(line);
      continue;
    }
    if (!inWindows) continue;
    const m = /^sandbox\s*=\s*["']([A-Za-z_-]+)["']/.exec(line);
    if (m?.[1]) return m[1];
  }
  return null;
}

export function agentPrompt(p: ResolvedPrototype, opts: AgentRunOptions = {}): string {
  const id = p.id;
  const name = p.manifest?.name ?? id;
  const lines = [`Kerjakan komentar pengguna pada prototype "${name}" (id \`${id}\`). Folder kerja ini adalah folder prototype tersebut.`];
  if (opts.commentIds?.length) lines.push(`Fokus hanya pada komentar: ${opts.commentIds.join(', ')}.`);
  if (opts.message?.trim()) lines.push(`Pesan dari pengguna: ${opts.message.trim()}`);
  lines.push(
    '',
    'Langkah:',
    `1. \`prototyper comments ${id} --waiting agent --json\` — komentar yang giliran agent. Perhatikan \`page\`, \`anchor\` (selector CSS / teks elemen yang diklik pengguna), balasan, dan \`answer\` pada pertanyaan berpilihan.`,
    `2. Kerjakan satu per satu dengan mengedit file di folder ini, lalu laporkan lewat \`prototyper comments reply ${id} <commentId> "<ringkasan perubahan>"\` dan biarkan komentar tetap open.`,
    '   Jangan menutup komentar (`prototyper comments resolve`): pengguna yang memeriksa hasil dan menentukan pekerjaan selesai.',
    `3. Bila ada beberapa kemungkinan, jangan menebak: \`prototyper comments ask ${id} <commentId> "<pertanyaan>" --option "A" --option "B"\` dan biarkan open.`,
    `4. Pertanyaan balik atau permintaan revisi dari pengguna dijawab dengan \`prototyper comments reply ${id} <commentId> "<jawaban>"\`.`,
    '5. Akhiri dengan ringkasan singkat dalam Bahasa Indonesia.',
  );
  return lines.join('\n');
}

/** Ubah satu event stream-json Claude Code menjadi baris log yang mudah dibaca. */
export function describeEvent(ev: Record<string, unknown>, cwd: string): string[] {
  const rel = (f: unknown) => (typeof f === 'string' ? path.relative(cwd, f) || f : '');
  const short = (s: string, n = 220) => (s.length > n ? `${s.slice(0, n)}…` : s);
  const type = ev.type;
  if (type === 'system' && ev.subtype === 'init') return [`sesi dimulai${typeof ev.model === 'string' ? ` · model ${ev.model}` : ''}`];
  const content = (ev.message as { content?: unknown } | undefined)?.content;
  if (type === 'assistant' && Array.isArray(content)) {
    const out: string[] = [];
    for (const c of content as Array<Record<string, unknown>>) {
      if (c.type === 'text' && typeof c.text === 'string' && c.text.trim()) out.push(`💬 ${c.text.trim()}`);
      if (c.type === 'tool_use') {
        const input = (c.input ?? {}) as Record<string, unknown>;
        const n = String(c.name);
        if (['Read', 'Edit', 'Write', 'MultiEdit'].includes(n)) out.push(`→ ${n} ${rel(input.file_path)}`);
        else if (n === 'Bash' || n === 'PowerShell') out.push(`→ ${n}: ${short(String(input.command ?? ''))}`);
        else if (n === 'Glob' || n === 'Grep') out.push(`→ ${n} ${String(input.pattern ?? '')}`);
        else out.push(`→ ${n}`);
      }
    }
    return out;
  }
  if (type === 'user' && Array.isArray(content)) {
    return (content as Array<Record<string, unknown>>)
      .filter((c) => c.type === 'tool_result' && c.is_error)
      .map((c) => `✗ ${short(typeof c.content === 'string' ? c.content : JSON.stringify(c.content))}`);
  }
  if (type === 'result') {
    const ok = ev.subtype === 'success' && !ev.is_error;
    const turns = typeof ev.num_turns === 'number' ? `${ev.num_turns} langkah` : '';
    return [ok ? `✓ selesai${turns ? ` (${turns})` : ''}` : `✗ berhenti: ${String(ev.subtype ?? 'error')}`];
  }
  return [];
}

/** Folder berisi skrip `prototyper` (sh + .cmd) agar agent bisa memanggil CLI walau belum di PATH. */
export async function ensureShim(home: string, cli: string[] = cliCommand()): Promise<string> {
  const dir = path.join(home, 'bin');
  const posix = (p: string) => p.replace(/\\/g, '/');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'prototyper.cmd'), `@echo off\r\n${cli.map((e) => `"${e}"`).join(' ')} %*\r\n`, 'utf8');
  await fs.writeFile(path.join(dir, 'prototyper'), `#!/bin/sh\nexec ${cli.map((e) => `"${posix(e)}"`).join(' ')} "$@"\n`, { encoding: 'utf8', mode: 0o755 });
  return dir;
}

/**
 * Node untuk menjalankan skrip JS di balik shim npm (`codex.cmd` → `node codex.js`). Di biner
 * tunggal (SEA) `process.execPath` adalah prototyper sendiri, jadi pakai `node` dari PATH.
 */
export function scriptRunner(env: NodeJS.ProcessEnv = process.env, mode: AppMode = APP_MODE): string | null {
  return mode === 'sea' ? findOnPath('node', env) : process.execPath;
}

function pathDirs(env: NodeJS.ProcessEnv): string[] {
  const pathKey = Object.keys(env).find((k) => k.toLowerCase() === 'path') ?? 'PATH';
  return (env[pathKey] ?? '').split(path.delimiter).filter(Boolean).map((d) => d.replace(/^"|"$/g, ''));
}

/** Cari executable langsung (Windows: .exe/.com; lainnya: file tanpa ekstensi). */
export function findOnPath(name: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const exts = process.platform === 'win32' ? ['.exe', '.com'] : [''];
  for (const d of pathDirs(env)) {
    for (const e of exts) {
      const f = path.join(d, name + e);
      if (existsSync(f)) return f;
    }
  }
  return null;
}

/**
 * Shim npm di Windows (`codex.cmd`) tidak bisa dijalankan tanpa shell, dan meneruskan prompt
 * multi-baris lewat cmd.exe rawan rusak. Baca shim itu dan jalankan skrip JS-nya langsung dengan Node.
 */
export function npmShimTarget(cmdFile: string): string | null {
  let text: string;
  try {
    text = readFileSync(cmdFile, 'utf8');
  } catch {
    return null;
  }
  const m = /"%(?:~)?dp0%\\?([^"]+?\.(?:c|m)?js)"/i.exec(text);
  if (!m?.[1]) return null;
  const target = path.join(path.dirname(cmdFile), ...m[1].split(/[\\/]/)); // shim memakai "\" walau dibaca di OS lain
  return existsSync(target) ? target : null;
}

/** Tentukan perintah untuk sebuah executable di PATH. */
export function resolveCommand(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
  node: string | null = scriptRunner(env),
): (AgentCommand & { path: string }) | null {
  const direct = findOnPath(name, env);
  if (direct) return { bin: direct, prefixArgs: [], path: direct };
  if (process.platform === 'win32' && node) {
    for (const d of pathDirs(env)) {
      const cmd = path.join(d, `${name}.cmd`);
      if (!existsSync(cmd)) continue;
      const js = npmShimTarget(cmd);
      if (js) return { bin: node, prefixArgs: [js], path: cmd };
    }
  }
  return null;
}

/** Ambil nilai Path dari keluaran `reg query … /v Path`. */
export function parseRegPath(output: string): string | null {
  const m = /^\s*Path\s+REG_(?:EXPAND_)?SZ\s+(.*)$/im.exec(output);
  return m?.[1]?.trim() || null;
}

/** Ekspansi %VAR% gaya Windows (REG_EXPAND_SZ). */
export function expandWinVars(value: string, env: NodeJS.ProcessEnv): string {
  return value.replace(/%([^%]+)%/g, (all, name: string) => {
    const key = Object.keys(env).find((k) => k.toLowerCase() === name.toLowerCase());
    return key ? (env[key] ?? all) : all;
  });
}

/**
 * PATH terbaru dari registry (user + mesin). Proses yang sudah berjalan (VS Code, terminalnya, daemon)
 * tidak melihat perubahan PATH setelah ia dimulai — mis. setelah `npm install -g @openai/codex`.
 */
export function registryPathDirs(env: NodeJS.ProcessEnv = process.env): string[] {
  if (process.platform !== 'win32') return [];
  const keys = ['HKCU\\Environment', 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment'];
  const dirs: string[] = [];
  for (const key of keys) {
    try {
      const r = spawnSync('reg', ['query', key, '/v', 'Path'], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
      const v = r.status === 0 ? parseRegPath(r.stdout) : null;
      if (v) dirs.push(...expandWinVars(v, env).split(';').map((d) => d.trim()).filter(Boolean));
    } catch {
      /* abaikan */
    }
  }
  return dirs;
}

/** env dengan PATH = PATH proses + direktori tambahan yang belum ada (urutan PATH proses dipertahankan). */
export function withExtraPath(env: NodeJS.ProcessEnv, extra: string[]): NodeJS.ProcessEnv {
  if (!extra.length) return env;
  const pathKey = Object.keys(env).find((k) => k.toLowerCase() === 'path') ?? 'PATH';
  const current = (env[pathKey] ?? '').split(path.delimiter).filter(Boolean);
  const norm = (d: string) => path.resolve(d.replace(/^"|"$/g, '')).toLowerCase();
  const seen = new Set(current.map(norm));
  const add = extra.filter((d) => {
    const n = norm(d);
    if (seen.has(n)) return false;
    seen.add(n);
    return true;
  });
  return add.length ? { ...env, [pathKey]: [...current, ...add].join(path.delimiter) } : env;
}

export function childEnv(config: Config, shimDir: string, base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base };
  // Jangan wariskan penanda sesi Claude Code lain (bila daemon dinyalakan dari terminal/IDE yang
  // berjalan di dalam Claude Code) maupun hook debugger Node/VS Code: agent bisa keluar tanpa pesan.
  for (const k of Object.keys(env)) {
    if (
      k === 'CLAUDECODE' ||
      k === 'CLAUDE_PID' ||
      /^CLAUDE_CODE_(ENTRYPOINT|SESSION_ID|SESSION_ATTENDED|CHILD_SESSION|MESSAGING_SOCKET|MESSAGING_TOKEN|SSE_PORT|EXECPATH)$/.test(k) ||
      k === 'CLAUDE_AGENT_SDK_VERSION' ||
      k === 'NODE_OPTIONS' ||
      k === 'VSCODE_INSPECTOR_OPTIONS' ||
      k === 'ELECTRON_RUN_AS_NODE'
    ) {
      delete env[k];
    }
  }
  const pathKey = Object.keys(env).find((k) => k.toLowerCase() === 'path') ?? 'PATH';
  env[pathKey] = `${shimDir}${path.delimiter}${env[pathKey] ?? ''}`;
  env.PROTOTYPER_HOME = config.home;
  env.PROTOTYPER_PORT = String(config.port);
  return env;
}

interface ActiveRun {
  info: AgentRunInfo;
  child: ChildProcess;
  exited: Promise<void>;
  timer: NodeJS.Timeout;
  stopping: boolean;
  /** Selesai setelah proses keluar dan checkpoint "sesudah" dibuat. */
  finished: Promise<void>;
}

const VERSION_TIMEOUT_MS = 15_000;

/** Isi balasan komentar saat perubahan sebuah run dibatalkan. */
export function undoReplyText(agentName: string, changes: readonly FileChange[]): string {
  const names = changes.slice(0, 8).map((c) => c.path).join(', ') + (changes.length > 8 ? `, +${changes.length - 8} lainnya` : '');
  return `↶ Perubahan dari ${agentName} untuk komentar ini dibatalkan pengguna: ${changes.length} file dikembalikan ke keadaan sebelum agent bekerja (${names}). Permintaan ini belum diterapkan lagi; balas komentar ini dengan arahan baru bila ingin dicoba ulang.`;
}

export class AgentRunner {
  private readonly runs = new Map<string, ActiveRun>();
  /** Prototype yang sedang disiapkan untuk run (checkpoint dibuat) atau sedang di-undo. */
  private readonly busy = new Set<string>();
  private readonly last = new Map<string, AgentRunInfo>();
  private readonly logStores = new Map<string, Promise<LogStore>>();
  private readonly checks = new Map<AgentId, Promise<AgentInfo>>();
  readonly auth: 'login' | 'apikey';
  readonly timeoutMs: number;
  readonly defaultAgent: AgentId;
  /** null bila PROTOTYPER_AGENT_CHECKPOINT=0. */
  readonly checkpoints: Checkpoints | null;
  /** env untuk mencari/menjalankan agent: env proses + PATH terbaru dari registry (Windows). */
  private lookupEnv: NodeJS.ProcessEnv;

  constructor(
    private readonly config: Config,
    /** Untuk tes: ganti perintah per agent. */
    private readonly overrides: Partial<Record<AgentId, AgentCommand>> = {},
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {
    this.auth = env.PROTOTYPER_AGENT_AUTH === 'apikey' ? 'apikey' : 'login';
    const min = Number(env.PROTOTYPER_AGENT_TIMEOUT_MIN);
    this.timeoutMs = (Number.isFinite(min) && min > 0 ? min : 20) * 60_000;
    this.defaultAgent = isAgentId(env.PROTOTYPER_AGENT_DEFAULT) ? env.PROTOTYPER_AGENT_DEFAULT : 'claude';
    this.lookupEnv = env;
    this.checkpoints = env.PROTOTYPER_AGENT_CHECKPOINT === '0' ? null : new Checkpoints(config.home);
    this.refreshPath();
  }

  /** Baca ulang PATH dari registry (dipanggil saat cek ulang agent). Tidak dipakai bila PATH sengaja dioverride (tes). */
  private refreshPath(): void {
    this.lookupEnv = this.env === process.env ? withExtraPath(this.env, registryPathDirs(this.env)) : this.env;
  }

  /** Perintah untuk agent: override tes → env PROTOTYPER_AGENT_BIN_<ID> → pencarian PATH. */
  private command(id: AgentId): (AgentCommand & { path: string }) | null {
    const o = this.overrides[id];
    if (o) return { ...o, path: o.prefixArgs[0] ?? o.bin };
    const custom = this.env[`PROTOTYPER_AGENT_BIN_${id.toUpperCase()}`] || (id === 'claude' ? this.env.PROTOTYPER_AGENT_BIN : undefined);
    if (custom) return { bin: custom, prefixArgs: [], path: custom };
    return resolveCommand(PRESETS[id].exe, this.lookupEnv);
  }

  /** Cek satu agent dengan `--version` (di-cache sampai force). */
  check(id: AgentId = this.defaultAgent, force = false): Promise<AgentInfo> {
    const cached = this.checks.get(id);
    if (cached && !force) return cached;
    const preset = PRESETS[id];
    const base = { id, name: preset.name, support: preset.support, install: preset.install, permissions: preset.permissions };
    const cmd = this.command(id);
    const p = new Promise<AgentInfo>((resolve) => {
      if (!cmd) {
        resolve({ ...base, available: false, version: null, path: null, error: `\`${preset.exe}\` tidak ditemukan di PATH.` });
        return;
      }
      let out = '';
      let err = '';
      let settled = false;
      const done = (available: boolean, error: string | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const version = available ? out.trim().split(/\r?\n/)[0] || null : null;
        resolve({ ...base, available, version, path: cmd.path, error });
      };
      let child: ChildProcess;
      try {
        child = spawn(cmd.bin, [...cmd.prefixArgs, '--version'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: childEnv(this.config, '', this.lookupEnv) });
      } catch (e) {
        done(false, errorMessage(e));
        return;
      }
      const timer = setTimeout(() => {
        child.kill();
        done(false, `\`${preset.exe} --version\` tidak merespons`);
      }, VERSION_TIMEOUT_MS);
      child.stdout?.on('data', (d: Buffer) => (out += d.toString()));
      child.stderr?.on('data', (d: Buffer) => (err += d.toString()));
      child.once('error', (e) => done(false, (e as NodeJS.ErrnoException).code === 'ENOENT' ? `\`${preset.exe}\` tidak ditemukan.` : e.message));
      child.once('close', (code) => {
        const msg = (err || out).trim().split(/\r?\n/)[0] ?? '';
        done(code === 0, code === 0 ? null : `\`${preset.exe} --version\` gagal (exit ${code})${msg ? `: ${msg.slice(0, 200)}` : ''}`);
      });
    });
    this.checks.set(id, p);
    return p;
  }

  /** Cek semua agent yang dikenal. */
  checkAll(force = false): Promise<AgentInfo[]> {
    if (force) this.refreshPath();
    return Promise.all(AGENT_IDS.map((id) => this.check(id, force)));
  }

  logs(id: string): Promise<LogStore> {
    let p = this.logStores.get(id);
    if (!p) {
      p = LogStore.open(path.join(this.config.home, 'logs', `${id}.agent.log`));
      this.logStores.set(id, p);
    }
    return p;
  }

  info(id: string): AgentRunInfo | null {
    return this.runs.get(id)?.info ?? this.last.get(id) ?? null;
  }

  isRunning(id: string): boolean {
    return this.runs.has(id);
  }

  async run(p: ResolvedPrototype, opts: AgentRunOptions = {}): Promise<AgentRunInfo> {
    if (!p.manifest) throw new AppError('INVALID_MANIFEST', `Prototype "${p.id}" tidak valid: ${p.error ?? ''}`);
    if (this.runs.has(p.id) || this.busy.has(p.id)) throw new AppError('CONFLICT', `Agent sedang bekerja pada "${p.id}". Tunggu selesai atau hentikan dulu.`);
    this.busy.add(p.id);
    try {
      return await this.startRun(p, opts);
    } finally {
      this.busy.delete(p.id);
    }
  }

  private async startRun(p: ResolvedPrototype, opts: AgentRunOptions): Promise<AgentRunInfo> {
    const agentId = opts.agent ?? this.defaultAgent;
    const preset = PRESETS[agentId];
    const avail = await this.check(agentId);
    if (!avail.available) throw new AppError('BAD_REQUEST', `${preset.name} tidak tersedia: ${avail.error ?? ''} ${preset.install}`.trim());
    const cmd = this.command(agentId);
    if (!cmd) throw new AppError('BAD_REQUEST', `${preset.name} tidak ditemukan`);
    if (!existsSync(p.path)) throw new AppError('BAD_REQUEST', `Folder tidak ditemukan: ${p.path}`);

    const logs = await this.logs(p.id);
    const shim = await ensureShim(this.config.home);
    const args = preset.args(agentPrompt(p, opts), { apikey: this.auth === 'apikey', env: this.env });
    const info: AgentRunInfo = {
      agent: agentId, status: 'running', startedAt: new Date().toISOString(), endedAt: null, exitCode: null,
      commentIds: opts.commentIds ?? [], summary: null, costUsd: null, turns: null, error: null,
      checkpoint: null, checkpointError: null,
    };
    const authNote = agentId === 'claude' ? ` (${this.auth === 'apikey' ? 'API key, --bare' : 'login Claude Code'})` : preset.support === 'experimental' ? ' (eksperimental)' : '';
    logs.system(`agent: ${preset.name}${authNote}${info.commentIds.length ? ` · komentar ${info.commentIds.join(', ')}` : ''} · ${cmd.path}`);

    if (this.checkpoints) {
      try {
        const label = info.commentIds.length ? ` · ${info.commentIds.join(', ')}` : '';
        const before = await this.checkpoints.snapshot(p.id, p.path, `sebelum ${agentId}${label} · ${info.startedAt}`);
        info.checkpoint = { before, after: null, changes: [], undoneAt: null };
        logs.system(`checkpoint ${before.slice(0, 8)}: perubahan agent bisa dibatalkan setelah selesai`);
      } catch (err) {
        info.checkpointError = errorMessage(err);
        logs.system(`checkpoint dilewati: ${info.checkpointError}`);
      }
    }

    const child = spawn(cmd.bin, [...cmd.prefixArgs, ...args], {
      cwd: p.path,
      env: childEnv(this.config, shim, this.lookupEnv),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      detached: process.platform !== 'win32', // agar killTree bisa membunuh satu grup proses
    });
    const exited = new Promise<void>((resolve) => child.once('close', () => resolve()));
    let finish!: () => void;
    const run: ActiveRun = {
      info, child, exited, stopping: false, finished: new Promise<void>((r) => (finish = r)),
      timer: setTimeout(() => {
        logs.system(`agent melewati batas waktu ${Math.round(this.timeoutMs / 60_000)} menit — dihentikan`);
        info.error = 'Melewati batas waktu';
        void this.stop(p.id);
      }, this.timeoutMs),
    };
    this.runs.set(p.id, run);

    let buf = '';
    let gotOutput = false;
    const tail: string[] = []; // baris terakhir output teks (ringkasan untuk agent non-Claude)
    const errTail: string[] = []; // baris terakhir stderr (pesan error agent teks)
    child.stderr?.on('data', (d: Buffer) => {
      gotOutput = true;
      const text = d.toString('utf8');
      logs.write('stderr', text);
      for (const l of text.split(/\r?\n/)) if (l.trim()) { errTail.push(l.trim()); if (errTail.length > 20) errTail.shift(); }
    });
    child.stdout?.on('data', (d: Buffer) => {
      gotOutput = true;
      buf += d.toString('utf8');
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? '';
      for (const line of lines) this.onLine(preset, line, p.path, info, logs, tail);
    });
    child.once('error', (err) => {
      info.error = err.message;
      logs.system(`agent gagal dijalankan: ${err.message}`);
    });
    void exited.then(async () => {
      if (buf.trim()) this.onLine(preset, buf, p.path, info, logs, tail);
      logs.flush();
      clearTimeout(run.timer);
      info.exitCode = child.exitCode;
      info.endedAt = new Date().toISOString();
      if (preset.output === 'text' && !info.summary && tail.length) info.summary = tail.join('\n').slice(-800);
      info.status = run.stopping ? 'stopped' : child.exitCode === 0 && !info.error ? 'done' : 'failed';
      if (info.status === 'failed' && !info.error && errTail.length) {
        info.error = ([...errTail].reverse().find((l) => /error/i.test(l)) ?? errTail[errTail.length - 1] ?? '').slice(0, 400) || null;
      }
      if (info.status === 'failed' && !gotOutput) {
        info.error ??= `${preset.exe} keluar (exit ${child.exitCode ?? '-'}) tanpa pesan`;
        logs.system(`${preset.name} keluar tanpa output apa pun. Coba jalankan \`${preset.exe}\` di terminal untuk melihat pesannya, atau set PROTOTYPER_AGENT_BIN_${agentId.toUpperCase()} ke path yang benar.`);
      }
      logs.system(`agent ${info.status === 'done' ? 'selesai' : info.status === 'stopped' ? 'dihentikan' : `gagal (exit ${child.exitCode ?? '-'})`}`);
      await this.checkpointAfter(p, info, logs);
      this.runs.delete(p.id);
      this.last.set(p.id, info);
      finish();
    });
    return info;
  }

  private onLine(preset: Preset, line: string, cwd: string, info: AgentRunInfo, logs: LogStore, tail: string[]): void {
    if (!line.trim()) return;
    if (preset.output === 'text') {
      logs.write('stdout', `${line}\n`);
      tail.push(line.trim());
      if (tail.length > 12) tail.shift();
      return;
    }
    let ev: Record<string, unknown>;
    try {
      ev = JSON.parse(line) as Record<string, unknown>;
    } catch {
      logs.write('stdout', `${line}\n`);
      return;
    }
    if (ev.type === 'result') {
      if (typeof ev.result === 'string') info.summary = ev.result;
      if (typeof ev.total_cost_usd === 'number') info.costUsd = ev.total_cost_usd;
      if (typeof ev.num_turns === 'number') info.turns = ev.num_turns;
      if (ev.is_error || ev.subtype !== 'success') info.error = typeof ev.result === 'string' && ev.result ? ev.result : String(ev.subtype ?? 'error');
    }
    for (const l of describeEvent(ev, cwd)) logs.write('stdout', `${l}\n`);
  }

  async stop(id: string): Promise<AgentRunInfo | null> {
    const run = this.runs.get(id);
    if (!run) return this.last.get(id) ?? null;
    run.stopping = true;
    await killTree(run.child, run.exited);
    await run.finished;
    return this.last.get(id) ?? run.info;
  }

  private async checkpointAfter(p: ResolvedPrototype, info: AgentRunInfo, logs: LogStore): Promise<void> {
    const cp = info.checkpoint;
    if (!cp || !this.checkpoints) return;
    try {
      cp.after = await this.checkpoints.snapshot(p.id, p.path, `sesudah ${info.agent} (${info.status}) · ${new Date().toISOString()}`);
      cp.changes = await this.checkpoints.diff(p.id, p.path, cp.before, cp.after);
      const n = cp.changes.length;
      logs.system(n ? `${n} file diubah agent: ${cp.changes.slice(0, 5).map((c) => c.path).join(', ')}${n > 5 ? `, +${n - 5}` : ''}` : 'agent tidak mengubah file');
    } catch (err) {
      info.checkpointError = errorMessage(err);
      logs.system(`checkpoint sesudah run gagal: ${info.checkpointError}`);
    }
  }

  /**
   * Batalkan perubahan file dari run terakhir: file yang diubah agent dikembalikan ke keadaan
   * sebelum run, file baru dihapus. Komentar & balasan (.prototyper/) tidak ikut dibatalkan.
   */
  async undo(p: ResolvedPrototype, opts: { force?: boolean } = {}): Promise<{ run: AgentRunInfo; comments: string[] } & UndoResult> {
    if (this.runs.has(p.id) || this.busy.has(p.id)) throw new AppError('CONFLICT', `Agent sedang bekerja pada "${p.id}". Tunggu selesai atau hentikan dulu.`);
    const info = this.last.get(p.id);
    const cp = info?.checkpoint;
    if (!info || !cp?.after || !this.checkpoints) throw new AppError('BAD_REQUEST', 'Tidak ada checkpoint run agent untuk dibatalkan');
    if (cp.undoneAt) throw new AppError('BAD_REQUEST', 'Perubahan run agent terakhir sudah dibatalkan');
    if (!cp.changes.length) throw new AppError('BAD_REQUEST', 'Run agent terakhir tidak mengubah file');
    this.busy.add(p.id);
    let res: UndoResult;
    try {
      res = await this.checkpoints.undo(p.id, p.path, cp.before, cp.after, opts.force === true);
    } finally {
      this.busy.delete(p.id);
    }
    cp.undoneAt = new Date().toISOString();
    const logs = await this.logs(p.id);
    logs.system(`perubahan agent dibatalkan: ${res.restored.length} file dikembalikan, ${res.removed.length} file baru dihapus`);
    // Beri tahu di komentar yang dikerjakan run ini bahwa perubahannya sudah tidak ada.
    let comments: string[] = [];
    try {
      comments = await noteUndo(
        p.path,
        { since: info.startedAt, until: info.endedAt ?? cp.undoneAt, ids: info.commentIds },
        undoReplyText(PRESETS[info.agent].name, cp.changes),
      );
      if (comments.length) logs.system(`balasan pembatalan ditambahkan ke komentar ${comments.join(', ')}`);
    } catch (err) {
      logs.system(`gagal menambahkan balasan pembatalan ke komentar: ${errorMessage(err)}`);
    }
    return { run: info, comments, ...res };
  }

  /**
   * Prototype dihapus dari daftar: lupakan run terakhir dan hapus repo checkpoint-nya.
   * Run yang masih berjalan dihentikan dulu.
   */
  async forget(id: string): Promise<void> {
    if (this.runs.has(id)) await this.stop(id);
    this.last.delete(id);
    await removeCheckpoints(this.config.home, id);
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.runs.keys()].map((id) => this.stop(id)));
    for (const p of this.logStores.values()) (await p).close();
  }
}
