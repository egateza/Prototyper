import { readFileSync } from 'node:fs';
import path from 'node:path';
import { writeJsonAtomic } from './fsutil.js';
import { isLangSetting, resolveLang, setLocale, type LangSetting, type Locale } from './i18n.js';

/** Pengaturan pengguna yang dipakai bersama CLI, daemon, dan tray: `<home>/settings.json`. */
export interface Settings {
  lang: LangSetting;
}

export const DEFAULT_SETTINGS: Settings = { lang: 'auto' };

export function settingsFile(home: string): string {
  return path.join(home, 'settings.json');
}

/** Baca pengaturan (sinkron: dipakai CLI sebelum perintah diurai). Nilai rusak/tidak dikenal → default. */
export function readSettings(home: string): Settings {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(settingsFile(home), 'utf8').replace(/^﻿/, ''));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return { lang: isLangSetting(r.lang) ? r.lang : DEFAULT_SETTINGS.lang };
}

export async function writeSettings(home: string, patch: Partial<Settings>): Promise<Settings> {
  const next = { ...readSettings(home), ...patch };
  await writeJsonAtomic(settingsFile(home), next);
  return next;
}

export interface LangState {
  /** Pengaturan efektif (PROTOTYPER_LANG menimpa settings.json). */
  setting: LangSetting;
  /** Bahasa proses hasil pengaturan (auto → bahasa OS). */
  locale: Locale;
  /** true bila ditentukan PROTOTYPER_LANG, sehingga pengaturan di settings.json tidak berlaku. */
  fromEnv: boolean;
}

/** Pengaturan bahasa efektif: PROTOTYPER_LANG (auto|id|en) > settings.json > auto. */
export function langState(home: string, env: NodeJS.ProcessEnv = process.env): LangState {
  const e = env.PROTOTYPER_LANG?.trim().toLowerCase();
  const fromEnv = isLangSetting(e);
  const setting: LangSetting = fromEnv ? e : readSettings(home).lang;
  return { setting, locale: resolveLang(setting, undefined, env), fromEnv };
}

/** Tetapkan bahasa proses dari pengaturan; dipanggil saat CLI/daemon/tray mulai dan setelah pengaturan diubah. */
export function applyLangSetting(home: string, env: NodeJS.ProcessEnv = process.env): LangState {
  const s = langState(home, env);
  setLocale(s.locale);
  return s;
}

/** Nilai --home dari argv mentah (sebelum commander mengurai), agar CLI bisa membaca settings.json lebih awal. */
export function argvHome(argv: readonly string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--home') return argv[i + 1];
    if (a.startsWith('--home=')) return a.slice('--home='.length);
  }
  return undefined;
}
