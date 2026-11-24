import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { APP_MODE, cliCommand, type AppMode } from './appfiles.js';
import { DEFAULT_RESUME_HOURS, resumeState, SessionStore, type ResumeState } from './agentsession.js';
import { Checkpoints, removeCheckpoints, type FileChange, type UndoResult } from './checkpoint.js';
import { attachmentsOf, listComments, noteUndo } from './comments.js';
import type { Config } from './config.js';
import { prompt as pr, t } from './agentmessages.js';
import { AppError, errorMessage } from './errors.js';
import { getLocale, getProcessLocale, withLocale, type Locale } from './i18n.js';
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
  /** id sesi agent (hanya agent yang mendukung lanjut sesi, saat ini Claude Code). */
  sessionId: string | null;
  /** true bila run ini melanjutkan sesi run sebelumnya. */
  resumed: boolean;
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
  /** Gambar lampiran pesan: path relatif terhadap folder prototype (sudah divalidasi). */
  attachments?: string[];
  /** Lanjutkan sesi run sebelumnya bila bisa (default true). false = selalu sesi baru. */
  resume?: boolean;
  /** Internal: prompt untuk sesi lanjutan. */
  resumed?: boolean;
  /**
   * Internal: bahasa peminta yang memicu run (default `getLocale()` saat run dimulai). Dipakai untuk
   * prompt (agent diminta membalas dalam bahasa ini) dan log run, termasuk retry setelah proses keluar.
   */
  locale?: Locale;
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
  /** Kunci pesan (agentmessages.ts) untuk cara install dan batas izin; diterjemahkan saat ditampilkan. */
  install: 'installClaude' | 'installCodex' | 'installGemini' | 'installCopilot';
  permissions: 'permClaude' | 'permCodex' | 'permGemini' | 'permCopilot';
  output: 'claude-stream' | 'text';
  args(prompt: string, opts: { apikey: boolean; env: NodeJS.ProcessEnv; supports(flag: string): boolean; images?: readonly string[]; locale?: Locale }): string[];
  /** true bila gambar lampiran perlu diberikan lewat argumen (agent tidak bisa membuka gambar dengan tool baca file). */
  imageArgs?: boolean;
  /** Flag yang belum ada di versi lama agent: dicek lewat `--help` dan hanya dipakai bila didukung. */
  optionalFlags?: string[];
  /** Argumen sesi: `fresh` = sesi baru dengan id dari Prototyper, `resume` = lanjutkan sesi itu. */
  session?: { fresh(id: string): string[]; resume(id: string): string[] };
}

const CLAUDE_TOOLS = ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash(prototyper *)', 'PowerShell(prototyper *)'];

const BASE_RULES = ['rule1', 'rule2', 'rule3', 'rule4', 'rule5', 'rule6', 'ruleLanguage'] as const;

/**
 * Aturan per agent. Agent dengan tool baca/edit khusus (Claude, Gemini, Copilot) cukup diberi shell
 * `prototyper`. Codex membaca file lewat shell dan mengedit dengan apply_patch, jadi shell harus
 * boleh dipakai untuk membaca/mencari; batas tulisnya dijaga sandbox workspace-write.
 */
export function agentRules(id: AgentId, locale: Locale = getLocale()): string {
  const extra = id === 'codex' ? ('ruleCodex' as const) : ('ruleTools' as const);
  return [...BASE_RULES, extra].map((k) => pr.in(locale, k)).join(' ');
}

