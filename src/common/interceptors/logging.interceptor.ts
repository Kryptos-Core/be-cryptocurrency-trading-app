import {
  type CallHandler,
  type ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AppException } from '../exceptions';

/**
 * Logging Interceptor - Log incoming requests and responses
 * Applicable: Cross-Cutting Concern
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  private errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
  }

  /** 4xx / known business errors — avoid ERROR level noise in ops logs. */
  private isExpectedClientOrBusinessError(error: unknown): boolean {
    if (error instanceof AppException && error.statusCode < 500) return true;
    if (error instanceof HttpException) {
      const status = error.getStatus();
      return status >= 400 && status < 500;
    }
    return false;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const { method, originalUrl, ip } = request;
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          this.logger.log(`${method} ${originalUrl} - ${ip} - ${duration}ms`);
        },
        error: (error: unknown) => {
          const duration = Date.now() - startTime;
          const msg = `${method} ${originalUrl} - ${ip} - ${duration}ms - ${this.errorMessage(error)}`;
          if (this.isExpectedClientOrBusinessError(error)) {
            this.logger.warn(msg);
          } else {
            this.logger.error(msg);
          }
        },
      }),
    );
  }
}
