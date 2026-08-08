/**
 * DomainErrorFilter - Maps DomainError to HTTP response.
 *
 * Registered via APP_FILTER in any module. Use NestJS Catch + ExceptionFilter.
 *
 * - On DomainError: serialize toResponseJSON() with this.httpStatus.
 * - On other errors: pass to next handler (built-in NestJS handler).
 */
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { DomainError } from '../errors/domain-error.base';

@Catch()
export class DomainErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (exception instanceof DomainError) {
      this.logger.warn({
        path: request.url,
        method: request.method,
        code: exception.code,
        internalMessage: exception.internalMessage,
        metadata: exception.metadata,
        cause: exception.cause,
      });

      response.status(exception.httpStatus).json({
        success: false,
        error: exception.toResponseJSON(),
        timestamp: new Date().toISOString(),
        path: request.url,
      });
      return;
    }

    if (exception instanceof HttpException) {
      // Pass through — NestJS built-in handler will execute.
      // We rethrow so the framework's default filter renders it.
      // Implementation note: if multiple filters are registered, the
      // order in APP_FILTER matters. Built-in handlers run last.
      const status = exception.getStatus();
      response.status(status).json({
        success: false,
        error: {
          code: 'HTTP/EXCEPTION',
          message: exception.message,
        },
        timestamp: new Date().toISOString(),
        path: request.url,
      });
      return;
    }

    // Unhandled error — log full context, never leak to client.
    this.logger.error({
      path: request.url,
      method: request.method,
      message: 'Unhandled exception',
      exception: exception instanceof Error ? {
        name: exception.name,
        message: exception.message,
        stack: exception.stack,
      } : exception,
    });

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: {
        code: 'INTERNAL/UNEXPECTED',
        message: 'An unexpected error occurred. Please try again.',
      },
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
