import { spawn } from 'node:child_process';

/** Buka URL di browser bawaan sistem; diam bila gagal. */
export function openBrowser(url: string): void {
  const [cmd, args]: [string, string[]] =
    process.platform === 'win32'
      ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  try {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.on('error', () => undefined);
    child.unref();
  } catch {
    // biarkan: URL sudah dicetak di konsol / tersedia di menu
  }
}
