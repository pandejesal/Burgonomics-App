import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { CORRELATION_ID_HEADER } from '@common/constants';

/**
 * Wraps every successful response in a uniform envelope:
 *   { success, timestamp, correlationId, data }
 *
 * Handlers returning a raw `Response` (e.g. SSE, streams) are passed
 * through untouched.
 */
@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const correlationId = req.headers?.[CORRELATION_ID_HEADER];

    return next.handle().pipe(
      map((data) => {
        if (data == null || typeof data === 'string' || Buffer.isBuffer(data)) return data;
        if (typeof data === 'object' && 'pipe' in (data as object)) return data;
        return {
          success: true,
          timestamp: new Date().toISOString(),
          correlationId,
          data,
        };
      }),
    );
  }
}
