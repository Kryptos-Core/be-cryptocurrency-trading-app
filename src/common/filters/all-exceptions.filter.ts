import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppException } from '../exceptions';
import { DEFAULT_LOCALE, I18nService, Locale } from '../i18n';

interface ErrorResponseBody {
  statusCode: number;
  timestamp: string;
  path: string;
  message?: string | string[];
  code?: string;
  error?: string;
  context?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Global exception filter.
 *
 * Renders every `AppException`'s `code` through `I18nService.translateError`
 * using the locale resolved by `I18nService.localeMiddleware` (which is
 * installed in `main.ts`). The wire envelope shape is unchanged — the FE
 * already consumes `{ statusCode, code, message, context, timestamp, path }`,
 * the only difference is that `message` is now localized.
 *
 * For `HttpException` (e.g. validation, built-in Nest errors) the
 * `message` is left as-is when it's an array (validation field list); for
 * plain strings we still pass them through unchanged so behavior stays
 * consistent with the rest of the NestJS ecosystem.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly i18n: I18nService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { locale?: Locale }>();

    const locale: Locale = request.locale ?? DEFAULT_LOCALE;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ErrorResponseBody = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: this.i18n.translateError('INTERNAL_SERVER_ERROR', locale),
    };

    if (exception instanceof AppException) {
      status = exception.statusCode;
      body = {
        statusCode: exception.statusCode,
        code: exception.code,
        message: this.i18n.translateError(exception.code, locale, exception.context),
        timestamp: new Date().toISOString(),
        path: request.url,
        ...(exception.context && { context: exception.context }),
      };
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      body = {
        statusCode: status,
        timestamp: new Date().toISOString(),
        path: request.url,
        ...(typeof exceptionResponse === 'object'
          ? (exceptionResponse as Record<string, unknown>)
          : { message: exceptionResponse }),
      };
    } else if (exception instanceof Error) {
      this.logger.error(`Unhandled Exception: ${exception.message}`, exception.stack);
      body = {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: this.i18n.translateError('INTERNAL_SERVER_ERROR', locale),
        timestamp: new Date().toISOString(),
        path: request.url,
        ...(process.env.NODE_ENV === 'development' && { error: exception.message }),
      };
    }

    response.status(status).json(body);
  }
}