import { createHash } from 'node:crypto';
import { copyFileSync, createWriteStream, existsSync, mkdirSync, promises as fs, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { AppMode } from './appfiles.js';
import { AppError, errorMessage } from './errors.js';

/**
 * Pemeriksaan & pemasangan pembaruan dari GitHub Releases (dipakai tray).
 * Pemasangan otomatis hanya untuk biner tunggal Windows (`prototyper-<versi>-win-<arch>.exe`);
 * bentuk lain cukup diberi tahu dan diarahkan ke halaman rilis.
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

/** Bandingkan versi semver (`1.2.3`, `1.2.3-beta.1`, boleh berawalan `v`): negatif bila a < b. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [core = '', pre] = v.trim().replace(/^v/i, '').split('-', 2) as [string, string | undefined];
    return { nums: core.split('.').map((n) => Number.parseInt(n, 10) || 0), pre };
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < Math.max(x.nums.length, y.nums.length, 3); i++) {
    const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0);
    if (d !== 0) return d;
  }
  if (x.pre === y.pre) return 0;
  if (x.pre === undefined) return 1; // rilis final > prerelease
  if (y.pre === undefined) return -1;
  return x.pre.localeCompare(y.pre, 'en', { numeric: true });
}

/** Nama berkas rilis yang bisa dipasang otomatis untuk instalasi ini, atau null (lihat scripts/release.ts). */
export function selfUpdateAssetName(version: string, platform: NodeJS.Platform, arch: string, mode: AppMode): string | null {
  if (platform !== 'win32' || mode !== 'sea') return null;
  return `prototyper-${version}-win-${arch}.exe`;
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
  checksums: ReleaseAsset | null;
}

export function evaluateRelease(current: string, latest: ReleaseInfo, assetName: string | null): UpdateCheck {
  const asset = assetName ? (latest.assets.find((a) => a.name === assetName) ?? null) : null;
  return {
    current,
    latest,
    available: compareVersions(latest.version, current) > 0,
    asset,
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
