import { Injectable } from '@nestjs/common';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';
import type { RazorpayConfig } from '@config/razorpay.config';

@Injectable()
export class RazorpayHealthIndicator extends HealthIndicator {
  constructor(private readonly config: ConfigService) {
    super();
  }

  async isHealthy(key = 'razorpay'): Promise<HealthIndicatorResult> {
    const cfg = this.config.getOrThrow<RazorpayConfig>('razorpay');
    const configured = Boolean(cfg.keyId && cfg.keySecret);
    if (!configured) {
      throw new HealthCheckError(
        'Razorpay credentials missing',
        this.getStatus(key, false, { configured }),
      );
    }
    return this.getStatus(key, true, { configured });
  }
}
