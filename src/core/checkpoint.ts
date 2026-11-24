import { spawn } from 'node:child_process';
import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { AppError } from './errors.js';
import { defineMessages } from './i18n.js';

const t = defineMessages({
  id: {
    changedAgain: '{n} file sudah berubah lagi setelah agent selesai. Batalkan tetap akan menimpa perubahan itu.',
    gitMissing: 'git tidak ditemukan; pasang Git agar checkpoint bisa dibuat',
    gitFailed: 'git gagal: {message}',
    gitCommandFailed: 'git {command} gagal (exit {code}): {stderr}',
  },
  en: {
    changedAgain: (p) =>
      `${p.n === 1 ? '1 file has' : `${p.n} files have`} changed again after the agent finished. Undoing changes will still overwrite those edits.`,
    gitMissing: 'git was not found; install Git so checkpoints can be created',
    gitFailed: 'git failed: {message}',
    gitCommandFailed: 'git {command} failed (exit {code}): {stderr}',
  },
});

/**
 * Checkpoint folder prototype sebelum/sesudah run agent, agar perubahan agent bisa dibatalkan.
 *
 * Disimpan di repo git "bayangan" milik Prototyper (`<home>/checkpoints/<id>.git`, bare) dengan
 * work-tree = folder prototype. Repo git milik pengguna (index, stash, branch) tidak disentuh dan
 * folder prototype tidak mendapat file tambahan. `.gitignore` pengguna tetap dihormati; selain itu
 * `.prototyper/`, `.git/`, dan `node_modules/` selalu dikecualikan.
 */

export type FileChangeStatus = 'added' | 'modified' | 'deleted';

export interface FileChange {
  status: FileChangeStatus;
  /** Path relatif terhadap folder prototype, pemisah `/`. */
  path: string;
}

export interface UndoResult {
  restored: string[];
  removed: string[];
}

const EXCLUDE = ['.prototyper/', 'node_modules/', '.git/'];

/** Konfigurasi lokal repo bayangan: terisolasi dari config global pengguna (hooks, tanda tangan, CRLF). */
const REPO_CONFIG: [string, string][] = [
  ['core.autocrlf', 'false'],
  ['core.safecrlf', 'false'],
  ['core.longpaths', 'true'],
  ['core.quotepath', 'false'],
  ['core.fsmonitor', 'false'],
  ['commit.gpgsign', 'false'],
  ['gc.autoDetach', 'false'],
  ['user.name', 'Prototyper'],
  ['user.email', 'prototyper@localhost'],
];

const STATUS: Record<string, FileChangeStatus> = { A: 'added', M: 'modified', T: 'modified', D: 'deleted' };

/** Parse `git diff --name-status -z`: `S\0path\0S\0path\0…`. */
export function parseNameStatus(out: string): FileChange[] {
  const parts = out.split('\0');
  const res: FileChange[] = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const s = STATUS[(parts[i] ?? '').charAt(0)];
    const p = parts[i + 1];
    if (s && p) res.push({ status: s, path: p });
  }
  return res;
}

interface GitResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Path repo checkpoint sebuah prototype. */
export function checkpointRepoDir(home: string, id: string): string {
  return path.join(home, 'checkpoints', `${id}.git`);
}

/** Hapus repo checkpoint prototype (saat prototype dihapus dari daftar). Tidak gagal bila tidak ada. */
export async function removeCheckpoints(home: string, id: string): Promise<boolean> {
  const dir = checkpointRepoDir(home, id);
  if (!existsSync(dir)) return false;
  await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  return true;
}

export class Checkpoints {
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(
    private readonly home: string,
    private readonly opts: { git?: string; timeoutMs?: number } = {},
  ) {}

  repoDir(id: string): string {
    return checkpointRepoDir(this.home, id);
  }

  /** Simpan keadaan folder; mengembalikan id commit. Tanpa perubahan sejak snapshot terakhir → commit terakhir. */
  snapshot(id: string, workTree: string, message: string): Promise<string> {
    return this.exclusive(id, async () => {
      await this.ensureRepo(id);
      const g = (args: string[], ok?: number[]) => this.git(id, workTree, args, { ok });
      await g(['add', '-A', '--ignore-errors', '.'], [0, 1]);
      const head = await g(['rev-parse', '--verify', '-q', 'HEAD'], [0, 1]);
      const hasHead = head.code === 0;
      if (hasHead && (await g(['diff', '--cached', '--quiet'], [0, 1])).code === 0) return head.stdout.trim();
      await g(['commit', '--no-verify', '--allow-empty', '-q', '-m', message]);
      return (await g(['rev-parse', 'HEAD'])).stdout.trim();
    });
  }

  /** File yang berbeda antara dua checkpoint. */
  async diff(id: string, workTree: string, from: string, to: string): Promise<FileChange[]> {
    const r = await this.git(id, workTree, ['diff', '--name-status', '-z', '--no-renames', from, to]);
    return parseNameStatus(r.stdout);
  }

