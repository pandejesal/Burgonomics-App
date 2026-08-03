import { Injectable } from '@nestjs/common';
import { PermissionCacheService } from './permission-cache.service';

/**
 * Runtime permission resolver. Consumed by the PermissionsGuard and
 * any service that needs to make an authorization decision outside of
 * an HTTP context (e.g. queue consumers running admin-issued jobs).
 */
@Injectable()
export class PermissionResolverService {
  constructor(private readonly cache: PermissionCacheService) {}

  async resolve(userId: string): Promise<Set<string>> {
    const keys = await this.cache.getForUser(userId);
    return new Set(keys);
  }

  async has(userId: string, required: string): Promise<boolean> {
    const set = await this.resolve(userId);
    return set.has(required);
  }

  async hasAny(userId: string, required: string[]): Promise<boolean> {
    if (!required.length) return true;
    const set = await this.resolve(userId);
    return required.some((k) => set.has(k));
  }

  async hasAll(userId: string, required: string[]): Promise<boolean> {
    if (!required.length) return true;
    const set = await this.resolve(userId);
    return required.every((k) => set.has(k));
  }
}
