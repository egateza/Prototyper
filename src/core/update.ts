import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, createWriteStream, existsSync, mkdirSync, promises as fs, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { APP_INFO_FILE, BUNDLE_FILE, CURRENT_FILE, parseAppInfo, pruneAppStore, writeCurrent, type AppInfo } from './apphost.js';
import type { AppMode } from './appfiles.js';
import { unpackFiles } from './apppack.js';
import { compareVersions } from './semver.js';
import { AppError, errorMessage } from './errors.js';
import { windowsCommandLine } from './startup.js';

/**
 * Pemeriksaan & pemasangan pembaruan dari GitHub Releases (dipakai tray).
 * Pemasangan otomatis hanya untuk biner tunggal Windows (lihat updateCandidates); bentuk lain
 * cukup diberi tahu dan diarahkan ke halaman rilis.
 */

export interface ReleaseAsset {
  name: string;
  url: string;
  size: number;
}

export interface ReleaseInfo {
  version: string;
  tag: string;
  pageUrl: string;
  assets: ReleaseAsset[];
}

type FetchFn = typeof fetch;

export { compareVersions } from './semver.js';

/**
 * Jenis pembaruan yang bisa dipasang dari tray:
 * - `app`: paket aplikasi kecil (`prototyper-<versi>-app-r<runtime>.tar.gz`) untuk exe dengan RUNTIME
 *   yang sama; dipasang ke app store tanpa mengganti exe.
 * - `msi`: installer Windows; untuk instalasi MSI saat RUNTIME naik.
 * - `exe`: biner tunggal pengganti exe yang sedang berjalan (instalasi tanpa MSI).
 */
export type UpdateKind = 'app' | 'msi' | 'exe';

export interface UpdateCandidate {
  kind: UpdateKind;
  name: string;
}

export interface InstallContext {
  platform: NodeJS.Platform;
  arch: string;
  mode: AppMode;
  /** RUNTIME milik exe (dari bootstrap), atau null bila tidak dijalankan lewat bootstrap. */
  runtime: number | null;
  /** Cara Prototyper dipasang (lihat detectInstaller). */
  installer: 'msi' | null;
}

export const appPackName = (version: string, runtime: number) => `prototyper-${version}-app-r${runtime}.tar.gz`;
export const msiName = (version: string, arch: string) => `prototyper-${version}-win-${arch}.msi`;
export const exeName = (version: string, arch: string) => `prototyper-${version}-win-${arch}.exe`;

/**
 * Berkas rilis yang bisa dipasang otomatis untuk instalasi ini, urut dari yang paling diutamakan
 * (lihat scripts/release.ts). Kosong = arahkan pengguna ke halaman rilis.
 */
export function updateCandidates(version: string, ctx: InstallContext): UpdateCandidate[] {
  if (ctx.platform !== 'win32' || ctx.mode !== 'sea') return [];
  const out: UpdateCandidate[] = [];
  if (ctx.runtime !== null) out.push({ kind: 'app', name: appPackName(version, ctx.runtime) });
  out.push(ctx.installer === 'msi' ? { kind: 'msi', name: msiName(version, ctx.arch) } : { kind: 'exe', name: exeName(version, ctx.arch) });
  return out;
}

/** Baca `SHA256SUMS.txt` (format `sha256sum`: `<hash>  <nama>` atau `<hash> *<nama>`). */
export function parseSha256Sums(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^([0-9a-f]{64})\s+\*?(.+?)\s*$/i.exec(line.trim());
    if (m) out.set(m[2]!, m[1]!.toLowerCase());
  }
  return out;
}

interface GithubRelease {
  tag_name?: string;
  html_url?: string;
  draft?: boolean;
  assets?: Array<{ name?: string; browser_download_url?: string; size?: number }>;
}

