import { Injectable } from '@nestjs/common';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';
import type { PetpoojaConfig } from '@config/petpooja.config';

@Injectable()
export class PetpoojaHealthIndicator extends HealthIndicator {
  constructor(private readonly config: ConfigService) {
    super();
  }

  async isHealthy(key = 'petpooja'): Promise<HealthIndicatorResult> {
    const cfg = this.config.getOrThrow<PetpoojaConfig>('petpooja');
    const configured = Boolean(cfg.appKey && cfg.appSecret && cfg.accessToken);
    if (!configured) {
      // Not configured is a soft failure — the app still boots; downstream
      // consumers guard on FeatureFlags.
      throw new HealthCheckError(
        'Petpooja credentials missing',
        this.getStatus(key, false, { configured }),
      );
    }
    return this.getStatus(key, true, { configured, baseUrl: cfg.baseUrl });
  }
}
