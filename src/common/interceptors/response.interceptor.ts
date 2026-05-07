import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface IApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  timestamp: string;
}

type ResponseEnvelope = {
  data?: unknown;
  message?: string;
  total?: unknown;
  [key: string]: unknown;
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPaginatedEnvelope(
  value: unknown,
): value is ResponseEnvelope & { data: unknown[]; total: unknown } {
  return (
    isObjectRecord(value) &&
    Array.isArray(value.data) &&
    value.total !== undefined &&
    value.total !== null
  );
}

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((data: unknown) => {
        const envelope = isObjectRecord(data) ? data : undefined;
        const payload = isPaginatedEnvelope(data)
          ? data
          : envelope?.data !== undefined
            ? envelope.data
            : data;

        const response: IApiResponse = {
          success: true,
          message: typeof envelope?.message === 'string' ? envelope.message : 'Success',
          data: payload,
          timestamp: new Date().toISOString(),
        };

        if (typeof envelope?.message !== 'string') delete response.message;
        return response;
      }),
    );
  }
}
