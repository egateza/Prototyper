import path from 'node:path';
import { readJsonFile, samePath, writeJsonAtomic } from './fsutil.js';
import { defineMessages } from './i18n.js';

/** Alasan sesi tidak dilanjutkan (ditampilkan di Web UI & log run; bahasa peminta). */
const t = defineMessages({
  id: {
    disabled: 'dimatikan (PROTOTYPER_AGENT_RESUME_HOURS=0)',
    undone: 'perubahan run terakhir dibatalkan',
    moved: 'folder prototype berpindah',
    tooOld: 'sesi terakhir lebih dari {hours} jam lalu',
  },
  en: {
    disabled: 'turned off (PROTOTYPER_AGENT_RESUME_HOURS=0)',
    undone: 'changes from the last run were undone',
    moved: 'the prototype folder was moved',
    tooOld: (p) => (p.hours === 1 ? 'the last session was more than 1 hour ago' : `the last session was more than ${p.hours} hours ago`),
  },
});

/**
 * Sesi agent terakhir per prototype, agar run berikutnya bisa melanjutkan percakapan yang sama
 * (Claude Code `--resume`). Disimpan di `<PROTOTYPER_HOME>/agent-sessions.json` supaya tetap ada
 * setelah daemon dimulai ulang. Isinya hanya id sesi; percakapannya sendiri disimpan agent.
 */
export const SESSIONS_FILE = 'agent-sessions.json';
export const DEFAULT_RESUME_HOURS = 24;

export interface AgentSession {
  agent: string;
  sessionId: string;
  /** Folder kerja saat sesi dibuat; Claude menyimpan sesi per folder. */
  cwd: string;
  startedAt: string;
  endedAt: string;
  /** Jumlah run dalam sesi ini (1 = sesi baru). */
  runs: number;
  /** Diisi bila perubahan run terakhir dibatalkan: sesi berisi perubahan yang sudah tidak ada. */
  undoneAt: string | null;
}

/** Apakah sesi bisa dilanjutkan, dan bila tidak, kenapa (untuk Web UI). */
export interface ResumeState {
  resumable: boolean;
  session: AgentSession | null;
  reason: string | null;
}

export function resumeState(
  s: AgentSession | null | undefined,
  want: { agent: string; cwd: string; supported: boolean; hours: number; now?: number },
): ResumeState {
  const no = (reason: string | null): ResumeState => ({ resumable: false, session: s ?? null, reason });
  if (!want.supported) return no(null);
  if (want.hours <= 0) return no(t('disabled'));
  if (!s) return no(null);
  if (s.agent !== want.agent) return no(null);
  if (s.undoneAt) return no(t('undone'));
  if (!samePath(s.cwd, want.cwd)) return no(t('moved'));
  const age = (want.now ?? Date.now()) - Date.parse(s.endedAt);
  if (!(age <= want.hours * 3_600_000)) return no(t('tooOld', { hours: want.hours }));
  return { resumable: true, session: s, reason: null };
}

export class SessionStore {
  private cache: Record<string, AgentSession> | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly home: string) {}

  private get file(): string {
    return path.join(this.home, SESSIONS_FILE);
  }

  private async load(): Promise<Record<string, AgentSession>> {
    if (!this.cache) {
      try {
        const data = await readJsonFile<Record<string, AgentSession>>(this.file);
        this.cache = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
      } catch {
        this.cache = {}; // file rusak: mulai dari kosong, sesi baru saja
      }
    }
    return this.cache;
  }

  async get(id: string): Promise<AgentSession | null> {
    return (await this.load())[id] ?? null;
  }

  /** Ubah sesi satu prototype (null = hapus) lalu simpan; ditulis berurutan. */
  update(id: string, fn: (cur: AgentSession | null) => AgentSession | null): Promise<AgentSession | null> {
    const next = this.queue.then(async () => {
      const all = await this.load();
      const v = fn(all[id] ?? null);
      if (v) all[id] = v;
      else delete all[id];
      await writeJsonAtomic(this.file, all);
      return v;
    });
    this.queue = next.catch(() => {});
    return next;
  }
}
