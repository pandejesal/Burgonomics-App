import { Injectable } from '@nestjs/common';
import { CacheService } from '@infra/cache/cache.service';
import type { AggregatedMenu } from '../repositories/interfaces/menu-repository.interface';

/** Menu-cache read/write facade. TTL defaults to 60s; PETPOOJA sync
 * invalidates explicitly on every successful sync. */
@Injectable()
export class MenuCacheService {
  private static readonly TTL = 60;

  constructor(private readonly cache: CacheService) {}

  static key(storeId: string, channel: string, daypart: string): string {
    return `catalog:menu:${storeId}:${channel}:${daypart}:v1`;
  }

  read(storeId: string, channel: string, daypart: string) {
    return this.cache.get<AggregatedMenu>(MenuCacheService.key(storeId, channel, daypart));
  }

  getMenu(storeId: string) {
    return this.read(storeId, 'ALL', 'ALL');
  }

  write(storeId: string, channel: string, daypart: string, menu: AggregatedMenu) {
    return this.cache.set(
      MenuCacheService.key(storeId, channel, daypart),
      menu,
      MenuCacheService.TTL,
    );
  }

  async invalidate(storeId?: string): Promise<void> {
    // Coarse invalidation: delete a small, well-known set of channel×daypart keys.
    const channels = ['ALL', 'DELIVERY', 'TAKEAWAY', 'DINE_IN'];
    const dayparts = ['ALL', 'BREAKFAST', 'LUNCH', 'DINNER'];
    const stores = storeId ? [storeId] : ['*'];
    const keys: string[] = [];
    for (const s of stores)
      for (const c of channels)
        for (const d of dayparts) {
          if (s !== '*') keys.push(MenuCacheService.key(s, c, d));
        }
    if (keys.length) await this.cache.del(keys);
  }

  /** Placeholder for a background job that pre-warms hot store menus. */
  async warm(_storeIds: string[]): Promise<void> {
    // Wired into the synchronization pipeline in a subsequent phase.
  }
}
