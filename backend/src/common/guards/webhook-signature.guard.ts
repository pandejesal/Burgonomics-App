import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { UnauthorizedError } from '@common/errors';

/**
 * Contract-only guard. Concrete signature verification is provided by
 * per-integration guards (Petpooja, Razorpay) that extend this class.
 */
@Injectable()
export abstract class WebhookSignatureGuard implements CanActivate {
  abstract verify(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): boolean;

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const raw: Buffer | undefined = req.rawBody;
    if (!raw) throw new UnauthorizedError('Missing raw body for signature verification');
    if (!this.verify(raw, req.headers)) throw new UnauthorizedError('Invalid webhook signature');
    return true;
  }
}
