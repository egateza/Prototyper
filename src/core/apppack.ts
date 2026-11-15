import { gunzipSync, gzipSync } from 'node:zlib';
import { AppError } from './errors.js';

/**
 * Paket aplikasi untuk pembaruan (`prototyper-<versi>-app-r<runtime>.tar.gz`): tar ustar + gzip
 * standar (bisa dibuka dengan `tar -xzf`), dibuat dan dibaca tanpa alat eksternal. Hanya berisi
 * file biasa dengan path relatif; selain itu ditolak saat dibaca.
 */

const BLOCK = 512;
/** Waktu tetap agar paket dari isi yang sama selalu identik (2026-01-01). */
const MTIME = 1_767_225_600;

function writeString(buf: Buffer, value: string, offset: number, length: number): void {
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.length > length) throw new AppError('INTERNAL', `Nama terlalu panjang untuk tar: ${value}`);
  bytes.copy(buf, offset);
}

function writeOctal(buf: Buffer, value: number, offset: number, length: number): void {
  writeString(buf, `${value.toString(8).padStart(length - 1, '0')}\0`, offset, length);
}

/** Pecah path > 100 byte menjadi prefix (≤ 155) + name (≤ 100) di batas `/`. */
function splitName(name: string): { prefix: string; name: string } {
  if (Buffer.byteLength(name) <= 100) return { prefix: '', name };
  for (let i = name.lastIndexOf('/'); i > 0; i = name.lastIndexOf('/', i - 1)) {
    const prefix = name.slice(0, i);
    const rest = name.slice(i + 1);
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(rest) <= 100) return { prefix, name: rest };
  }
  throw new AppError('INTERNAL', `Path terlalu panjang untuk tar: ${name}`);
}

function header(file: string, size: number): Buffer {
  const h = Buffer.alloc(BLOCK);
  const { prefix, name } = splitName(file);
  writeString(h, name, 0, 100);
  writeOctal(h, 0o644, 100, 8);
  writeOctal(h, 0, 108, 8); // uid
  writeOctal(h, 0, 116, 8); // gid
  writeOctal(h, size, 124, 12);
  writeOctal(h, MTIME, 136, 12);
  h.fill(0x20, 148, 156); // checksum dihitung dengan field ini berisi spasi
  h.write('0', 156, 'ascii'); // file biasa
  writeString(h, 'ustar\0', 257, 6);
  writeString(h, '00', 263, 2);
  writeString(h, prefix, 345, 155);
  let sum = 0;
  for (const b of h) sum += b;
  writeString(h, `${sum.toString(8).padStart(6, '0')}\0 `, 148, 8);
  return h;
}

/** Path relatif yang aman: pemisah `/`, tanpa `..`, tanpa path absolut / huruf drive. */
export function isSafeRelativePath(p: string): boolean {
  if (!p || p.startsWith('/') || p.includes('\\') || p.includes(':') || p.includes('\0')) return false;
  return p.split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..');
}

/** Buat tar.gz dari daftar file (path relatif berpemisah `/`). Urutan mengikuti nama agar deterministik. */
export function packFiles(files: Map<string, Buffer>): Buffer {
  const parts: Buffer[] = [];
  for (const name of [...files.keys()].sort()) {
    if (!isSafeRelativePath(name)) throw new AppError('INTERNAL', `Path tidak valid di paket: ${name}`);
    const data = files.get(name)!;
    parts.push(header(name, data.length), data);
    const pad = (BLOCK - (data.length % BLOCK)) % BLOCK;
    if (pad) parts.push(Buffer.alloc(pad));
  }
  parts.push(Buffer.alloc(BLOCK * 2)); // penanda akhir arsip
  return gzipSync(Buffer.concat(parts), { level: 9 });
}

function readString(buf: Buffer, offset: number, length: number): string {
  const slice = buf.subarray(offset, offset + length);
  const end = slice.indexOf(0);
  return slice.subarray(0, end === -1 ? length : end).toString('utf8');
}

function readOctal(buf: Buffer, offset: number, length: number): number {
  const s = readString(buf, offset, length).trim();
  return s ? Number.parseInt(s, 8) : 0;
}

/** Baca tar.gz menjadi daftar file. Melempar bila rusak atau berisi entri selain file/folder biasa. */
export function unpackFiles(gz: Buffer): Map<string, Buffer> {
  let tar: Buffer;
  try {
    tar = gunzipSync(gz);
  } catch {
    throw new AppError('BAD_REQUEST', 'Paket aplikasi rusak (bukan gzip)');
  }
  const out = new Map<string, Buffer>();
  let pos = 0;
  while (pos + BLOCK <= tar.length) {
    const h = tar.subarray(pos, pos + BLOCK);
    if (h.every((b) => b === 0)) return out;
    let sum = 0;
    for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 0x20 : h[i]!;
    if (sum !== readOctal(h, 148, 8)) throw new AppError('BAD_REQUEST', 'Paket aplikasi rusak (checksum header tar)');
    const prefix = readString(h, 345, 155);
    const name = (prefix ? `${prefix}/${readString(h, 0, 100)}` : readString(h, 0, 100)).replace(/\/$/, '');
    const size = readOctal(h, 124, 12);
    const type = String.fromCharCode(h[156]!);
    pos += BLOCK;
    if (type === '0' || type === '\0') {
      if (!isSafeRelativePath(name)) throw new AppError('BAD_REQUEST', `Paket aplikasi berisi path tidak aman: ${name}`);
      if (pos + size > tar.length) throw new AppError('BAD_REQUEST', 'Paket aplikasi terpotong');
      out.set(name, Buffer.from(tar.subarray(pos, pos + size)));
    } else if (type !== '5') {
      throw new AppError('BAD_REQUEST', `Paket aplikasi berisi entri tidak didukung (${name})`);
    }
    pos += Math.ceil(size / BLOCK) * BLOCK;
  }
  throw new AppError('BAD_REQUEST', 'Paket aplikasi terpotong');
}
