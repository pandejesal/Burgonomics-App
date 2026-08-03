import { Inject, Injectable } from '@nestjs/common';
import { CacheService } from '@infra/cache/cache.service';
import { NotFoundError } from '@common/errors';
import {
  SYSTEM_CONFIG_REPOSITORY,
  type ISystemConfigRepository,
} from '../repositories/interfaces/system-config-repository.interface';
import type { SetConfigDto } from '../dto';

@Injectable()
export class SystemConfigService {
  private static readonly CACHE_PREFIX = 'system-config:';
  private static readonly CACHE_TTL = 60;

  constructor(
    @Inject(SYSTEM_CONFIG_REPOSITORY) private readonly repo: ISystemConfigRepository,
    private readonly cache: CacheService,
  ) {}

  list(category?: string) {
    return this.repo.list(category);
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const cached = await this.cache.get<T>(SystemConfigService.CACHE_PREFIX + key);
    if (cached !== null) return cached;
    const row = await this.repo.getByKey(key);
    if (!row) return null;
    await this.cache.set(
      SystemConfigService.CACHE_PREFIX + key,
      row.value,
      SystemConfigService.CACHE_TTL,
    );
    return row.value as T;
  }

  async require<T = unknown>(key: string): Promise<T> {
    const v = await this.get<T>(key);
    if (v === null) throw new NotFoundError(`SystemConfig: ${key}`);
    return v;
  }

  async set(input: SetConfigDto & { updatedBy?: string }) {
    const row = await this.repo.set(input);
    await this.cache.del(SystemConfigService.CACHE_PREFIX + input.key);
    return row;
  }

  async delete(key: string) {
    await this.repo.delete(key);
    await this.cache.del(SystemConfigService.CACHE_PREFIX + key);
  }

  history(key: string, limit = 20) {
    return this.repo.history(key, limit);
  }
}
