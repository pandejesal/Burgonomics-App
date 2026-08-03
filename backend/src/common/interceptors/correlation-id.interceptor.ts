import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { ulid } from 'ulid';
import { CORRELATION_ID_HEADER } from '@common/constants';
import { requestContextStorage } from '@common/context/request-context';

/**
 * Ensures every request has a correlation ID (header-provided or
 * generated) and stores the request context in AsyncLocalStorage so
 * downstream code (services, repos, outbound HTTP) can propagate it
 * without prop-drilling.
 */
@Injectable()
export class CorrelationIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();

    const incoming = req.headers?.[CORRELATION_ID_HEADER];
    const correlationId = typeof incoming === 'string' && incoming.length > 0 ? incoming : ulid();
    req.headers[CORRELATION_ID_HEADER] = correlationId;
    res.setHeader(CORRELATION_ID_HEADER, correlationId);

    return new Observable((subscriber) => {
      requestContextStorage.run(
        { correlationId, userId: req.user?.id, roles: req.user?.roles },
        () => {
          next.handle().subscribe({
            next: (v) => subscriber.next(v),
            error: (e) => subscriber.error(e),
            complete: () => subscriber.complete(),
          });
        },
      );
    });
  }
}
