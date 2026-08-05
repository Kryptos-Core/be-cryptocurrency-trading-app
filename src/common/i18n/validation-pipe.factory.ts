import { ValidationError, ValidationPipe } from '@nestjs/common';
import type { Request } from 'express';
import { ValidationException } from '../exceptions';
import { DEFAULT_LOCALE, I18nService, Locale } from '../i18n';
import { requestLocaleStore } from './i18n.service';

/**
 * Build a class-validator-aware `exceptionFactory` for the global
 * `ValidationPipe`. Translates each constraint name (e.g. `minLength`,
 * `isEmail`) using `I18nService.translateValidationConstraint` against
 * the request's resolved locale.
 *
 * The returned `ValidationException` carries the per-field issue list in
 * its `context` so the FE can render field-level errors if it wants,
 * and a single translated top-level message.
 *
 * The request locale is read from the shared `requestLocaleStore` (defined
 * in `i18n.service.ts`). That store is populated by `I18nService.localeMiddleware`
 * via `requestLocaleStore.run({ locale }, () => next())` — the same store
 * must be used here, otherwise the pipe would always see `undefined`.
 */
export function buildValidationPipeOptions(
  i18n: I18nService,
  baseOptions: Partial<ConstructorParameters<typeof ValidationPipe>[0]> = {},
): ConstructorParameters<typeof ValidationPipe>[0] {
  return {
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
    ...baseOptions,
    exceptionFactory: (errors: ValidationError[]) => {
      const locale = requestLocaleStore.getStore()?.locale ?? DEFAULT_LOCALE;
      return buildValidationException(errors, i18n, locale);
    },
  };
}

/**
 * Convert an array of class-validator errors into a `ValidationException`
 * with localized messages. Pure function so it can be tested directly.
 */
export function buildValidationException(
  errors: ValidationError[],
  i18n: I18nService,
  locale: Locale = DEFAULT_LOCALE,
): ValidationException {
  const issues = errors.flatMap((err) => mapError(err, locale, i18n));
  const topLevel = i18n.translate('VALIDATION_ERROR', locale) ?? 'Validation failed.';
  return new ValidationException(topLevel, 'VALIDATION_ERROR', { issues });
}

function mapError(
  err: ValidationError,
  locale: Locale,
  i18n: I18nService,
  parentPath?: string,
): Array<{ field: string; constraints: Record<string, string> }> {
  const fieldPath = parentPath ? `${parentPath}.${err.property}` : err.property;
  if (!err.constraints) {
    return err.children?.flatMap((child) => mapError(child, locale, i18n, fieldPath)) ?? [];
  }
  const rendered: Record<string, string> = {};
  for (const [name, original] of Object.entries(err.constraints)) {
    rendered[name] = i18n.translateValidationConstraint(name, locale, {
      value: original,
    });
  }
  return [{ field: fieldPath, constraints: rendered }];
}

/**
 * Re-export so consumers can write
 *   `app.useGlobalPipes(buildValidationPipe(i18n))`.
 */
export const buildValidationPipe = (i18n: I18nService): ValidationPipe =>
  new ValidationPipe(buildValidationPipeOptions(i18n));

/** Helper for tests / future callers that already have a Request. */
export function getLocaleFromRequest(req: Request & { locale?: Locale }): Locale {
  return req.locale ?? DEFAULT_LOCALE;
}