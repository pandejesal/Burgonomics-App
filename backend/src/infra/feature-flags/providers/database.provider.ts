import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infra/prisma/prisma.service';
import { CacheService } from '@infra/cache/cache.service';
import type {
  FeatureFlagContext,
  FeatureFlagProvider,
} from '../interfaces/feature-flag-provider.interface';

/**
 * Database-backed feature flag provider. Flags cached per key for 30s
 * to keep the hot path allocation-free. Runtime toggling is exposed via
 * the admin module (Phase 3).
 */
@Injectable()
export class DatabaseFeatureFlagProvider implements FeatureFlagProvider {
  readonly name = 'database';
  private static readonly TTL = 30;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async isEnabled(key: string, _ctx?: FeatureFlagContext): Promise<boolean> {
    return this.cache.wrap(`feature-flag:${key}`, DatabaseFeatureFlagProvider.TTL, async () => {
      const row = await this.prisma.featureFlag.findUnique({ where: { key } });
      return row?.enabled ?? false;
    });
  }
}
