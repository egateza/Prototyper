import { execFile } from 'node:child_process';
import { AppError, errorMessage } from './errors.js';
import { defineMessages } from './i18n.js';

const t = defineMessages({
  id: {
    enableFailed: 'Gagal mengaktifkan jalankan saat startup: {message}',
    disableFailed: 'Gagal menonaktifkan jalankan saat startup: {message}',
  },
  en: {
    enableFailed: 'Could not turn on run at startup: {message}',
    disableFailed: 'Could not turn off run at startup: {message}',
  },
});

/**
 * "Jalankan saat startup" untuk tray di Windows: nilai `Prototyper` di
 * `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` (per pengguna, tanpa hak admin).
 * Diatur lewat `reg.exe` agar tidak butuh modul native.
 */
export const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
export const RUN_VALUE = 'Prototyper';

/** Gabungkan argumen menjadi satu baris perintah Windows (selalu dikutip). */
export function windowsCommandLine(args: string[]): string {
  return args
    .map((a) => {
      // backslash sebelum kutip penutup harus digandakan, kutip di dalam di-escape
      const escaped = a.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1');
      return `"${escaped}"`;
    })
    .join(' ');
}

/** Ambil data nilai dari output `reg query <key> /v <value>`, atau null. */
export function parseRegQueryValue(output: string, value: string = RUN_VALUE): string | null {
  for (const line of output.split(/\r?\n/)) {
    const m = /^\s*(.+?)\s{2,}REG_(?:EXPAND_)?SZ\s{2,}(.*)$/.exec(line);
    if (m && m[1]!.toLowerCase() === value.toLowerCase()) return m[2]!.trim();
  }
  return null;
}

export type RegRunner = (args: string[]) => Promise<{ code: number; stdout: string; stderr: string }>;

export const runReg: RegRunner = (args) =>
  new Promise((resolve) => {
    execFile('reg', args, { windowsHide: true, timeout: 10_000, encoding: 'utf8' }, (err, stdout, stderr) => {
      const code = err ? (typeof (err as { code?: unknown }).code === 'number' ? ((err as { code: number }).code) : 1) : 0;
      resolve({ code, stdout, stderr: stderr || (err ? errorMessage(err) : '') });
    });
  });

export class StartupEntry {
  constructor(private readonly reg: RegRunner = runReg) {}

  /** Baris perintah yang terdaftar, atau null bila tidak aktif. */
  async get(): Promise<string | null> {
    const r = await this.reg(['query', RUN_KEY, '/v', RUN_VALUE]);
    return r.code === 0 ? parseRegQueryValue(r.stdout) : null;
  }

  async set(enabled: boolean, command: string[]): Promise<void> {
    const r = enabled
      ? await this.reg(['add', RUN_KEY, '/v', RUN_VALUE, '/t', 'REG_SZ', '/d', windowsCommandLine(command), '/f'])
      : await this.reg(['delete', RUN_KEY, '/v', RUN_VALUE, '/f']);
    // menghapus nilai yang memang tidak ada bukan kegagalan
    if (r.code !== 0 && (enabled || (await this.get()) !== null)) {
      throw new AppError('INTERNAL', t(enabled ? 'enableFailed' : 'disableFailed', { message: r.stderr.trim() }));
    }
  }
}
