import { Global, Module, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { INJECTION_TOKENS } from '@common/constants';
import type { FeatureFlagsConfig } from '@config/feature-flags.config';
import { EnvFeatureFlagProvider } from './providers/env.provider';
import { DatabaseFeatureFlagProvider } from './providers/database.provider';
import { FeatureFlagService } from './feature-flag.service';
import type { FeatureFlagProvider } from './interfaces/feature-flag-provider.interface';

const providerBinding: Provider = {
  provide: INJECTION_TOKENS.FEATURE_FLAG_PROVIDER,
  inject: [ConfigService, EnvFeatureFlagProvider, DatabaseFeatureFlagProvider],
  useFactory: (
    config: ConfigService,
    envProv: EnvFeatureFlagProvider,
    dbProv: DatabaseFeatureFlagProvider,
  ): FeatureFlagProvider => {
    const cfg = config.getOrThrow<FeatureFlagsConfig>('featureFlags');
    return cfg.driver === 'database' ? dbProv : envProv;
  },
};

@Global()
@Module({
  providers: [
    EnvFeatureFlagProvider,
    DatabaseFeatureFlagProvider,
    providerBinding,
    FeatureFlagService,
  ],
  exports: [FeatureFlagService, INJECTION_TOKENS.FEATURE_FLAG_PROVIDER],
})
export class FeatureFlagsModule {}
