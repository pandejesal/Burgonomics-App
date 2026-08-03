import { registerAs } from '@nestjs/config';

export type FeatureFlagsDriver = 'env' | 'database';

export interface FeatureFlagsConfig {
  driver: FeatureFlagsDriver;
  defaults: Record<string, boolean>;
}

export default registerAs<FeatureFlagsConfig>('featureFlags', () => ({
  driver: (process.env.FEATURE_FLAGS_DRIVER as FeatureFlagsDriver) ?? 'env',
  defaults: {
    OFFERS: process.env.FEATURE_OFFERS === 'true',
    DELIVERY: process.env.FEATURE_DELIVERY === 'true',
    TAKEAWAY: process.env.FEATURE_TAKEAWAY === 'true',
    DINE_IN: process.env.FEATURE_DINE_IN === 'true',
    NEW_CHECKOUT: process.env.FEATURE_NEW_CHECKOUT === 'true',
    FESTIVAL_CAMPAIGNS: process.env.FEATURE_FESTIVAL_CAMPAIGNS === 'true',
    BETA: process.env.FEATURE_BETA === 'true',
  },
}));
