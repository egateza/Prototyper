import { execFileSync } from 'node:child_process';
import type { Config } from '../core/config.js';
import { launchTray } from '../tray/index.js';
import { reportError } from './output.js';

/**
 * Mode peluncur: biner tunggal yang di-dobel-klik dari Explorer (Windows). Tanpa ini, exe hanya
 * mencetak bantuan lalu keluar, dan Windows langsung menutup jendela konsolnya.
 */
export { openBrowser } from '../core/open.js';

/** Ambil nama image dari output `tasklist /FO CSV /NH` (baris pertama), mis. `"explorer.exe","1234",...`. */
export function parseTasklistImage(output: string): string | null {
  const line = output.split(/\r?\n/).find((l) => l.startsWith('"'));
  const m = line?.match(/^"([^"]+)"/);
  return m ? m[1]! : null;
}

export interface LaunchCheck {
  platform: NodeJS.Platform;
  mode: string;
  /** Argumen pengguna (tanpa execPath/skrip). */
  args: string[];
  /** Nama image proses induk, atau null bila tidak diketahui. */
  parentImage: () => string | null;
}

/** True bila exe dijalankan tanpa argumen langsung dari Explorer (dobel-klik / shortcut). */
export function isExplorerLaunch(c: LaunchCheck): boolean {
  if (c.platform !== 'win32' || c.mode !== 'sea' || c.args.length > 0) return false;
  return c.parentImage()?.toLowerCase() === 'explorer.exe';
}

export function windowsParentImage(ppid: number = process.ppid): string | null {
  try {
    const out = execFileSync('tasklist', ['/FI', `PID eq ${ppid}`, '/FO', 'CSV', '/NH'], {
      encoding: 'utf8',
      timeout: 3000,
      windowsHide: true,
    });
    return parseTasklistImage(out);
  } catch {
    return null;
  }
}

/** Tahan jendela konsol agar pesan terbaca, lalu keluar. */
function pauseAndExit(code: number): void {
  if (!process.stdin.isTTY) process.exit(code);
  console.log('\nTekan Enter untuk menutup jendela ini.');
  process.stdin.resume();
  process.stdin.once('data', () => process.exit(code));
}

/**
 * Dobel-klik exe: jalankan Prototyper di tray (proses terlepas dari konsol), lalu jendela konsol
 * ini langsung tertutup. Bila tray sudah berjalan, Web UI dibuka di browser.
 */
export async function runLauncher(config: Config): Promise<void> {
  try {
    const r = await launchTray(config);
    console.log(r.alreadyRunning ? 'Prototyper sudah berjalan di tray.' : 'Prototyper berjalan di tray (ikon di pojok kanan bawah).');
  } catch (err) {
    reportError(err, false);
    pauseAndExit(1);
  }
}
