import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RazorpayConfig } from '@config/razorpay.config';

/**
 * Razorpay credential provider. Isolates credential access behind a
 * single seam so future rotation (e.g. via a secret manager) is a
 * one-line change.
 */
@Injectable()
export class RazorpayCredentialsService implements OnModuleInit {
  private readonly logger = new Logger(RazorpayCredentialsService.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const cfg = this.cfg();
    if (!cfg.keyId || !cfg.keySecret) {
      this.logger.warn(
        'Razorpay credentials missing (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET). Payment creation will be rejected until configured.',
      );
    }
    if (!cfg.webhookSecret) {
      this.logger.warn(
        'RAZORPAY_WEBHOOK_SECRET is not set. Webhook signature verification will fail in production.',
      );
    }
  }

  private cfg(): RazorpayConfig {
    return this.config.getOrThrow<RazorpayConfig>('razorpay');
  }

  isConfigured(): boolean {
    const c = this.cfg();
    return Boolean(c.keyId && c.keySecret);
  }

  keyId(): string {
    const v = this.cfg().keyId;
    if (!v) throw new Error('RAZORPAY_KEY_ID is not configured');
    return v;
  }

  keySecret(): string {
    const v = this.cfg().keySecret;
    if (!v) throw new Error('RAZORPAY_KEY_SECRET is not configured');
    return v;
  }

  webhookSecret(): string | undefined {
    return this.cfg().webhookSecret;
  }

  baseUrl(): string {
    return this.cfg().baseUrl;
  }

  timeoutMs(): number {
    return this.cfg().httpTimeoutMs;
  }

  replayWindowSeconds(): number {
    return this.cfg().replayWindowSeconds;
  }

  orderExpiryMinutes(): number {
    return this.cfg().orderExpiryMinutes;
  }

  publishableKeyForClient(): string {
    return this.keyId();
  }
}
