import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { UnauthorizedError } from '@common/errors';
import { RazorpaySignatureVerifier } from '../services/razorpay-signature.verifier';
import { RazorpayCredentialsService } from '../services/razorpay-credentials.service';

/**
 * Razorpay webhook signature guard. Verifies the
 * `x-razorpay-signature` header against HMAC_SHA256(webhook_secret, raw_body).
 *
 * Enforces a replay window using the `created_at` field of the parsed
 * envelope when present. Requires the raw body — enable via
 * `NestFactory.create(..., { rawBody: true })` in bootstrap.
 */
@Injectable()
export class RazorpayWebhookGuard implements CanActivate {
  private readonly logger = new Logger(RazorpayWebhookGuard.name);

  constructor(
    private readonly verifier: RazorpaySignatureVerifier,
    private readonly credentials: RazorpayCredentialsService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { rawBody?: Buffer }>();
    const secretConfigured = Boolean(this.credentials.webhookSecret());
    const nodeEnv = process.env.NODE_ENV ?? 'development';

    if (!secretConfigured) {
      if (nodeEnv === 'production') {
        throw new UnauthorizedError('RAZORPAY_WEBHOOK_SECRET is required in production');
      }
      this.logger.warn(
        'RAZORPAY_WEBHOOK_SECRET missing — accepting webhook in non-production (INSECURE)',
      );
      return true;
    }

    const signature = (req.headers['x-razorpay-signature'] as string | undefined) ?? '';
    if (!signature) throw new UnauthorizedError('Missing Razorpay signature header');

    const raw = req.rawBody;
    if (!raw || raw.length === 0) {
      throw new UnauthorizedError('Missing raw body for Razorpay webhook verification');
    }

    this.verifier.verifyWebhookSignature(raw, signature);
    this.checkReplayWindow(req);
    return true;
  }

  private checkReplayWindow(req: Request): void {
    const body = req.body as { created_at?: number } | undefined;
    const createdAt = typeof body?.created_at === 'number' ? body.created_at : undefined;
    if (!createdAt) return;
    const now = Math.floor(Date.now() / 1000);
    const window = this.credentials.replayWindowSeconds();
    if (Math.abs(now - createdAt) > window) {
      throw new UnauthorizedError('Razorpay webhook outside replay window');
    }
  }
}