  /**
   * Kembalikan file yang berubah antara `before` dan `after` ke keadaan `before`. File lain tidak
   * disentuh. Bila salah satu file itu sudah berubah lagi sejak `after` (diedit pengguna), ditolak
   * dengan CONFLICT kecuali `force`.
   */
  async undo(id: string, workTree: string, before: string, after: string, force = false): Promise<UndoResult> {
    const changes = await this.diff(id, workTree, before, after);
    if (!changes.length) return { restored: [], removed: [] };
    const now = await this.snapshot(id, workTree, 'sebelum membatalkan');
    if (!force) {
      const touched = new Set(changes.map((c) => c.path));
      const edited = (await this.diff(id, workTree, after, now)).filter((c) => touched.has(c.path)).map((c) => c.path);
      if (edited.length) {
        throw new AppError('CONFLICT', t('changedAgain', { n: edited.length }), edited);
      }
    }
    return this.exclusive(id, async () => {
      const restore = changes.filter((c) => c.status !== 'added').map((c) => c.path);
      const remove = changes.filter((c) => c.status === 'added').map((c) => c.path);
      if (restore.length) {
        await this.git(id, workTree, ['checkout', before, '--pathspec-from-file=-', '--pathspec-file-nul'], { input: restore.join('\0') });
      }
      const root = path.resolve(workTree);
      for (const rel of remove) {
        const abs = path.resolve(root, rel);
        if (!abs.startsWith(root + path.sep)) continue;
        await fs.rm(abs, { force: true });
        // Hapus folder yang jadi kosong karena file baru itu (sampai folder prototype).
        for (let dir = path.dirname(abs); dir !== root && dir.startsWith(root + path.sep); dir = path.dirname(dir)) {
          try {
            await fs.rmdir(dir);
          } catch {
            break;
          }
        }
      }
      return { restored: restore, removed: remove };
    });
  }

  private exclusive<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(id) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.locks.set(
      id,
      next.catch(() => undefined),
    );
    return next;
  }

  private async ensureRepo(id: string): Promise<void> {
    const dir = this.repoDir(id);
    if (existsSync(path.join(dir, 'HEAD'))) return;
    await fs.mkdir(dir, { recursive: true });
    await this.run(['init', '-q', '--bare', dir]);
    // hooksPath ke folder kosong milik repo ini: hook global pengguna (core.hooksPath) tidak ikut jalan.
    for (const [k, v] of [...REPO_CONFIG, ['core.hooksPath', path.join(dir, 'no-hooks')]]) await this.run([`--git-dir=${dir}`, 'config', k!, v!]);
    await fs.mkdir(path.join(dir, 'info'), { recursive: true });
    await fs.writeFile(path.join(dir, 'info', 'exclude'), `${EXCLUDE.join('\n')}\n`);
  }

  private git(id: string, workTree: string, args: string[], o: { ok?: number[] | undefined; input?: string } = {}): Promise<GitResult> {
    return this.run([`--git-dir=${this.repoDir(id)}`, `--work-tree=${workTree}`, '--literal-pathspecs', ...args], { ...o, cwd: workTree });
  }

  private run(args: string[], o: { ok?: number[] | undefined; input?: string; cwd?: string } = {}): Promise<GitResult> {
    const bin = this.opts.git ?? 'git';
    const env: NodeJS.ProcessEnv = {};
    for (const [k, v] of Object.entries(process.env)) if (!k.toUpperCase().startsWith('GIT_')) env[k] = v;
    env.GIT_TERMINAL_PROMPT = '0';
    return new Promise((resolve, reject) => {
      const child = spawn(bin, args, { cwd: o.cwd, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8').on('data', (d: string) => (stdout += d));
      child.stderr.setEncoding('utf8').on('data', (d: string) => (stderr += d));
      const timer = setTimeout(() => child.kill(), this.opts.timeoutMs ?? 120_000);
      child.once('error', (err) => {
        clearTimeout(timer);
        const missing = (err as NodeJS.ErrnoException).code === 'ENOENT';
        reject(new AppError('BAD_REQUEST', missing ? t('gitMissing') : t('gitFailed', { message: err.message })));
      });
      child.once('close', (code) => {
        clearTimeout(timer);
        const c = code ?? -1;
        if ((o.ok ?? [0]).includes(c)) resolve({ code: c, stdout, stderr });
        else reject(new AppError('INTERNAL', t('gitCommandFailed', { command: args.find((a) => !a.startsWith('-')) ?? '', code: c, stderr: stderr.trim().slice(0, 300) })));
      });
      // git bisa keluar sebelum stdin habis ditulis (EPIPE); hasilnya tetap dinilai dari exit code di 'close'
      child.stdin.on('error', () => {});
      child.stdin.end(o.input ?? '');
    });
  }
}
