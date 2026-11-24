import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Internasionalisasi (i18n) sisi Node: CLI, daemon (pesan error API), tray, dan file yang ditulis ke
 * folder prototype. Setiap bagian punya kamusnya sendiri lewat `defineMessages`; kunci Inggris wajib
 * sama dengan kunci Indonesia (dicek typecheck).
 *
 * Bahasa aktif (`getLocale`) = bahasa request yang sedang dilayani (lihat `withLocale`, dipasang per
 * request di server) atau, di luar request, bahasa proses (`setLocale`, dari pengaturan / OS).
 */
/**
 * Daftar bahasa yang didukung. Menambah bahasa: tambahkan entri di sini (dan di `web/i18n.js`), lalu
 * isi terjemahannya; typecheck menunjukkan setiap kamus `defineMessages` yang belum punya bahasa itu,
 * dan test/i18n.test.ts memeriksa kamus Web UI.
 *
 * - `aliases`: kode lain yang berarti bahasa ini (mis. `in` = kode lama bahasa Indonesia).
 * - `intl`: tag Intl untuk format tanggal/angka.
 */
export const LOCALE_INFO = {
  id: { name: 'Bahasa Indonesia', intl: 'id-ID', aliases: ['in'] },
  en: { name: 'English', intl: 'en-GB', aliases: [] },
} as const satisfies Record<string, { name: string; intl: string; aliases: readonly string[] }>;

export type Locale = keyof typeof LOCALE_INFO;
export const LOCALES = Object.keys(LOCALE_INFO) as Locale[];
/** Bahasa sumber: teks ditulis pertama kali dalam bahasa ini; cadangan terakhir bila terjemahan tidak ada. */
export const SOURCE_LOCALE: Locale = 'id';
/** Bahasa untuk pengguna yang bahasanya belum didukung (Inggris internasional). */
export const FALLBACK_LOCALE: Locale = 'en';
/** Pengaturan bahasa pengguna: `auto` = ikut bahasa browser/OS bila didukung, selain itu FALLBACK_LOCALE. */
export type LangSetting = 'auto' | Locale;
export const LANG_SETTINGS: readonly LangSetting[] = ['auto', ...LOCALES];

export type MessageParams = Record<string, string | number | boolean | null | undefined>;
/** Teks pesan; `{nama}` diganti parameter. Fungsi untuk pesan yang butuh logika (mis. jamak Inggris). */
export type Message = string | ((p: MessageParams) => string);

let processLocale: Locale = 'id';
const requestLocale = new AsyncLocalStorage<Locale>();

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && Object.hasOwn(LOCALE_INFO, v);
}

export function isLangSetting(v: unknown): v is LangSetting {
  return v === 'auto' || isLocale(v);
}

/** Bahasa aktif: bahasa request yang sedang dilayani, atau bahasa proses. */
export function getLocale(): Locale {
  return requestLocale.getStore() ?? processLocale;
}

/** Bahasa proses (pengaturan / OS), mengabaikan bahasa request. Dipakai untuk isi file yang awet (AGENTS.md). */
export function getProcessLocale(): Locale {
  return processLocale;
}

export function setLocale(locale: Locale): void {
  processLocale = locale;
}

/** Jalankan `fn` (beserta semua kelanjutan asinkronnya) dengan bahasa `locale`. */
export function withLocale<T>(locale: Locale, fn: () => T): T {
  return requestLocale.run(locale, fn);
}

/** Tag bahasa (BCP 47, mis. `id-ID`, `in`, `en-GB`) → Locale, atau undefined bila belum didukung. */
export function normalizeLocale(tag: string | null | undefined): Locale | undefined {
  const base = (tag ?? '').trim().toLowerCase().split(/[-_.@]/)[0] ?? '';
  if (isLocale(base)) return base;
  return LOCALES.find((l) => (LOCALE_INFO[l].aliases as readonly string[]).includes(base));
}

/**
 * Header Accept-Language → Locale: bahasa didukung pertama menurut urutan prioritas (q); bila tidak ada
 * → FALLBACK_LOCALE. undefined bila header kosong.
 */