export function parseRelease(data: unknown): ReleaseInfo {
  const r = data as GithubRelease | null;
  if (!r || typeof r.tag_name !== 'string' || typeof r.html_url !== 'string') {
    throw new AppError('INTERNAL', 'Respons GitHub Releases tidak dikenali');
  }
  return {
    version: r.tag_name.replace(/^v/i, ''),
    tag: r.tag_name,
    pageUrl: r.html_url,
    assets: (r.assets ?? [])
      .filter((a) => typeof a.name === 'string' && typeof a.browser_download_url === 'string')
      .map((a) => ({ name: a.name as string, url: a.browser_download_url as string, size: a.size ?? 0 })),
  };
}

const headers = (version: string) => ({ 'user-agent': `Prototyper/${version}`, accept: 'application/vnd.github+json' });

/** Rilis terbaru (bukan prerelease) dari `repo`. */
export async function fetchLatestRelease(repo: string, currentVersion: string, fetchImpl: FetchFn = fetch): Promise<ReleaseInfo> {
  let res: Response;
  try {
    res = await fetchImpl(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: headers(currentVersion),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new AppError('INTERNAL', `Tidak bisa menghubungi GitHub: ${errorMessage(err)}`);
  }
  if (res.status === 404) throw new AppError('NOT_FOUND', `Belum ada rilis di github.com/${repo}`);
  if (!res.ok) throw new AppError('INTERNAL', `GitHub membalas HTTP ${res.status}`);
  return parseRelease(await res.json());
}

export interface UpdateCheck {
  current: string;
  latest: ReleaseInfo;
  available: boolean;
  /** Berkas yang bisa dipasang otomatis, atau null (arahkan pengguna ke `latest.pageUrl`). */
  asset: ReleaseAsset | null;
  /** Jenis `asset`. */
  kind: UpdateKind | null;
  checksums: ReleaseAsset | null;
}

export function evaluateRelease(current: string, latest: ReleaseInfo, candidates: UpdateCandidate[]): UpdateCheck {
  let asset: ReleaseAsset | null = null;
  let kind: UpdateKind | null = null;
  for (const c of candidates) {
    asset = latest.assets.find((a) => a.name === c.name) ?? null;
    if (asset) {
      kind = c.kind;
      break;
    }
  }
  return {
    current,
    latest,
    available: compareVersions(latest.version, current) > 0,
    asset,
    kind,
    checksums: latest.assets.find((a) => a.name === 'SHA256SUMS.txt') ?? null,
  };
}

/**
 * Unduh berkas pembaruan ke `dir` dan cocokkan dengan SHA256SUMS.txt rilis yang sama.
 * Mengembalikan path berkas yang sudah terverifikasi.
 */
export async function downloadUpdate(
  check: UpdateCheck,
  dir: string,
  onProgress: (fraction: number) => void = () => undefined,
  fetchImpl: FetchFn = fetch,
): Promise<string> {
  const { asset, checksums } = check;
  if (!asset) throw new AppError('BAD_REQUEST', 'Tidak ada berkas pembaruan untuk instalasi ini');
  if (!checksums) throw new AppError('INTERNAL', 'Rilis tidak memiliki SHA256SUMS.txt; pembaruan dibatalkan');

  const sumsRes = await fetchImpl(checksums.url, { headers: headers(check.current) });
  if (!sumsRes.ok) throw new AppError('INTERNAL', `Gagal mengunduh SHA256SUMS.txt (HTTP ${sumsRes.status})`);
  const expected = parseSha256Sums(await sumsRes.text()).get(asset.name);
  if (!expected) throw new AppError('INTERNAL', `${asset.name} tidak tercantum di SHA256SUMS.txt; pembaruan dibatalkan`);

  mkdirSync(dir, { recursive: true });
  const target = path.join(dir, asset.name);
  const part = `${target}.download`;
  const res = await fetchImpl(asset.url, { headers: headers(check.current) });
  if (!res.ok || !res.body) throw new AppError('INTERNAL', `Gagal mengunduh ${asset.name} (HTTP ${res.status})`);
  const total = Number(res.headers.get('content-length')) || asset.size || 0;
  const hash = createHash('sha256');
  let received = 0;
  const body = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream<Uint8Array>);
  body.on('data', (chunk: Buffer) => {
    hash.update(chunk);
    received += chunk.length;
    if (total) onProgress(Math.min(1, received / total));
  });
  try {
    await pipeline(body, createWriteStream(part));
  } catch (err) {
    rmSync(part, { force: true });
    throw new AppError('INTERNAL', `Unduhan ${asset.name} terputus: ${errorMessage(err)}`);
  }
  const actual = hash.digest('hex');
  if (actual !== expected) {
    rmSync(part, { force: true });
    throw new AppError('INTERNAL', `Checksum ${asset.name} tidak cocok; berkas dibuang`);
  }
  rmSync(target, { force: true });
  renameSync(part, target);
  onProgress(1);
  return target;
}

