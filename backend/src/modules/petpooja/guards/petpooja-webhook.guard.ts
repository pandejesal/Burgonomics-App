import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '@config/app.config';
import { UnauthorizedError } from '@common/errors';
import { PetpoojaCredentialsService } from '../services/petpooja-credentials.service';

/**
 * PETPOOJA webhook signature guard.
 *
 * PETPOOJA does not publicly document a canonical signature header in
 * the integration guide, so this guard supports two schemes,
 * selectable per-deployment:
 *
 *   1. Bearer secret in `x-petpooja-secret` header (default; fastest to
 *      configure with PETPOOJA operations).
 *   2. HMAC-SHA256 of the raw request body, hex-encoded, delivered as
 *      `x-petpooja-signature: sha256=<hex>`.
 *
 * When PETPOOJA_WEBHOOK_SECRET is unset the guard is disabled in
 * non-production environments (with a loud warning) and hard-fails in
 * production so misconfigured deployments never accept traffic.
 */
@Injectable()
export class PetpoojaWebhookGuard implements CanActivate {
  private readonly logger = new Logger(PetpoojaWebhookGuard.name);
  private readonly replayWindowSec: number;

  constructor(
    private readonly credentials: PetpoojaCredentialsService,
    private readonly config: ConfigService,
  ) {
    const appCfg = this.config.getOrThrow<AppConfig>('app');

    this.replayWindowSec = (appCfg as any).webhookReplayWindowSeconds ?? 300;
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const secret = this.credentials.webhookSecret();
    const nodeEnv = process.env.NODE_ENV ?? 'development';

    if (!secret) {
      this.logger.error('PETPOOJA_WEBHOOK_SECRET is not configured');
      throw new UnauthorizedError('PETPOOJA_WEBHOOK_SECRET must be configured');
    }

    const headers = req.headers as Record<string, string | string[] | undefined>;
    const bearer = header(headers, 'x-petpooja-secret');
    if (bearer && safeEqual(bearer, secret)) {
      this.checkTimestamp(headers);
      return true;
    }

    const signatureHeader = header(headers, 'x-petpooja-signature');
    const rawBody: Buffer | undefined = (req as { rawBody?: Buffer }).rawBody;
    if (signatureHeader && rawBody) {
      const provided = signatureHeader.replace(/^sha256=/i, '').trim();
      const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
      if (safeHexEqual(provided, expected)) {
        this.checkTimestamp(headers);
        return true;
      }
    }

    throw new UnauthorizedError('Invalid PETPOOJA webhook signature');
  }

  private checkTimestamp(headers: Record<string, string | string[] | undefined>): void {
    const ts = header(headers, 'x-petpooja-timestamp');
    if (!ts) return; // optional
    const asNumber = Number(ts);
    if (!Number.isFinite(asNumber)) return;
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - asNumber) > this.replayWindowSec) {
      throw new UnauthorizedError('PETPOOJA webhook timestamp outside replay window');
    }
  }
}

function header(
  h: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const v = h[name] ?? h[name.toLowerCase()];
  if (Array.isArray(v)) return v[0];
  return v;
}

function safeEqual(a: string, b: string): boolean {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  if (A.length !== B.length) return false;
  return timingSafeEqual(A, B);
}

function safeHexEqual(a: string, b: string): boolean {
  if (!/^[0-9a-fA-F]+$/.test(a) || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}