export function parseAcceptLanguage(header: string | null | undefined): Locale | undefined {
  if (!header || !header.trim()) return undefined;
  const tags = header
    .split(',')
    .map((part, i) => {
      const [tag, ...rest] = part.trim().split(';');
      const q = rest.map((r) => /^\s*q\s*=\s*([\d.]+)\s*$/.exec(r)?.[1]).find(Boolean);
      return { tag: tag?.trim() ?? '', q: q === undefined ? 1 : Number(q), i };
    })
    .filter((t) => t.tag && t.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i);
  for (const t of tags) {
    const l = normalizeLocale(t.tag);
    if (l) return l;
  }
  return FALLBACK_LOCALE;
}

/** Bahasa OS: LC_ALL / LC_MESSAGES / LANG (Unix), lalu locale Intl (Windows: bahasa pengguna). */
export function detectSystemLocale(env: NodeJS.ProcessEnv = process.env, intlLocale?: string): Locale {
  for (const v of [env.LC_ALL, env.LC_MESSAGES, env.LANG]) {
    if (!v || v === 'C' || v === 'POSIX' || v.startsWith('C.')) continue;
    return normalizeLocale(v) ?? FALLBACK_LOCALE;
  }
  let tag = intlLocale;
  if (tag === undefined) {
    try {
      tag = Intl.DateTimeFormat().resolvedOptions().locale;
    } catch {
      tag = '';
    }
  }
  return normalizeLocale(tag) ?? FALLBACK_LOCALE;
}

/** Pengaturan → Locale. `auto` memakai `fallback` (mis. bahasa browser) atau bahasa OS. */
export function resolveLang(setting: LangSetting, fallback?: Locale, env: NodeJS.ProcessEnv = process.env): Locale {
  return setting === 'auto' ? (fallback ?? detectSystemLocale(env)) : setting;
}

/** Tag Intl untuk format tanggal/angka. */
export function intlTag(locale: Locale = getLocale()): string {
  return LOCALE_INFO[locale].intl;
}

export function formatMessage(msg: Message, params?: MessageParams): string {
  if (typeof msg === 'function') return msg(params ?? {});
  if (!params) return msg;
  return msg.replace(/\{(\w+)\}/g, (all, k: string) => (k in params ? String(params[k] ?? '') : all));
}

export type Translator<K extends string> = {
  (key: K, params?: MessageParams): string;
  /** Terjemahan dalam bahasa tertentu (bukan bahasa aktif). */
  in(locale: Locale, key: K, params?: MessageParams): string;
  readonly messages: { readonly [L in Locale]: Readonly<Record<K, Message>> };
};

/** Kamus satu bagian: semua bahasa di LOCALE_INFO wajib ada, dengan kunci persis sama seperti bahasa sumber. */
export type MessagesFor<K extends string> = { [L in typeof SOURCE_LOCALE]: Record<K, Message> } & {
  [L in Exclude<Locale, typeof SOURCE_LOCALE>]: NoInfer<Record<K, Message>>;
};

/**
 * Kamus satu bagian aplikasi. Kunci tiap bahasa wajib persis sama dengan bahasa sumber (`id`);
 * typecheck gagal bila ada bahasa/kunci yang hilang atau lebih. Bila saat runtime sebuah kunci tetap
 * kosong, cadangannya FALLBACK_LOCALE lalu SOURCE_LOCALE.
 *
 * ```ts
 * const t = defineMessages({
 *   id: { notFound: 'Prototype "{id}" tidak ditemukan' },
 *   en: { notFound: 'Prototype "{id}" not found' },
 * });
 * throw new AppError('NOT_FOUND', t('notFound', { id }));
 * ```
 */
export function defineMessages<const K extends string>(messages: MessagesFor<K>): Translator<K> {
  const all = messages as unknown as Record<Locale, Record<K, Message>>;
  const tr = ((key: K, params?: MessageParams) => tr.in(getLocale(), key, params)) as Translator<K>;
  tr.in = (locale, key, params) =>
    formatMessage(all[locale]?.[key] ?? all[FALLBACK_LOCALE]?.[key] ?? all[SOURCE_LOCALE][key] ?? key, params);
  (tr as { messages: unknown }).messages = messages;
  return tr;
}
