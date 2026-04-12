import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Response Interceptor - Transform response according to standard
 * Applicable: Decorator Pattern & Cross-Cutting Concern
 */
export interface IApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  timestamp: string;
}

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => {
        /**
         * Paginated handlers return `{ data: T[], total, page, limit }`.
         * Using only `data.data` would drop `total` and break clients that read pagination from the envelope.
         */
        const isPaginatedEnvelope = (d: any): boolean =>
          d &&
          typeof d === 'object' &&
          !Array.isArray(d) &&
          Array.isArray(d.data) &&
          d.total !== undefined &&
          d.total !== null;

        const payload = isPaginatedEnvelope(data)
          ? data
          : data?.data !== undefined
            ? data.data
            : data;

        const response: IApiResponse = {
          success: true,
          message: data?.message || 'Success',
          data: payload,
          timestamp: new Date().toISOString(),
        };

        // Remove messages if unnecessary.
        if (!data?.message) {
          delete response.message;
        }

        return response;
      }),
    );
  }
}
