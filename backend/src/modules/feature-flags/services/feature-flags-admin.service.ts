import { Inject, Injectable } from '@nestjs/common';
import { CacheService } from '@infra/cache/cache.service';
import { FeatureFlagService as CoreFlagService } from '@infra/feature-flags/feature-flag.service';
import type { UpsertFeatureFlagDto } from '../dto';
import { FeatureFlagMapper } from '../mappers/feature-flag.mapper';
import {
  FEATURE_FLAG_REPOSITORY,
  type IFeatureFlagRepository,
} from '../repositories/interfaces/feature-flag-repository.interface';

@Injectable()
export class FeatureFlagsAdminService {
  private static readonly CACHE_PREFIX = 'feature-flag:';

  constructor(
    @Inject(FEATURE_FLAG_REPOSITORY) private readonly repo: IFeatureFlagRepository,
    private readonly cache: CacheService,
    private readonly core: CoreFlagService,
  ) {}

  async list() {
    const rows = await this.repo.list();
    return rows.map(FeatureFlagMapper.toResponse);
  }

  async upsert(input: UpsertFeatureFlagDto) {
    const row = await this.repo.upsert(input);
    await this.cache.del(`${FeatureFlagsAdminService.CACHE_PREFIX}${input.key}`);
    return FeatureFlagMapper.toResponse(row);
  }

  async remove(key: string) {
    await this.repo.delete(key);
    await this.cache.del(`${FeatureFlagsAdminService.CACHE_PREFIX}${key}`);
  }

  async check(key: string) {
    const enabled = await this.core.isEnabled(key);
    return { key, enabled };
  }
}
