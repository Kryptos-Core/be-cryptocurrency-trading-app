import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
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
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => {
        const response: IApiResponse = {
          success: true,
          message: data?.message || 'Success',
          data: data?.data || data,
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
