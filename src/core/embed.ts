import { promises as fs } from 'node:fs';
import type { Readable } from 'node:stream';
import path from 'node:path';
import { APP_DIR } from './appfiles.js';

/**
 * Skrip yang disisipkan ke halaman HTML prototype static. Skrip ini diam kecuali halaman dibuka
 * di pratinjau Web UI: lalu ia melaporkan path halaman dan, dalam mode komentar, elemen yang
 * diklik / teks yang diblok (lewat postMessage ke Web UI).
 */
export const EMBED_PATH = '/__prototyper/embed.js';
export const EMBED_TAG = `<script src="${EMBED_PATH}" defer></script>`;

const EMBED_FILE = path.join(APP_DIR, 'web', 'embed.js');

/** Isi embed.js (dibaca tiap request agar perubahan saat pengembangan langsung terpakai). */
export function readEmbedScript(): Promise<string> {
  return fs.readFile(EMBED_FILE, 'utf8');
}

/** Sisipkan tag skrip sebelum </body> terakhir (atau di akhir dokumen). Tidak dobel. */
export function injectEmbedTag(html: string): string {
  if (html.includes(EMBED_PATH)) return html;
  const i = html.toLowerCase().lastIndexOf('</body>');
  return i >= 0 ? `${html.slice(0, i)}${EMBED_TAG}${html.slice(i)}` : `${html}\n${EMBED_TAG}\n`;
}

/** Ubah payload onSend Fastify (string/Buffer/stream) menjadi teks. */
export async function payloadToString(payload: unknown): Promise<string | null> {
  if (typeof payload === 'string') return payload;
  if (Buffer.isBuffer(payload)) return payload.toString('utf8');
  if (payload && typeof (payload as Readable).on === 'function' && typeof (payload as Readable).pipe === 'function') {
    const chunks: Buffer[] = [];
    for await (const chunk of payload as Readable) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
    return Buffer.concat(chunks).toString('utf8');
  }
  return null;
}
