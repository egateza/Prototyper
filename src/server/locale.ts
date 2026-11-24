import { AsyncResource } from 'node:async_hooks';
import type { FastifyInstance } from 'fastify';
import { parseAcceptLanguage, withLocale, type Locale } from '../core/i18n.js';
import type { LangState } from '../core/settings.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Bahasa respons request ini (pesan error dll.). */
    locale: Locale;
  }
}

const SCOPE = Symbol('prototyper.localeScope');
type Scoped = { [SCOPE]?: AsyncResource };

/**
 * Bahasa per request: pengaturan id/en berlaku untuk semua; pada `auto` ikut Accept-Language peminta
 * (browser, atau CLI yang mengirim bahasanya), lalu bahasa OS. Didaftarkan sebelum hook lain agar
 * pesan error dari hook (mis. hak akses) ikut diterjemahkan.
 *
 * Konteks AsyncLocalStorage dibuka di onRequest dan dipulihkan di preValidation (setelah body dibaca,
 * kelanjutan asinkron bisa kehilangan konteks), seperti @fastify/request-context.
 */
export function registerRequestLocale(app: FastifyInstance, lang: () => LangState): void {
  app.decorateRequest('locale', 'id');
  app.addHook('onRequest', (req, _reply, done) => {
    const s = lang();
    const locale = s.setting === 'auto' ? (parseAcceptLanguage(req.headers['accept-language']) ?? s.locale) : s.setting;
    req.locale = locale;
    withLocale(locale, () => {
      (req as Scoped)[SCOPE] = new AsyncResource('prototyper-locale');
      done();
    });
  });
  app.addHook('preValidation', (req, _reply, done) => {
    const scope = (req as Scoped)[SCOPE];
    if (scope) scope.runInAsyncScope(done, req.raw);
    else done();
  });
}
