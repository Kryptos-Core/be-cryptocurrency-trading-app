import { Injectable, Logger } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  DEFAULT_LOCALE,
  ERROR_MESSAGES,
  FIELD_VALIDATION_MESSAGES,
  MAIL_MESSAGES,
  MsgEntry,
  NOTIFICATION_MESSAGES,
  SUCCESS_MESSAGES,
  SUPPORTED_LOCALES,
  VALIDATION_MESSAGES,
  catalogStats,
} from './messages';
import type { Locale } from './messages';

/**
 * Per-request AsyncLocalStorage so anywhere downstream of `localeMiddleware`
 * can read the resolved locale — including the global `ValidationPipe`
 * which runs after the middleware but outside the request handler context.
 *
 * Exported (rather than file-private) so `validation-pipe.factory.ts` can
 * read from the same instance the middleware writes to. Two separate
 * `AsyncLocalStorage` objects in different files would each see their own
 * `undefined` because they don't share the slot table.
 */
export const requestLocaleStore = new AsyncLocalStorage<{ locale: Locale }>();

/**
 * I18nService — single BE-side renderer for every user-facing string.
 *
 * Lookups consult one of the maps in `messages.ts` and render the
 * `en` or `vi` text with `{varName}` placeholders interpolated from the
 * provided `context`. Missing keys never throw at runtime: callers fall back
 * to the key itself (or a stable English default) so the API stays alive
 * even when the catalog is incomplete.
 *
 * `validateCatalog()` is called once at boot from `main.ts`. It fails fast
 * if any entry is missing either locale, so missing translations cannot
 * ship to production unnoticed.
 */
@Injectable()
export class I18nService {
  private readonly logger = new Logger(I18nService.name);

  /**
   * Normalise an incoming locale string (e.g. from `Accept-Language` or
   * `?lang=`) to one of the supported `Locale` values. Anything unknown
   * falls back to `DEFAULT_LOCALE`.
   */
  resolveLocale(input?: string | null): Locale {
    if (!input) return DEFAULT_LOCALE;
    const lower = input.toLowerCase().split(/[;,]/)[0]?.trim();
    if (!lower) return DEFAULT_LOCALE;
    if (SUPPORTED_LOCALES.includes(lower as Locale)) {
      return lower as Locale;
    }
    return DEFAULT_LOCALE;
  }

  /**
   * Render an `AppException` `code` (e.g. `EMAIL_EXISTS`) into the requested
   * locale. Falls back to the English text if the code is unknown, and to
   * the code itself if even the English text is missing (defensive).
   */
  translateError(
    code: string,
    locale: Locale = DEFAULT_LOCALE,
    context?: Record<string, unknown>,
  ): string {
    const entry = ERROR_MESSAGES[code];
    if (!entry) {
      this.logger.warn(`translateError: unknown code "${code}"`);
      return code;
    }
    return this.interpolate(entry[locale] ?? entry.en, context);
  }

  /**
   * Render a generic key (validation/success/mail/notification). Pass the
   * domain prefix or rely on the caller's exact key. The function searches
   * all four maps; the first hit wins.
   */
  translate(
    key: string,
    locale: Locale = DEFAULT_LOCALE,
    context?: Record<string, unknown>,
  ): string {
    const entry: MsgEntry | undefined =
      FIELD_VALIDATION_MESSAGES[key] ??
      VALIDATION_MESSAGES[key] ??
      SUCCESS_MESSAGES[key] ??
      MAIL_MESSAGES[key] ??
      NOTIFICATION_MESSAGES[key];
    if (!entry) {
      this.logger.warn(`translate: unknown key "${key}"`);
      return key;
    }
    return this.interpolate(entry[locale] ?? entry.en, context);
  }

