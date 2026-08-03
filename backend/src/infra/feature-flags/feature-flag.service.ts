import { Inject, Injectable } from '@nestjs/common';
import { INJECTION_TOKENS } from '@common/constants';
import type {
  FeatureFlagContext,
  FeatureFlagProvider,
} from './interfaces/feature-flag-provider.interface';

@Injectable()
export class FeatureFlagService {
  constructor(
    @Inject(INJECTION_TOKENS.FEATURE_FLAG_PROVIDER)
    private readonly provider: FeatureFlagProvider,
  ) {}

  isEnabled(key: string, ctx?: FeatureFlagContext): Promise<boolean> {
    return this.provider.isEnabled(key, ctx);
  }
}
