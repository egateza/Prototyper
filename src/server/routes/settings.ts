import type { FastifyPluginAsync } from 'fastify';
import { AppError } from '../../core/errors.js';
import { defineMessages, isLangSetting, LANG_SETTINGS, type LangSetting, type Locale } from '../../core/i18n.js';
import { applyLangSetting, writeSettings, type LangState } from '../../core/settings.js';

const t = defineMessages({
  id: { badLang: 'Bahasa tidak dikenal: "{lang}" (pilihan: {choices})' },
  en: { badLang: 'Unknown language: "{lang}" (choices: {choices})' },
});

export interface SettingsResponse {
  lang: {
    setting: LangSetting;
    /** Bahasa daemon (auto → bahasa OS komputer ini). */
    locale: Locale;
    /** Bahasa respons untuk peminta ini (auto → bahasa browser/CLI peminta). */
    requestLocale: Locale;
    /** true bila PROTOTYPER_LANG menimpa pengaturan. */
    fromEnv: boolean;
  };
}

export const settingsRoutes: FastifyPluginAsync<{
  home: string;
  lang: () => LangState;
  /** Dipanggil setelah pengaturan bahasa berubah (mis. tulis ulang petunjuk agent). */
  onLangChange: (state: LangState, prev: LangState) => void;
}> = async (app, opts) => {
  const view = (requestLocale: Locale): SettingsResponse => ({ lang: { ...opts.lang(), requestLocale } });

  app.get('/settings', async (req) => view(req.locale));

  // Bukan bagian DEVICE_WRITES: hanya dari komputer ini.
  app.put('/settings', async (req) => {
    const body = (req.body ?? {}) as { lang?: unknown };
    if (body.lang !== undefined) {
      if (!isLangSetting(body.lang)) {
        throw new AppError('BAD_REQUEST', t('badLang', { lang: String(body.lang), choices: LANG_SETTINGS.join(', ') }));
      }
      const prev = opts.lang();
      await writeSettings(opts.home, { lang: body.lang });
      const next = applyLangSetting(opts.home);
      opts.onLangChange(next, prev);
      const requestLocale = next.setting === 'auto' ? req.locale : next.setting;
      return view(requestLocale);
    }
    return view(req.locale);
  });
};
