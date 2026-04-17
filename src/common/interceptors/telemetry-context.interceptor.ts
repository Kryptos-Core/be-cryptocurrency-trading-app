import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { trace } from '@opentelemetry/api';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * Enriches the active HTTP span (when OTel auto-instrumentation is on) with
 * `http.route` context and `correlation.id` from {@link CorrelationIdMiddleware}.
 */
@Injectable()
export class TelemetryContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<{ method?: string; route?: { path?: string } }>();
    const correlationId = (req as { correlationId?: string }).correlationId;
    const routePath = req.route?.path ?? req.method;

    const span = trace.getActiveSpan();
    if (span) {
      if (correlationId) {
        span.setAttribute('correlation.id', correlationId);
      }
      if (routePath) {
        span.setAttribute('app.http.route', String(routePath));
      }
    }

    return next.handle().pipe(
      tap({
        error: (err: unknown) => {
          const s = trace.getActiveSpan();
          if (s && err instanceof Error) {
            s.recordException(err);
          }
        },
      }),
    );
  }
}