export const PRESETS: Record<AgentId, Preset> = {
  claude: {
    id: 'claude',
    name: 'Claude Code',
    exe: 'claude',
    support: 'tested',
    install: 'installClaude',
    permissions: 'permClaude',
    output: 'claude-stream',
    // --permission-prompts baru ada di Claude Code versi baru; versi lama menolaknya ("unknown option").
    // Tanpa flag itu dontAsk tetap menolak izin yang tidak diizinkan.
    optionalFlags: ['--permission-prompts'],
    args: (prompt, { apikey, supports, locale }) => [
      '-p', prompt,
      '--output-format', 'stream-json', '--verbose',
      '--permission-mode', 'dontAsk',
      ...(supports('--permission-prompts') ? ['--permission-prompts', 'none'] : []),
      '--allowedTools', CLAUDE_TOOLS.join(','),
      '--append-system-prompt', agentRules('claude', locale),
      ...(apikey ? ['--bare'] : []),
    ],
    session: { fresh: (id) => ['--session-id', id], resume: (id) => ['--resume', id] },
  },
  codex: {
    id: 'codex',
    name: 'OpenAI Codex',
    exe: 'codex',
    support: 'tested',
    install: 'installCodex',
    permissions: 'permCodex',
    output: 'text',
    // --ignore-user-config: model/MCP dari config.toml (mis. milik aplikasi Codex desktop) bisa tidak
    // didukung CLI dengan login ChatGPT; login tetap dipakai. Model bisa dipilih lewat PROTOTYPER_AGENT_CODEX_MODEL.
    // Codex membaca file lewat shell sehingga tidak bisa melihat gambar: lampiran diberikan lewat --image.
    // `--` sebelum prompt agar prompt tidak ikut terbaca sebagai nilai --image.
    imageArgs: true,
    args: (prompt, { env, images = [], locale }) => [
      'exec', '--ignore-user-config', '--sandbox', 'workspace-write', '--skip-git-repo-check',
      ...((sb) => (sb ? ['-c', `windows.sandbox="${sb}"`] : []))(codexWindowsSandbox(env)),
      ...(env.PROTOTYPER_AGENT_CODEX_MODEL ? ['-m', env.PROTOTYPER_AGENT_CODEX_MODEL] : []),
      ...images.flatMap((f) => ['--image', f]),
      ...(images.length ? ['--'] : []),
      `${prompt}\n\n${agentRules('codex', locale)}`,
    ],
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini CLI',
    exe: 'gemini',
    support: 'experimental',
    install: 'installGemini',
    permissions: 'permGemini',
    output: 'text',
    args: (prompt, { locale }) => ['-p', `${prompt}\n\n${agentRules('gemini', locale)}`, '--approval-mode', 'auto_edit', '--allowed-tools', 'run_shell_command(prototyper)'],
  },
  copilot: {
    id: 'copilot',
    name: 'GitHub Copilot CLI',
    exe: 'copilot',
    support: 'experimental',
    install: 'installCopilot',
    permissions: 'permCopilot',
    output: 'text',
    args: (prompt, { locale }) => ['-p', `${prompt}\n\n${agentRules('copilot', locale)}`, '--allow-tool', 'write', '--allow-tool', 'shell(prototyper)'],
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

const MAX_RUN_IMAGES = 10;

/** Gambar untuk agent ber-`imageArgs`: lampiran pesan + lampiran komentar yang akan dikerjakan (yang ada saja). */
export async function runImages(dir: string, opts: Pick<AgentRunOptions, 'attachments' | 'commentIds'>): Promise<string[]> {
  let fromComments: string[] = [];
  try {
    const waiting = await listComments(dir, { status: 'open', waitingFor: 'agent' });
    const ids = opts.commentIds?.length ? new Set(opts.commentIds) : null;
    fromComments = attachmentsOf(waiting.filter((c) => !ids || ids.has(c.id)));
  } catch {
    /* comments.json rusak: lewati */
  }
  const out: string[] = [];
  for (const rel of new Set([...(opts.attachments ?? []), ...fromComments])) {
    if (out.length >= MAX_RUN_IMAGES) break;
    if (existsSync(path.join(dir, rel))) out.push(rel);
  }
  return out;
}

/** Prompt untuk agent, dalam bahasa peminta (`opts.locale`, default bahasa aktif). */
export function agentPrompt(p: ResolvedPrototype, opts: AgentRunOptions = {}): string {
  const l = opts.locale ?? getLocale();
  const id = p.id;
  const name = p.manifest?.name ?? id;
  const lines = [pr.in(l, 'intro', { name, id })];
  if (opts.resumed) lines.push(pr.in(l, 'resumed'));
  if (opts.commentIds?.length) lines.push(pr.in(l, 'focus', { ids: opts.commentIds.join(', ') }));
  if (opts.message?.trim()) lines.push(pr.in(l, 'message', { message: opts.message.trim() }));
  if (opts.attachments?.length) {
    lines.push(pr.in(l, 'attachments', { files: opts.attachments.map((a) => `\`${a}\``).join(', ') }));
  }
  lines.push(
    '',
    pr.in(l, 'steps'),
    pr.in(l, 'step1', { id }),
    pr.in(l, 'step1Attachments'),
    pr.in(l, 'step1Context', { id }),
    pr.in(l, 'step2', { id }),
    pr.in(l, 'step2NoResolve'),
    pr.in(l, 'step3', { id }),
    pr.in(l, 'step4', { id }),
    pr.in(l, 'step5'),
  );
  return lines.join('\n');
}

/** Ubah satu event stream-json Claude Code menjadi baris log yang mudah dibaca. */
export function describeEvent(ev: Record<string, unknown>, cwd: string, locale: Locale = getLocale()): string[] {
  const rel = (f: unknown) => (typeof f === 'string' ? path.relative(cwd, f) || f : '');
  const short = (s: string, n = 220) => (s.length > n ? `${s.slice(0, n)}…` : s);
  const type = ev.type;
  if (type === 'system' && ev.subtype === 'init') {
    return [t.in(locale, 'sessionStarted', { model: typeof ev.model === 'string' ? t.in(locale, 'model', { model: ev.model }) : '' })];
  }
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
    const turns = typeof ev.num_turns === 'number' ? t.in(locale, 'resultTurns', { n: ev.num_turns }) : '';
    return [ok ? t.in(locale, 'resultDone', { turns }) : t.in(locale, 'resultStopped', { reason: String(ev.subtype ?? 'error') })];
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

/** Apakah teks `--help` menyebut flag ini (mis. "  --permission-prompts <target>")? */
export function helpHasFlag(help: string, flag: string): boolean {
  return new RegExp(`(^|[\\s,])${flag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[\\s=,<\\[]|$)`, 'm').test(help);
}

/** Isi balasan komentar saat perubahan sebuah run dibatalkan (disimpan di comments.json: bahasa pengaturan). */
export function undoReplyText(agentName: string, changes: readonly FileChange[], locale: Locale = getProcessLocale()): string {
  const names = changes.slice(0, 8).map((c) => c.path).join(', ') + (changes.length > 8 ? t.in(locale, 'undoMore', { n: changes.length - 8 }) : '');
  return t.in(locale, 'undoReply', { agent: agentName, n: changes.length, names });
}

/** Hasil cek agent sebelum diterjemahkan (di-cache; teks dibuat saat ditampilkan, dalam bahasa peminta). */
interface AgentProbe {
  available: boolean;
  version: string | null;
  path: string | null;
  error: ((l: Locale) => string) | null;
}

export class AgentRunner {
  private readonly runs = new Map<string, ActiveRun>();
  /** Prototype yang sedang disiapkan untuk run (checkpoint dibuat) atau sedang di-undo. */
  private readonly busy = new Set<string>();
  private readonly last = new Map<string, AgentRunInfo>();
  /** Run yang agent-nya benar-benar mulai (event sesi pertama sudah diterima). */
  private readonly started = new WeakSet<AgentRunInfo>();
  private readonly logStores = new Map<string, Promise<LogStore>>();
  private readonly checks = new Map<AgentId, Promise<AgentProbe>>();
  private readonly helpChecks = new Map<AgentId, Promise<{ unsupported: Set<string> }>>();
  readonly auth: 'login' | 'apikey';
  readonly timeoutMs: number;
  readonly defaultAgent: AgentId;
  /** null bila PROTOTYPER_AGENT_CHECKPOINT=0. */
  readonly checkpoints: Checkpoints | null;
  /** Sesi terakhir per prototype (lanjut sesi). */
  readonly sessions: SessionStore;
  /** Sesi yang lebih tua dari ini tidak dilanjutkan. 0 = lanjut sesi dimatikan. */
  readonly resumeHours: number;
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
    this.sessions = new SessionStore(config.home);
    const hours = Number(env.PROTOTYPER_AGENT_RESUME_HOURS);
    this.resumeHours = env.PROTOTYPER_AGENT_RESUME_HOURS !== undefined && Number.isFinite(hours) && hours >= 0 ? hours : DEFAULT_RESUME_HOURS;
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

  /** Cek satu agent dengan `--version` (di-cache sampai force). Teks dalam bahasa peminta. */
  check(id: AgentId = this.defaultAgent, force = false): Promise<AgentInfo> {
    const locale = getLocale();
    const preset = PRESETS[id];
    return this.probe(id, force).then((r) => ({
      id, name: preset.name, support: preset.support,
      install: t.in(locale, preset.install), permissions: t.in(locale, preset.permissions),
      available: r.available, version: r.version, path: r.path, error: r.error ? r.error(locale) : null,
    }));
  }

  private probe(id: AgentId, force: boolean): Promise<AgentProbe> {
    const cached = this.checks.get(id);
    if (cached && !force) return cached;
    this.helpChecks.delete(id); // agent bisa sudah diperbarui
    const preset = PRESETS[id];
    const exe = preset.exe;
    const cmd = this.command(id);
    const p = new Promise<AgentProbe>((resolve) => {
      if (!cmd) {
        resolve({ available: false, version: null, path: null, error: (l) => t.in(l, 'notOnPath', { exe }) });
        return;
      }
      let out = '';
      let err = '';
      let settled = false;
      const done = (available: boolean, error: AgentProbe['error']) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const version = available ? out.trim().split(/\r?\n/)[0] || null : null;
        resolve({ available, version, path: cmd.path, error });
      };
      let child: ChildProcess;
      try {
        child = spawn(cmd.bin, [...cmd.prefixArgs, '--version'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: childEnv(this.config, '', this.lookupEnv) });
      } catch (e) {
        const msg = errorMessage(e);
        done(false, () => msg);
        return;
      }
      const timer = setTimeout(() => {
        child.kill();
        done(false, (l) => t.in(l, 'versionTimeout', { exe }));
      }, VERSION_TIMEOUT_MS);
      child.stdout?.on('data', (d: Buffer) => (out += d.toString()));
      child.stderr?.on('data', (d: Buffer) => (err += d.toString()));
      child.once('error', (e) => done(false, (e as NodeJS.ErrnoException).code === 'ENOENT' ? (l) => t.in(l, 'notFoundExe', { exe }) : () => e.message));
      child.once('close', (code) => {
        const msg = (err || out).trim().split(/\r?\n/)[0] ?? '';
        done(code === 0, code === 0 ? null : (l) => t.in(l, 'versionFailed', { exe, code, msg: msg ? `: ${msg.slice(0, 200)}` : '' }));
      });
    });
    this.checks.set(id, p);
    return p;
  }

  /**
   * Flag opsional (Preset.optionalFlags) yang tidak ada di `--help` agent ini. Di-cache bersama `check`.
   * Bila `--help` gagal, semua flag dianggap didukung (perilaku lama).
   */
  private optionalFlags(id: AgentId, cmd: AgentCommand): Promise<{ unsupported: Set<string> }> {
    const wanted = PRESETS[id].optionalFlags ?? [];
    if (!wanted.length) return Promise.resolve({ unsupported: new Set() });
    const cached = this.helpChecks.get(id);
    if (cached) return cached;
    const p = new Promise<{ unsupported: Set<string> }>((resolve) => {
      let out = '';
      let settled = false;
      const done = (ok: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ unsupported: new Set(ok ? wanted.filter((f) => !helpHasFlag(out, f)) : []) });
      };
      let child: ChildProcess;
      try {
        child = spawn(cmd.bin, [...cmd.prefixArgs, '--help'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: childEnv(this.config, '', this.lookupEnv) });
      } catch {
        done(false);
        return;
      }
      const timer = setTimeout(() => {
        child.kill();
        done(false);
      }, VERSION_TIMEOUT_MS);
      child.stdout?.on('data', (d: Buffer) => (out += d.toString()));
      child.once('error', () => done(false));
      child.once('close', (code) => done(code === 0 && out.includes('--')));
    });
    this.helpChecks.set(id, p);
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

  /** Termasuk run yang sedang disiapkan (busy), mis. selama retry sesi baru: jangan tampil "selesai" di antaranya. */
  isRunning(id: string): boolean {
    return this.runs.has(id) || this.busy.has(id);
  }

  /** Bisakah run berikutnya dengan `agent` melanjutkan sesi sebelumnya? */
  async resumeInfo(p: ResolvedPrototype, agent: AgentId = this.defaultAgent): Promise<ResumeState> {
    return resumeState(await this.sessions.get(p.id), {
      agent, cwd: p.path, supported: !!PRESETS[agent].session, hours: this.resumeHours,
    });
  }

  async run(p: ResolvedPrototype, opts: AgentRunOptions = {}): Promise<AgentRunInfo> {
    if (!p.manifest) throw new AppError('INVALID_MANIFEST', t('invalidManifest', { id: p.id, error: p.error ?? '' }));
    if (this.runs.has(p.id) || this.busy.has(p.id)) throw new AppError('CONFLICT', t('busy', { id: p.id }));
    this.busy.add(p.id);
    try {
      // Bahasa peminta disimpan sekarang: prompt & log run (juga retry setelah proses keluar) memakainya.
      return await this.startRun(p, { ...opts, locale: opts.locale ?? getLocale() });
    } finally {
      this.busy.delete(p.id);
    }
  }

  private async startRun(p: ResolvedPrototype, opts: AgentRunOptions): Promise<AgentRunInfo> {
    const agentId = opts.agent ?? this.defaultAgent;
    const preset = PRESETS[agentId];
    const L = opts.locale ?? getLocale();
    const avail = await withLocale(L, () => this.check(agentId));
    if (!avail.available) throw new AppError('BAD_REQUEST', t.in(L, 'unavailable', { agent: preset.name, error: avail.error ?? '', install: avail.install }).replace(/ {2,}/g, ' ').trim());
    const cmd = this.command(agentId);
    if (!cmd) throw new AppError('BAD_REQUEST', t.in(L, 'notFoundAgent', { agent: preset.name }));
    if (!existsSync(p.path)) throw new AppError('BAD_REQUEST', t.in(L, 'folderNotFound', { path: p.path }));

    const logs = await this.logs(p.id);
    const shim = await ensureShim(this.config.home);
    const flags = await this.optionalFlags(agentId, cmd);
    if (flags.unsupported.size) logs.system(t.in(L, 'logFlagsUnsupported', { agent: preset.name, version: avail.version ?? '', flags: [...flags.unsupported].join(', ') }).replace(/ {2,}/g, ' '));
    // Lanjut sesi: pakai id sesi sebelumnya bila masih berlaku; selain itu sesi baru ber-id dari Prototyper.
    const prev = preset.session && opts.resume !== false ? await withLocale(L, () => this.resumeInfo(p, agentId)) : null;
    const resumed = !!prev?.resumable;
    const sessionId = preset.session ? (resumed && prev?.session ? prev.session.sessionId : randomUUID()) : null;
    const images = preset.imageArgs ? await runImages(p.path, opts) : [];
    const args = [
      ...preset.args(agentPrompt(p, { ...opts, resumed, locale: L }), { apikey: this.auth === 'apikey', env: this.env, supports: (f) => !flags.unsupported.has(f), images, locale: L }),
      ...(preset.session && sessionId ? (resumed ? preset.session.resume(sessionId) : preset.session.fresh(sessionId)) : []),
    ];
    const info: AgentRunInfo = {
      agent: agentId, status: 'running', startedAt: new Date().toISOString(), endedAt: null, exitCode: null,
      commentIds: opts.commentIds ?? [], summary: null, costUsd: null, turns: null, error: null,
      checkpoint: null, checkpointError: null, sessionId, resumed,
    };
    const authNote = agentId === 'claude' ? ` (${t.in(L, this.auth === 'apikey' ? 'logAuthApikey' : 'logAuthLogin')})` : preset.support === 'experimental' ? ` (${t.in(L, 'logExperimental')})` : '';
    const commentsNote = info.commentIds.length ? t.in(L, 'logComments', { ids: info.commentIds.join(', ') }) : '';
    logs.system(t.in(L, 'logAgent', { agent: preset.name, auth: authNote, comments: commentsNote, path: cmd.path }));
    if (resumed && prev?.session) logs.system(t.in(L, 'logResuming', { session: prev.session.sessionId.slice(0, 8), run: prev.session.runs + 1, last: prev.session.endedAt }));
    else if (prev?.reason) logs.system(t.in(L, 'logNewSession', { reason: prev.reason }));

    if (this.checkpoints) {
      try {
        const label = info.commentIds.length ? ` · ${info.commentIds.join(', ')}` : '';
        const before = await this.checkpoints.snapshot(p.id, p.path, `sebelum ${agentId}${label} · ${info.startedAt}`);
        info.checkpoint = { before, after: null, changes: [], undoneAt: null };
        logs.system(t.in(L, 'logCheckpoint', { id: before.slice(0, 8) }));
      } catch (err) {
        info.checkpointError = errorMessage(err);
        logs.system(t.in(L, 'logCheckpointSkipped', { error: info.checkpointError }));
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
        logs.system(t.in(L, 'logTimeout', { min: Math.round(this.timeoutMs / 60_000) }));
        info.error = t.in(L, 'errTimeout');
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
      for (const line of lines) this.onLine(preset, line, p.path, info, logs, tail, L);
    });
    child.once('error', (err) => {
      info.error = err.message;
      logs.system(t.in(L, 'logSpawnFailed', { error: err.message }));
    });
    void exited.then(async () => {
      if (buf.trim()) this.onLine(preset, buf, p.path, info, logs, tail, L);
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
        info.error ??= t.in(L, 'errNoMessage', { exe: preset.exe, code: child.exitCode ?? '-' });
        logs.system(t.in(L, 'logNoOutput', { agent: preset.name, exe: preset.exe, env: agentId.toUpperCase() }));
      }
      logs.system(info.status === 'done' ? t.in(L, 'logDone') : info.status === 'stopped' ? t.in(L, 'logStopped') : t.in(L, 'logFailed', { code: child.exitCode ?? '-' }));
      // Resume gagal sebelum agent sempat bekerja (mis. sesi sudah dihapus): ulangi sekali dengan sesi baru.
      if (resumed && info.status === 'failed' && !this.started.has(info)) {
        logs.system(t.in(L, 'logRetry'));
        this.busy.add(p.id); // sebelum runs.delete: tanpa jeda "tidak berjalan" sampai retry terdaftar
        this.runs.delete(p.id);
        try {
          await this.sessions.update(p.id, () => null).catch(() => null);
          await this.startRun(p, { ...opts, resume: false, locale: L });
        } catch (err) {
          info.error = errorMessage(err);
          this.last.set(p.id, info);
        } finally {
          this.busy.delete(p.id);
        }
        finish();
        return;
      }
      await this.checkpointAfter(p, info, logs, L);
      await this.saveSession(p, info, L);
      this.runs.delete(p.id);
      this.last.set(p.id, info);
      finish();
    });
    return info;
  }

  /** Simpan sesi run ini agar run berikutnya bisa melanjutkannya. */
  private async saveSession(p: ResolvedPrototype, info: AgentRunInfo, L: Locale): Promise<void> {
    const sessionId = info.sessionId;
    if (!sessionId || !this.started.has(info)) return; // agent tidak pernah mulai: tidak ada yang dilanjutkan
    const endedAt = info.endedAt ?? new Date().toISOString();
    try {
      await this.sessions.update(p.id, (cur) =>
        cur && cur.sessionId === sessionId
          ? { ...cur, endedAt, runs: cur.runs + 1, undoneAt: null }
          : { agent: info.agent, sessionId, cwd: p.path, startedAt: info.startedAt, endedAt, runs: 1, undoneAt: null },
      );
    } catch (err) {
      (await this.logs(p.id)).system(t.in(L, 'logSaveSessionFailed', { error: errorMessage(err) }));
    }
  }

  private onLine(preset: Preset, line: string, cwd: string, info: AgentRunInfo, logs: LogStore, tail: string[], L: Locale): void {
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
    // Hanya event init yang berarti sesi benar-benar berjalan: resume yang gagal tetap mengirim
    // event result ber-session_id (num_turns 0, "No conversation found").
    if (ev.type === 'system' && ev.subtype === 'init' && typeof ev.session_id === 'string' && ev.session_id && preset.session) {
      info.sessionId = ev.session_id;
      this.started.add(info);
    }
    if (ev.type === 'result') {
      if (typeof ev.result === 'string') info.summary = ev.result;
      if (typeof ev.total_cost_usd === 'number') info.costUsd = ev.total_cost_usd;
      if (typeof ev.num_turns === 'number') info.turns = ev.num_turns;
      if (ev.is_error || ev.subtype !== 'success') info.error = typeof ev.result === 'string' && ev.result ? ev.result : String(ev.subtype ?? 'error');
    }
    for (const l of describeEvent(ev, cwd, L)) logs.write('stdout', `${l}\n`);
  }

  async stop(id: string): Promise<AgentRunInfo | null> {
    const run = this.runs.get(id);
    if (!run) return this.last.get(id) ?? null;
    run.stopping = true;
    await killTree(run.child, run.exited);
    await run.finished;
    return this.last.get(id) ?? run.info;
  }

  private async checkpointAfter(p: ResolvedPrototype, info: AgentRunInfo, logs: LogStore, L: Locale): Promise<void> {
    const cp = info.checkpoint;
    if (!cp || !this.checkpoints) return;
    try {
      cp.after = await this.checkpoints.snapshot(p.id, p.path, `sesudah ${info.agent} (${info.status}) · ${new Date().toISOString()}`);
      cp.changes = await this.checkpoints.diff(p.id, p.path, cp.before, cp.after);
      const n = cp.changes.length;
      const files = `${cp.changes.slice(0, 5).map((c) => c.path).join(', ')}${n > 5 ? `, +${n - 5}` : ''}`;
      logs.system(n ? t.in(L, 'logFilesChanged', { n, files }) : t.in(L, 'logNoFilesChanged'));
    } catch (err) {
      info.checkpointError = errorMessage(err);
      logs.system(t.in(L, 'logCheckpointAfterFailed', { error: info.checkpointError }));
    }
  }

  /**
   * Batalkan perubahan file dari run terakhir: file yang diubah agent dikembalikan ke keadaan
   * sebelum run, file baru dihapus. Komentar & balasan (.prototyper/) tidak ikut dibatalkan.
   */
  async undo(p: ResolvedPrototype, opts: { force?: boolean } = {}): Promise<{ run: AgentRunInfo; comments: string[] } & UndoResult> {
    if (this.runs.has(p.id) || this.busy.has(p.id)) throw new AppError('CONFLICT', t('busy', { id: p.id }));
    const info = this.last.get(p.id);
    const cp = info?.checkpoint;
    if (!info || !cp?.after || !this.checkpoints) throw new AppError('BAD_REQUEST', t('noCheckpoint'));
    if (cp.undoneAt) throw new AppError('BAD_REQUEST', t('alreadyUndone'));
    if (!cp.changes.length) throw new AppError('BAD_REQUEST', t('noChanges'));
    this.busy.add(p.id);
    let res: UndoResult;
    try {
      res = await this.checkpoints.undo(p.id, p.path, cp.before, cp.after, opts.force === true);
    } finally {
      this.busy.delete(p.id);
    }
    cp.undoneAt = new Date().toISOString();
    const undoneAt = cp.undoneAt;
    // Sesi berisi perubahan yang kini sudah tidak ada: run berikutnya mulai sesi baru.
    await this.sessions.update(p.id, (cur) => (cur && cur.sessionId === info.sessionId ? { ...cur, undoneAt } : cur)).catch(() => null);
    const logs = await this.logs(p.id);
    logs.system(t('logUndone', { restored: res.restored.length, removed: res.removed.length }));
    // Beri tahu di komentar yang dikerjakan run ini bahwa perubahannya sudah tidak ada.
    let comments: string[] = [];
    try {
      comments = await noteUndo(
        p.path,
        { since: info.startedAt, until: info.endedAt ?? cp.undoneAt, ids: info.commentIds },
        undoReplyText(PRESETS[info.agent].name, cp.changes),
      );
      if (comments.length) logs.system(t('logUndoReplies', { ids: comments.join(', ') }));
    } catch (err) {
      logs.system(t('logUndoRepliesFailed', { error: errorMessage(err) }));
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
    await this.sessions.update(id, () => null).catch(() => null);
    await removeCheckpoints(this.config.home, id);
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.runs.keys()].map((id) => this.stop(id)));
    for (const p of this.logStores.values()) (await p).close();
  }
}
