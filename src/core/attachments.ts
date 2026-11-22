import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { AppError } from './errors.js';

/**
 * Lampiran gambar komentar/pesan agent, disimpan di folder prototype agar agent bisa membukanya
 * langsung dengan tool baca file. Nama file = hash isi (lampiran sama tidak disimpan dua kali).
 * Di comments.json dicatat sebagai path relatif ber-slash `/`, mis. `.prototyper/attachments/ab12….png`.
 */
export const ATTACHMENTS_DIR = path.join('.prototyper', 'attachments');
const REL_PREFIX = '.prototyper/attachments/';

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENTS = 6;
/** Batas body upload (base64 ≈ 4/3 ukuran asli + JSON). */
export const ATTACHMENT_BODY_LIMIT = Math.ceil((MAX_ATTACHMENT_BYTES * 4) / 3) + 64 * 1024;

const TYPES = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' } as const;
type Ext = keyof typeof TYPES;
const NAME = /^[a-f0-9]{16}\.(png|jpg|gif|webp|svg)$/;

/**
 * SVG bisa berisi skrip. Lampiran disajikan dari origin Web UI, jadi SVG selalu dikirim dengan CSP
 * ini: skrip, form, dan muatan luar diblokir walau file dibuka langsung di tab (di `<img>` skrip
 * memang tidak pernah jalan).
 */
export const SVG_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; sandbox";

/** Awal dokumen SVG: deklarasi XML, komentar, DOCTYPE (opsional), lalu elemen `<svg`. */
const SVG_START = /^(?:<\?xml[^>]*\?>\s*)?(?:(?:<!--[\s\S]*?-->|<!DOCTYPE[^>]*>)\s*)*<svg[\s>/]/i;

export interface Attachment {
  /** Nama file, mis. "ab12cd34ef56ab78.png". */
  name: string;
  /** Path relatif terhadap folder prototype (selalu `/`). Ini yang disimpan di komentar. */
  path: string;
  type: string;
  size: number;
}

/** Jenis gambar dari isi file (bukan dari tipe yang diklaim klien). */
export function sniffImage(buf: Buffer): Ext | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length >= 6 && /^GIF8[79]a$/.test(buf.subarray(0, 6).toString('latin1'))) return 'gif';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  if (!buf.includes(0)) {
    const head = buf.subarray(0, 4096).toString('utf8').replace(/^\uFEFF/, '').trimStart();
    if (SVG_START.test(head)) return 'svg';
  }
  return null;
}

export function attachmentType(name: string): string {
  return TYPES[path.extname(name).slice(1) as Ext] ?? 'application/octet-stream';
}

/** Nama file dari nama atau path relatif; null bila bukan lampiran yang sah (mencegah path traversal). */
export function attachmentName(v: string): string | null {
  const t = v.trim().replaceAll('\\', '/');
  const name = t.startsWith(REL_PREFIX) ? t.slice(REL_PREFIX.length) : t;
  return NAME.test(name) ? name : null;
}

export const attachmentRelPath = (name: string) => `${REL_PREFIX}${name}`;
export const attachmentFile = (dir: string, name: string) => path.join(dir, ATTACHMENTS_DIR, name);

/** Simpan gambar (base64 atau data URL). */
export async function saveAttachment(dir: string, data: unknown): Promise<Attachment> {
  if (typeof data !== 'string' || !data) throw new AppError('BAD_REQUEST', 'data wajib berisi gambar (base64 atau data URL)');
  const b64 = data.replace(/^data:[^,]*;base64,/, '');
  if (!/^[A-Za-z0-9+/\s]*={0,2}\s*$/.test(b64)) throw new AppError('BAD_REQUEST', 'data bukan base64 yang valid');
  const buf = Buffer.from(b64, 'base64');
  if (!buf.length) throw new AppError('BAD_REQUEST', 'Gambar kosong');
  if (buf.length > MAX_ATTACHMENT_BYTES) throw new AppError('BAD_REQUEST', `Gambar terlalu besar (maks. ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB)`);
  const ext = sniffImage(buf);
  if (!ext) throw new AppError('BAD_REQUEST', 'Format gambar tidak didukung (pakai PNG, JPG, GIF, WebP, atau SVG)');
  const name = `${createHash('sha256').update(buf).digest('hex').slice(0, 16)}.${ext}`;
  const file = attachmentFile(dir, name);
  await fs.mkdir(path.dirname(file), { recursive: true });
  if (!(await fs.stat(file).then((s) => s.size === buf.length, () => false))) await fs.writeFile(file, buf);
  return { name, path: attachmentRelPath(name), type: TYPES[ext], size: buf.length };
}

/**
 * Validasi daftar lampiran dari klien: harus lampiran yang sudah diunggah ke prototype ini.
 * Mengembalikan path relatif (tanpa duplikat, urutan dipertahankan).
 */
export async function cleanAttachments(dir: string, v: unknown): Promise<string[]> {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new AppError('BAD_REQUEST', 'attachments harus array path lampiran');
  const names: string[] = [];
  for (const x of v) {
    const name = typeof x === 'string' ? attachmentName(x) : null;
    if (!name) throw new AppError('BAD_REQUEST', `Lampiran tidak valid: ${String(x).slice(0, 100)}`);
    if (!names.includes(name)) names.push(name);
  }
  if (names.length > MAX_ATTACHMENTS) throw new AppError('BAD_REQUEST', `Maksimal ${MAX_ATTACHMENTS} lampiran`);
  for (const n of names) {
    if (!(await fs.stat(attachmentFile(dir, n)).then((s) => s.isFile(), () => false))) {
      throw new AppError('BAD_REQUEST', `Lampiran tidak ditemukan: ${attachmentRelPath(n)} (unggah dulu)`);
    }
  }
  return names.map(attachmentRelPath);
}

/** Hapus file lampiran yang tidak dirujuk lagi (`keep` = path relatif yang masih dipakai). */
export async function removeUnreferenced(dir: string, candidates: readonly string[], keep: ReadonlySet<string>): Promise<void> {
  for (const rel of candidates) {
    const name = attachmentName(rel);
    if (name && !keep.has(attachmentRelPath(name))) await fs.rm(attachmentFile(dir, name), { force: true });
  }
}
