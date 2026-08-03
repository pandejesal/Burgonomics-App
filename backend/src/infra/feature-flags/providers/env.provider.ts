import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  FeatureFlagContext,
  FeatureFlagProvider,
} from '../interfaces/feature-flag-provider.interface';
import type { FeatureFlagsConfig } from '@config/feature-flags.config';

@Injectable()
export class EnvFeatureFlagProvider implements FeatureFlagProvider {
  readonly name = 'env';
  private readonly defaults: Record<string, boolean>;

  constructor(config: ConfigService) {
    this.defaults = config.getOrThrow<FeatureFlagsConfig>('featureFlags').defaults;
  }

  async isEnabled(key: string, _ctx?: FeatureFlagContext): Promise<boolean> {
    return this.defaults[key] ?? false;
  }
}
