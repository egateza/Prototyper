// i18n Web UI (tanpa build step). Kamus per bagian ada di web/locales/*.js, masing-masing
// `export default { id: {...}, en: {...}, ... }`: satu objek per bahasa di LOCALE_INFO dengan kunci yang
// sama seperti bahasa sumber (dicek test/i18n.test.ts).
//
// Bahasa: pengaturan daemon (/api/health → lang.setting) berlaku untuk semua; `auto` = bahasa browser
// bila didukung, selain itu FALLBACK_LOCALE. Bahasa terakhir disimpan di localStorage agar halaman
// berikutnya langsung tampil dalam bahasa yang benar tanpa menunggu health.

/**
 * Bahasa yang didukung; selaras dengan LOCALE_INFO di src/core/i18n.ts (dicek tes). Menambah bahasa:
 * tambahkan entri di kedua tempat, lalu isi terjemahan di setiap kamus web/locales/*.js.
 * `name` = nama bahasa dalam bahasa itu sendiri (untuk pemilih bahasa).
 */
export const LOCALE_INFO = {
  id: { name: 'Bahasa Indonesia', intl: 'id-ID', aliases: ['in'] },
  en: { name: 'English', intl: 'en-GB', aliases: [] },
};
export const LOCALES = Object.keys(LOCALE_INFO);
export const SOURCE_LOCALE = 'id';
export const FALLBACK_LOCALE = 'en';
const STORE_KEY = 'prototyper:lang';
const dicts = Object.fromEntries(LOCALES.map((l) => [l, {}]));

export const isLocale = (v) => typeof v === 'string' && Object.hasOwn(LOCALE_INFO, v);

/** Tag bahasa (BCP 47) → kode bahasa didukung, atau undefined. */
export function normalizeLocale(tag) {
  const base = String(tag ?? '').trim().toLowerCase().split(/[-_]/)[0];
  if (isLocale(base)) return base;
  return LOCALES.find((l) => LOCALE_INFO[l].aliases.includes(base));
}

/** Bahasa browser: bahasa didukung pertama di navigator.languages; selain itu FALLBACK_LOCALE. */
export function browserLocale(langs = globalThis.navigator?.languages ?? [globalThis.navigator?.language]) {
  for (const l of langs ?? []) {
    const n = normalizeLocale(l);
    if (n) return n;
  }
  return FALLBACK_LOCALE;
}

/** Pengaturan ('auto' atau kode bahasa) → bahasa tampilan. */
export function resolveLocale(setting) {
  return isLocale(setting) ? setting : browserLocale();
}

function storedLocale() {
  try {
    return normalizeLocale(localStorage.getItem(STORE_KEY));
  } catch {
    return undefined;
  }
}

let locale = storedLocale() ?? browserLocale();

export function getLocale() {
  return locale;
}

/** Ganti bahasa tampilan. true bila berubah (pemanggil perlu merender ulang). */
export function setLocale(next) {
  const l = normalizeLocale(next) ?? FALLBACK_LOCALE;
  try {
    localStorage.setItem(STORE_KEY, l);
  } catch {
    /* mode privat */
  }
  if (l === locale) return false;
  locale = l;
  if (typeof document !== 'undefined') document.documentElement.lang = l;
  return true;
}

/** Daftarkan kamus `{ id: {...}, en: {...}, ... }`. */
export function register(messages) {
  for (const l of LOCALES) Object.assign(dicts[l], messages[l] ?? {});
}

/**
 * Terjemahkan kunci; `{nama}` diganti params. Nilai kamus boleh fungsi `(params) => string`
 * (mis. bentuk jamak). Kunci yang tidak ada → FALLBACK_LOCALE → bahasa sumber → kunci itu sendiri.
 */
export function t(key, params) {
  const msg = dicts[locale][key] ?? dicts[FALLBACK_LOCALE][key] ?? dicts[SOURCE_LOCALE][key] ?? key;
  if (typeof msg === 'function') return msg(params ?? {});
  if (!params) return msg;
  return msg.replace(/\{(\w+)\}/g, (all, k) => (k in params ? String(params[k] ?? '') : all));
}

/** Tag Intl untuk tanggal/angka: varian browser bila bahasanya sama (mis. en-US), selain itu LOCALE_INFO.intl. */
export function intlTag() {
  const nav = globalThis.navigator?.language ?? '';
  return normalizeLocale(nav) === locale && nav.includes('-') ? nav : LOCALE_INFO[locale].intl;
}

/**
 * Terjemahkan HTML statis: `data-i18n` (textContent), `data-i18n-html` (innerHTML, hanya untuk teks
 * kamus tepercaya), dan `data-i18n-title` / `-placeholder` / `-aria-label` / `-alt` (atribut).
 */
export function applyDom(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
  for (const [attr, ds] of [['title', 'i18nTitle'], ['placeholder', 'i18nPlaceholder'], ['aria-label', 'i18nAriaLabel'], ['alt', 'i18nAlt']]) {
    for (const el of root.querySelectorAll(`[data-${attr === 'aria-label' ? 'i18n-aria-label' : `i18n-${attr}`}]`)) {
      el.setAttribute(attr, t(el.dataset[ds]));
    }
  }
}

if (typeof document !== 'undefined') document.documentElement.lang = locale;
