import { promises as fs } from 'node:fs';
import path from 'node:path';

const IS_WIN = process.platform === 'win32';

/** Baca file JSON; `undefined` bila file tidak ada. BOM (umum di Windows) diabaikan. */
export async function readJsonFile<T>(file: string): Promise<T | undefined> {
  let raw: string;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
  return JSON.parse(raw.replace(/^﻿/, '')) as T;
}

/** Tulis JSON secara atomik: tulis ke file sementara lalu rename. */
export async function writeJsonAtomic(file: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  // Di Windows rename bisa gagal sesaat (EPERM/EBUSY) bila file sedang dibaca proses lain.
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(tmp, file);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (attempt >= 10 || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) {
        await fs.rm(tmp, { force: true });
        throw err;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  }
}

/** Bandingkan path; tidak peka huruf besar/kecil di Windows. */
export function samePath(a: string, b: string): boolean {
  const na = path.resolve(a);
  const nb = path.resolve(b);
  return IS_WIN ? na.toLowerCase() === nb.toLowerCase() : na === nb;
}

export async function isDirectory(p: string): Promise<boolean> {
  const st = await fs.stat(p).catch(() => null);
  return !!st?.isDirectory();
}

export async function fileExists(p: string): Promise<boolean> {
  const st = await fs.stat(p).catch(() => null);
  return !!st?.isFile();
}