  /**
   * Lookup a `class-validator` constraint name (e.g. `minLength`) and
   * render with the provided constraint parameters. Falls back to the
   * class-validator default English text when neither the constraint nor
   * the field override is registered.
   */
  translateValidationConstraint(
    constraintName: string,
    locale: Locale,
    constraintArgs?: Record<string, unknown>,
  ): string {
    const entry = VALIDATION_MESSAGES[constraintName];
    if (!entry) return constraintName;
    return this.interpolate(entry[locale] ?? entry.en, constraintArgs);
  }

  /** Express middleware that resolves the locale and attaches it to the request. */
  localeMiddleware() {
    return (req: Request, _res: Response, next: NextFunction): void => {
      const fromQuery = typeof req.query?.lang === 'string' ? req.query.lang : undefined;
      const fromHeader = this.parseAcceptLanguage(req.headers['accept-language']);
      const locale = this.resolveLocale(fromQuery ?? fromHeader);
      (req as Request & { locale?: Locale }).locale = locale;
      // Continue inside the AsyncLocalStorage scope so the ValidationPipe
      // factory can pull the same locale via `requestLocaleStore.get()`.
      requestLocaleStore.run({ locale }, () => next());
    };
  }

  /** Read the locale resolved for the current request, if any. */
  currentLocale(): Locale | undefined {
    return requestLocaleStore.getStore()?.locale;
  }

  /**
   * Boot-time validation — fails fast if any catalog entry is missing
   * `en` or `vi`. Called once from `main.ts` after `NestFactory.create`.
   */
  validateCatalog(): void {
    const missing: string[] = [];
    const check = (label: string, map: Record<string, { en?: unknown; vi?: unknown }>) => {
      for (const [key, entry] of Object.entries(map)) {
        if (typeof entry.en !== 'string' || typeof entry.vi !== 'string') {
          missing.push(`${label}.${key}`);
        }
      }
    };
    check('ERROR_MESSAGES', ERROR_MESSAGES as unknown as Record<string, { en?: unknown; vi?: unknown }>);
    check('VALIDATION_MESSAGES', VALIDATION_MESSAGES);
    check('FIELD_VALIDATION_MESSAGES', FIELD_VALIDATION_MESSAGES);
    check('SUCCESS_MESSAGES', SUCCESS_MESSAGES);
    check('MAIL_MESSAGES', MAIL_MESSAGES);
    check('NOTIFICATION_MESSAGES', NOTIFICATION_MESSAGES);

    if (missing.length > 0) {
      const message = `i18n catalog has ${missing.length} entries missing en/vi: ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? '…' : ''}`;
      this.logger.error(message);
      throw new Error(message);
    }

    const stats = catalogStats();
    this.logger.log(
      `i18n catalog OK — errors=${stats.errors}, validation=${stats.validation}, ` +
        `fieldValidation=${stats.fieldValidation}, success=${stats.success}, ` +
        `mail=${stats.mail}, notifications=${stats.notifications}`,
    );
  }

  /** Parse `Accept-Language` header into the highest-priority supported locale. */
  private parseAcceptLanguage(header?: string | string[]): string | undefined {
    if (!header) return undefined;
    const raw = Array.isArray(header) ? header.join(',') : header;
    const parts = raw.split(',').map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const qParam = params.find((p) => p.startsWith('q='));
      const q = qParam ? parseFloat(qParam.slice(2)) : 1;
      return { tag: tag?.toLowerCase() ?? '', q: Number.isFinite(q) ? q : 1 };
    });
    parts.sort((a, b) => b.q - a.q);
    return parts[0]?.tag;
  }

  /**
   * Replace `{varName}` placeholders with values from the context map.
   * Unknown placeholders are left as-is so mis-renders are easy to spot.
   */
  private interpolate(template: string, context?: Record<string, unknown>): string {
    if (!template || !context) return template;
    return template.replace(/\{(\w+)\}/g, (match, key: string) => {
      const value = context[key];
      if (value === undefined || value === null) return match;
      return String(value);
    });
  }
}