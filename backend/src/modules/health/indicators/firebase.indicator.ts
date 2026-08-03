import { Injectable } from '@nestjs/common';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';
import type { FirebaseConfig } from '@config/firebase.config';

@Injectable()
export class FirebaseHealthIndicator extends HealthIndicator {
  constructor(private readonly config: ConfigService) {
    super();
  }

  async isHealthy(key = 'firebase'): Promise<HealthIndicatorResult> {
    const cfg = this.config.getOrThrow<FirebaseConfig>('firebase');
    const configured = Boolean(cfg.projectId && cfg.clientEmail && cfg.privateKey);
    if (!configured) {
      throw new HealthCheckError(
        'Firebase credentials missing',
        this.getStatus(key, false, { configured }),
      );
    }
    return this.getStatus(key, true, { configured });
  }
}
