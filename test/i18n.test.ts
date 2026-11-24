import { readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  LOCALE_INFO,
  LOCALES,
  SOURCE_LOCALE,
  defineMessages,
  detectSystemLocale,
  getLocale,
  getProcessLocale,
  normalizeLocale,
  parseAcceptLanguage,
  setLocale,
  withLocale,
} from '../src/core/i18n.js';
import { applyLangSetting, argvHome, langState, readSettings, settingsFile, writeSettings } from '../src/core/settings.js';
import { buildApp } from '../src/server/app.js';
import { testConfig, tmpDir } from './helpers.js';

const t = defineMessages({
  id: { hello: 'Halo {name}', files: 'File' },
  en: { hello: 'Hello {name}', files: (p) => (p.n === 1 ? '1 file' : `${p.n} files`) },
});

describe('i18n inti', () => {
  afterEach(() => setLocale('id'));

  it('normalizeLocale & Accept-Language', () => {
    expect(normalizeLocale('id-ID')).toBe('id');
    expect(normalizeLocale('in')).toBe('id');
    expect(normalizeLocale('en_US.UTF-8')).toBe('en');
    expect(normalizeLocale('fr')).toBeUndefined();
    expect(parseAcceptLanguage('id-ID,id;q=0.9,en;q=0.8')).toBe('id');
    expect(parseAcceptLanguage('en-US,en;q=0.9,id;q=0.8')).toBe('en');
    expect(parseAcceptLanguage('fr-FR,id;q=0.5')).toBe('id'); // tag id/en pertama menang
    expect(parseAcceptLanguage('fr-FR, de')).toBe('en'); // bahasa lain → Inggris internasional
    expect(parseAcceptLanguage('id;q=0.2, en;q=0.9')).toBe('en');
    expect(parseAcceptLanguage('')).toBeUndefined();
  });

  it('bahasa OS dari env lalu Intl', () => {
    expect(detectSystemLocale({ LANG: 'id_ID.UTF-8' }, 'en-US')).toBe('id');
    expect(detectSystemLocale({ LANG: 'de_DE.UTF-8' }, 'id-ID')).toBe('en');
    expect(detectSystemLocale({ LANG: 'C.UTF-8' }, 'id-ID')).toBe('id');
    expect(detectSystemLocale({}, 'en-GB')).toBe('en');
    expect(detectSystemLocale({}, 'ja-JP')).toBe('en');
  });

  it('defineMessages: parameter, fungsi, bahasa request menimpa bahasa proses', async () => {
    setLocale('id');
    expect(t('hello', { name: 'Budi' })).toBe('Halo Budi');
    expect(t.in('en', 'files', { n: 2 })).toBe('2 files');
    const inner = await withLocale('en', async () => {
      await new Promise((r) => setTimeout(r, 1));
      return { msg: t('hello', { name: 'Ann' }), proc: getProcessLocale() };
    });
    expect(inner).toEqual({ msg: 'Hello Ann', proc: 'id' });
    expect(getLocale()).toBe('id');
  });
});