/** Path cadangan exe lama setelah pembaruan (dihapus saat tray berikutnya menyala). */
export const oldExePath = (exe: string) => `${exe}.old`;

/**
 * Ganti exe yang sedang berjalan dengan `downloaded`. Di Windows exe yang sedang berjalan tidak bisa
 * ditimpa tetapi bisa di-rename, jadi exe lama dipindah ke `<exe>.old` lebih dulu.
 */
export function replaceExecutable(exe: string, downloaded: string): void {
  const old = oldExePath(exe);
  rmSync(old, { force: true });
  renameSync(exe, old);
  try {
    // salin (bukan rename) agar tetap jalan bila folder unduhan ada di drive lain
    copyFileSync(downloaded, exe);
  } catch (err) {
    rmSync(exe, { force: true });
    renameSync(old, exe);
    throw new AppError('INTERNAL', `Gagal memasang pembaruan: ${errorMessage(err)}`);
  }
  rmSync(downloaded, { force: true });
}

/** Hapus `<exe>.old` sisa pembaruan sebelumnya; diam bila masih terkunci. */
export async function cleanupOldExecutable(exe: string): Promise<void> {
  const old = oldExePath(exe);
  if (!existsSync(old)) return;
  await fs.rm(old, { force: true }).catch(() => undefined);
}

// ===== Pembaruan aplikasi (tanpa mengganti exe) =====

export interface AppInstallOptions {
  /** Folder app store (`HostInfo.root`). */
  root: string;
  /** RUNTIME milik exe. */
  runtime: number;
  /** Aplikasi yang sedang berjalan dan aplikasi bawaan exe: tidak ikut dibersihkan. */
  active: AppInfo;
  embedded: AppInfo;
  /** Pastikan exe menjalankan aplikasi baru (mis. `prototyper --version`); melempar bila gagal. */
  verify: (info: AppInfo) => Promise<void> | void;
}

/**
 * Pasang paket aplikasi: ekstrak ke `<root>/<id>/`, arahkan `current.json` ke sana, lalu verifikasi.
 * Verifikasi gagal → `current.json` dikembalikan seperti semula.
 */
