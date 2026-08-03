import { Injectable } from '@nestjs/common';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { RazorpayCredentialsService } from '../services/razorpay-credentials.service';
import { RazorpayGatewayService } from '../services/razorpay-gateway.service';

@Injectable()
export class RazorpayHealthIndicator extends HealthIndicator {
  constructor(
    private readonly credentials: RazorpayCredentialsService,
    private readonly gateway: RazorpayGatewayService,
  ) {
    super();
  }

  async isHealthy(key = 'razorpay'): Promise<HealthIndicatorResult> {
    const configured = this.credentials.isConfigured();
    const breakers = this.gateway.breakerStates();
    const anyOpen = Object.values(breakers).some((s) => s === 'OPEN');
    const healthy = configured && !anyOpen;
    if (!healthy) {
      throw new HealthCheckError(
        'Razorpay unhealthy',
        this.getStatus(key, false, { configured, breakers }),
      );
    }
    return this.getStatus(key, true, { configured, breakers });
  }
}