describe('pengaturan bahasa', () => {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.PROTOTYPER_LANG;
    delete process.env.PROTOTYPER_LANG;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.PROTOTYPER_LANG;
    else process.env.PROTOTYPER_LANG = saved;
    setLocale('id');
  });

  it('settings.json, PROTOTYPER_LANG, dan nilai rusak', async () => {
    const home = tmpDir();
    expect(readSettings(home)).toEqual({ lang: 'auto' });
    await writeSettings(home, { lang: 'en' });
    expect(applyLangSetting(home, {})).toEqual({ setting: 'en', locale: 'en', fromEnv: false });
    expect(getLocale()).toBe('en');
    expect(langState(home, { PROTOTYPER_LANG: 'ID' })).toEqual({ setting: 'id', locale: 'id', fromEnv: true });
    expect(langState(home, { PROTOTYPER_LANG: 'auto', LANG: 'id_ID' })).toEqual({ setting: 'auto', locale: 'id', fromEnv: true });
    writeFileSync(settingsFile(home), '{"lang":"xx"}');
    expect(readSettings(home).lang).toBe('auto');
    writeFileSync(settingsFile(home), 'bukan json');
    expect(readSettings(home).lang).toBe('auto');
  });

  it('argvHome membaca --home sebelum commander', () => {
    expect(argvHome(['node', 'cli', 'list', '--home', 'D:\\data'])).toBe('D:\\data');
    expect(argvHome(['node', 'cli', '--home=/tmp/x', 'list'])).toBe('/tmp/x');
    expect(argvHome(['node', 'cli', 'list'])).toBeUndefined();
  });

  it('API: bahasa per request, PUT /api/settings, dan health', async () => {
    const config = testConfig();
    await writeSettings(config.home, { lang: 'auto' });
    const { app } = await buildApp({ config: { ...config, autoSyncAgents: false } });
    try {
      // auto: ikut Accept-Language peminta, termasuk setelah body dibaca
      const badEn = await app.inject({ method: 'PUT', url: '/api/settings', headers: { 'accept-language': 'en-US' }, payload: { lang: 'xx' } });
      expect(badEn.statusCode).toBe(400);
      expect(badEn.json().error.message).toMatch(/^Unknown language/);
      const badId = await app.inject({ method: 'PUT', url: '/api/settings', headers: { 'accept-language': 'id-ID' }, payload: { lang: 'xx' } });
      expect(badId.json().error.message).toMatch(/^Bahasa tidak dikenal/);
      const nf = await app.inject({ method: 'GET', url: '/api/tidak-ada', headers: { 'accept-language': 'en' } });
      expect(nf.json().error.message).toMatch(/not found$/);

      const h = (await app.inject({ method: 'GET', url: '/api/health', headers: { 'accept-language': 'en' } })).json();
      expect(h.lang).toMatchObject({ setting: 'auto', requestLocale: 'en', fromEnv: false });

      // pengaturan id berlaku walau browser berbahasa Inggris
      const put = await app.inject({ method: 'PUT', url: '/api/settings', headers: { 'accept-language': 'en' }, payload: { lang: 'id' } });
      expect(put.statusCode).toBe(200);
      expect(put.json().lang).toEqual({ setting: 'id', locale: 'id', requestLocale: 'id', fromEnv: false });
      expect(readSettings(config.home).lang).toBe('id');
      expect(getProcessLocale()).toBe('id');
      const nf2 = await app.inject({ method: 'GET', url: '/api/tidak-ada', headers: { 'accept-language': 'en' } });
      expect(nf2.json().error.message).toMatch(/tidak ditemukan$/);
      const g = (await app.inject({ method: 'GET', url: '/api/settings' })).json();
      expect(g.lang.setting).toBe('id');
    } finally {
      await app.close();
    }
  });
});

describe('kamus Web UI', () => {
  it('daftar bahasa web/i18n.js sama dengan src/core/i18n.ts', async () => {
    const web = (await import(pathToFileURL(path.resolve('web', 'i18n.js')).href)) as { LOCALE_INFO: object; SOURCE_LOCALE: string };
    expect(web.LOCALE_INFO).toEqual(LOCALE_INFO);
    expect(web.SOURCE_LOCALE).toBe(SOURCE_LOCALE);
  });

  it('setiap web/locales/*.js punya semua bahasa dengan kunci yang sama seperti bahasa sumber', async () => {
    const dir = path.resolve('web', 'locales');
    let files: string[] = [];
    try {
      files = readdirSync(dir).filter((f) => f.endsWith('.js'));
    } catch {
      /* belum ada kamus */
    }
    for (const f of files) {
      const dict = ((await import(pathToFileURL(path.join(dir, f)).href)) as { default: Record<string, object> }).default;
      const source = Object.keys(dict[SOURCE_LOCALE] ?? {});
      for (const l of LOCALES) {
        const keys = Object.keys(dict[l] ?? {});
        expect({ file: f, locale: l, missing: source.filter((k) => !keys.includes(k)), extra: keys.filter((k) => !source.includes(k)) }).toEqual({
          file: f,
          locale: l,
          missing: [],
          extra: [],
        });
      }
    }
  });
});
