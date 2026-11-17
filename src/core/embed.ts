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
/** Tag skrip dengan live-reload aktif (embed.js membaca atribut data-livereload). */
export const EMBED_TAG_LIVE = `<script src="${EMBED_PATH}" data-livereload defer></script>`;

const EMBED_FILE = path.join(APP_DIR, 'web', 'embed.js');

/** Isi embed.js (dibaca tiap request agar perubahan saat pengembangan langsung terpakai). */
export function readEmbedScript(): Promise<string> {
  return fs.readFile(EMBED_FILE, 'utf8');
}

/** Sisipkan tag skrip sebelum </body> terakhir (atau di akhir dokumen). Tidak dobel. */
export function injectEmbedTag(html: string, opts: { liveReload?: boolean } = {}): string {
  if (html.includes(EMBED_PATH)) return html;
  const tag = opts.liveReload ? EMBED_TAG_LIVE : EMBED_TAG;
  const i = html.toLowerCase().lastIndexOf('</body>');
  return i >= 0 ? `${html.slice(0, i)}${tag}${html.slice(i)}` : `${html}\n${tag}\n`;
}

export const VIEWPORT_META = '<meta name="viewport" content="width=device-width, initial-scale=1">';

/**
 * Sisipkan meta viewport bila halaman belum punya. Tanpa meta ini browser HP merender dengan lebar
 * virtual ±980px, sehingga media query mobile tidak aktif (padahal di pratinjau perangkat Web UI aktif,
 * karena iframe-nya memang selebar perangkat). Diletakkan tepat setelah `<head>`, lalu `<html>`, lalu
 * setelah doctype, atau di awal dokumen.
 */
export function injectViewportMeta(html: string): string {
  // komentar HTML (mis. meta viewport yang dinonaktifkan) diabaikan; diganti spasi agar indeks tetap sama
  const code = html.replace(/<!--[\s\S]*?(?:-->|$)/g, (c) => ' '.repeat(c.length));
  if (/<meta\b[^>]*\bname\s*=\s*["']?viewport\b/i.test(code)) return html;
  for (const re of [/<head\b[^>]*>/i, /<html\b[^>]*>/i, /<!doctype\b[^>]*>/i]) {
    const m = re.exec(code);
    if (m) {
      const at = m.index + m[0].length;
      return `${html.slice(0, at)}\n${VIEWPORT_META}${html.slice(at)}`;
    }
  }
  return `${VIEWPORT_META}\n${html}`;
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
