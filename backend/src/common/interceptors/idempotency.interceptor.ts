import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { IDEMPOTENT_KEY } from '@common/decorators/idempotent.decorator';
import { IDEMPOTENCY_KEY_HEADER } from '@common/constants';
import { ValidationError } from '@common/errors';

/**
 * Enforces the presence of an `Idempotency-Key` header on any handler
 * marked with `@Idempotent()`. Storage-backed dedup is implemented in
 * the AuthModule/CheckoutModule Phase 2 rollout.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const required = this.reflector.getAllAndOverride<boolean>(IDEMPOTENT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required) {
      const req = context.switchToHttp().getRequest();
      const key = req.headers?.[IDEMPOTENCY_KEY_HEADER];
      if (!key || typeof key !== 'string') {
        throw new ValidationError('Missing Idempotency-Key header');
      }
    }
    return next.handle();
  }
}
