import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';

export const SKIP_ETAG = 'cache:skip-etag';

/**
 * EtagInterceptor
 * Adds a strong ETag header derived from the JSON response body so the FE
 * SWR cache can issue `If-None-Match` requests and receive `304 Not Modified`.
 *
 * The ETag is intentionally cheap to compute (sha1 of canonical JSON) and
 * only applied to GET responses — mutations continue to return full bodies.
 *
 * Decorator `@SkipEtag()` opts a controller method out (e.g. realtime-only
 * endpoints, large binary payloads).
 */
@Injectable()
export class EtagInterceptor implements NestInterceptor {
  private readonly logger = new Logger(EtagInterceptor.name);

  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_ETAG, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) {
      return next.handle();
    }

    const http = context.switchToHttp();
    const req = http.getRequest();
    if (req?.method && req.method !== 'GET') {
      return next.handle();
    }

    return next.handle().pipe(
      map((body: unknown) => {
        if (body === null || body === undefined) {
          return body;
        }
        try {
          const etag = this.computeEtag(body);
          const res = http.getResponse();
          if (res && typeof res.setHeader === 'function' && !res.headersSent) {
            res.setHeader('ETag', etag);
            res.setHeader('Cache-Control', 'private, must-revalidate, max-age=0');
          }
          const ifNoneMatch = req?.headers?.['if-none-match'];
          if (ifNoneMatch && String(ifNoneMatch) === etag && !res.headersSent) {
            res.status(304);
            return null;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.debug(`ETag computation skipped: ${msg}`);
        }
        return body;
      }),
    );
  }

  private computeEtag(body: unknown): string {
    const json = JSON.stringify(body);
    const hash = createHash('sha1').update(json).digest('hex');
    return `"${hash}"`;
  }
}

import { SetMetadata } from '@nestjs/common';

export const SkipEtag = (): MethodDecorator & ClassDecorator =>
  SetMetadata(SKIP_ETAG, true);
