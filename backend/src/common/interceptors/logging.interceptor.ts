import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { Observable, tap } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: Logger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const started = Date.now();

    return next.handle().pipe(
      tap({
        next: () =>
          this.logger.log(
            { method: req.method, url: req.url, durationMs: Date.now() - started },
            'HTTP',
          ),
        error: (err) =>
          this.logger.error(
            {
              method: req.method,
              url: req.url,
              durationMs: Date.now() - started,
              err: err?.message,
            },
            'HTTP-ERROR',
          ),
      }),
    );
  }
}
