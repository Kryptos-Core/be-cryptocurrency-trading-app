import { randomUUID } from 'node:crypto';
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

export const CORRELATION_ID_HEADER = 'X-Request-ID';

/**
 * CorrelationIdMiddleware — injects a unique request ID into every HTTP request.
 *
 * 1. Reads X-Request-ID from incoming headers (from gateway / upstream).
 * 2. If absent, generates a new UUID v4.
 * 3. Sets the value back on the response headers so clients can correlate.
 * 4. Attaches to `request.correlationId` for use in guards/interceptors/services.
 *
 * Register in AppModule:
 * ```typescript
 * export class AppModule implements NestModule {
 *   configure(consumer: MiddlewareConsumer) {
 *     consumer.apply(CorrelationIdMiddleware).forRoutes('*');
 *   }
 * }
 * ```
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const existing = req.headers[CORRELATION_ID_HEADER.toLowerCase()];
    const correlationId = (Array.isArray(existing) ? existing[0] : existing) ?? randomUUID();

    // Attach to request for downstream use
    (req as any).correlationId = correlationId;

    // Echo back on response headers
    res.setHeader(CORRELATION_ID_HEADER, correlationId);

    next();
  }
}
