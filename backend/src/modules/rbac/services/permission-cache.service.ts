import { Inject, Injectable } from '@nestjs/common';
import { CacheService } from '@infra/cache/cache.service';
import { PERMISSION_CACHE_PREFIX, PERMISSION_CACHE_TTL_SECONDS } from '../constants';
import {
  ROLE_REPOSITORY,
  type IRoleRepository,
} from '../repositories/interfaces/rbac-repository.interface';

/**
 * Redis-backed permission cache. Reads flatten every permission key
 * derived from a user's role assignments. Cache is invalidated when
 * roles or role↔permission bindings mutate.
 */
@Injectable()
export class PermissionCacheService {
  constructor(
    @Inject(ROLE_REPOSITORY) private readonly roles: IRoleRepository,
    private readonly cache: CacheService,
  ) {}

  private key(userId: string): string {
    return `${PERMISSION_CACHE_PREFIX}${userId}`;
  }

  async getForUser(userId: string): Promise<string[]> {
    const key = this.key(userId);
    const cached = await this.cache.get<string[]>(key);
    if (cached) return cached;
    const perms = await this.roles.listPermissionKeysForUser(userId);
    await this.cache.set(key, perms, PERMISSION_CACHE_TTL_SECONDS);
    return perms;
  }

  async invalidateUser(userId: string): Promise<void> {
    await this.cache.del(this.key(userId));
  }

  async invalidateAll(): Promise<void> {
    // Cache eviction across all users happens naturally via TTL.
    // A dedicated bulk invalidation would require a key pattern scan.
  }
}