export async function installAppUpdate(pack: string, o: AppInstallOptions): Promise<AppInfo> {
  const files = unpackFiles(readFileSync(pack));
  const infoFile = files.get(APP_INFO_FILE);
  let info: AppInfo | null = null;
  try {
    info = infoFile ? parseAppInfo(JSON.parse(infoFile.toString('utf8'))) : null;
  } catch {
    info = null;
  }
  if (!info || !files.has(BUNDLE_FILE) || !files.has('package.json')) {
    throw new AppError('BAD_REQUEST', `${path.basename(pack)} bukan paket aplikasi Prototyper`);
  }
  if (info.runtime !== o.runtime) {
    throw new AppError('BAD_REQUEST', `Paket aplikasi butuh runtime ${info.runtime}, exe ini runtime ${o.runtime}`);
  }

  const dir = path.join(o.root, info.id);
  const tmp = `${dir}.${process.pid}.tmp`;
  rmSync(tmp, { recursive: true, force: true });
  for (const [name, data] of files) {
    const target = path.join(tmp, ...name.split('/'));
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, data);
  }
  rmSync(dir, { recursive: true, force: true }); // termasuk sisa pemasangan gagal / penanda .broken
  renameSync(tmp, dir);

  const pointerFile = path.join(o.root, CURRENT_FILE);
  const before = existsSync(pointerFile) ? readFileSync(pointerFile) : null;
  writeCurrent(o.root, { ...info, previous: o.active });
  try {
    await o.verify(info);
  } catch (err) {
    if (before) writeFileSync(pointerFile, before);
    else rmSync(pointerFile, { force: true });
    rmSync(dir, { recursive: true, force: true });
    throw new AppError('INTERNAL', `Aplikasi ${info.version} gagal dijalankan, pembaruan dibatalkan: ${errorMessage(err)}`);
  }
  pruneAppStore(o.root, [info.id, o.active.id, o.embedded.id]);
  rmSync(pack, { force: true });
  return info;
}

// ===== Instalasi MSI =====

/** File penanda yang dipasang MSI di sebelah prototyper.exe (lihat scripts/msi.ts). */
export const INSTALLER_FILE = 'installer.json';

/** `msi` bila exe ini dipasang lewat MSI, selain itu null. */
export function detectInstaller(execPath: string): 'msi' | null {
  try {
    const data = JSON.parse(readFileSync(path.join(path.dirname(execPath), INSTALLER_FILE), 'utf8')) as { kind?: unknown };
    return data.kind === 'msi' ? 'msi' : null;
  } catch {
    return null;
  }
}

export interface MsiScriptOptions {
  msi: string;
  log: string;
  /** Proses yang ditunggu selesai sebelum msiexec dijalankan (tray yang sedang keluar). */
  waitPid: number;
  /** Perintah untuk menyalakan Prototyper lagi setelah pemasangan (exe + argumen). */
  relaunch: string[];
}

const psQuote = (s: string) => `'${s.replace(/'/g, "''")}'`;

/**
 * Skrip PowerShell pemasang MSI: tunggu tray keluar, jalankan msiexec tanpa dialog (`/passive`,
 * per-user sehingga tanpa UAC), lalu nyalakan Prototyper lagi, baik pemasangan berhasil maupun gagal
 * (MSI mengembalikan versi lama bila gagal).
 */
export function msiInstallScript(o: MsiScriptOptions): string {
  const msiArgs = `/i "${o.msi}" /passive /norestart LAUNCHAPP=0 /l*v "${o.log}"`;
  const [exe, ...args] = o.relaunch;
  return [
    "$ErrorActionPreference = 'Continue'",
    `Wait-Process -Id ${o.waitPid} -Timeout 30 -ErrorAction SilentlyContinue`,
    `$p = Start-Process -FilePath 'msiexec.exe' -ArgumentList ${psQuote(msiArgs)} -Wait -PassThru`,
    `Set-Content -LiteralPath ${psQuote(`${o.log}.exitcode`)} -Value $p.ExitCode`,
    `Start-Process -FilePath ${psQuote(exe!)} -ArgumentList ${psQuote(windowsCommandLine(args))} -WindowStyle Hidden`,
    '',
  ].join('\r\n');
}

/** Jalankan skrip pemasang MSI terlepas dari proses ini. */
export function launchMsiInstall(o: MsiScriptOptions, dir: string): string {
  mkdirSync(dir, { recursive: true });
  const script = path.join(dir, 'install-msi.ps1');
  // BOM: PowerShell 5.1 membaca skrip tanpa BOM sebagai ANSI (path ber-karakter non-ASCII rusak)
  writeFileSync(script, `\uFEFF${msiInstallScript(o)}`, 'utf8');
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', script], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
  return script;
}
