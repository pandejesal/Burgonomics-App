import { Injectable } from '@nestjs/common';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { FirebaseAppProvider } from '../providers/firebase-app.provider';

@Injectable()
export class FirebaseMessagingHealthIndicator extends HealthIndicator {
  constructor(private readonly app: FirebaseAppProvider) {
    super();
  }

  async isHealthy(key = 'firebase-messaging'): Promise<HealthIndicatorResult> {
    if (!this.app.isConfigured) {
      throw new HealthCheckError(
        'Firebase Messaging not configured',
        this.getStatus(key, false, { configured: false }),
      );
    }
    return this.getStatus(key, true, { configured: true });
  }
}
