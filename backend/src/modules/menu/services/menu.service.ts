import { Inject, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { QUEUE_NAMES } from '@infra/queue/queue.constants';
import { DomainEventBus } from '@infra/events/domain-event-bus';
import { ProductMapper } from '../../products/mappers/product.mapper';
import { CategoryMapper } from '../../categories/mappers/category.mapper';
import { ModifierMapper } from '../../modifiers/mappers/modifier.mapper';
import {
  MENU_REPOSITORY,
  type IMenuRepository,
  type AggregatedMenu,
} from '../repositories/interfaces/menu-repository.interface';
import { MenuCacheService } from './menu-cache.service';
import { MenuChannel, MenuDaypart, MenuQueryDto, MenuRefreshDto, MenuResponseDto } from '../dto';
import { MENU_EVENTS, type MenuCacheInvalidatedEvent } from '../events/menu.events';

@Injectable()
export class MenuService {
  constructor(
    @Inject(MENU_REPOSITORY) private readonly repo: IMenuRepository,
    private readonly cache: MenuCacheService,
    private readonly bus: DomainEventBus,
    @InjectQueue(QUEUE_NAMES.PETPOOJA_FETCH_MENU) private readonly fetchMenuQueue: Queue,
  ) {}

  async getMenu(q: MenuQueryDto): Promise<MenuResponseDto> {
    const channel = q.channel ?? MenuChannel.DELIVERY;
    const daypart = q.daypart ?? MenuDaypart.ALL;

    const cached = await this.cache.read(q.storeId, channel, daypart);
    const menu = cached ?? (await this.buildAndCache(q.storeId, channel, daypart));
    return this.toResponse(menu, channel, daypart);
  }

  private async buildAndCache(storeId: string, channel: MenuChannel, daypart: MenuDaypart) {
    const menu = await this.repo.aggregateForStore(storeId);
    await this.cache.write(storeId, channel, daypart, menu);
    return menu;
  }

  private toResponse(
    menu: AggregatedMenu,
    channel: MenuChannel,
    daypart: MenuDaypart,
  ): MenuResponseDto {
    const productsByCategory = new Map<string, typeof menu.products>();
    for (const p of menu.products) {
      const arr = productsByCategory.get(p.product.categoryId) ?? [];
      arr.push(p);
      productsByCategory.set(p.product.categoryId, arr);
    }
    return {
      storeId: menu.storeId,
      channel,
      daypart,
      version: menu.version,
      generatedAt: menu.generatedAt.toISOString(),
      sections: menu.categories
        .map((c) => ({
          category: CategoryMapper.toResponse(c),
          products: (productsByCategory.get(c.id) ?? []).map(
            ({ product, images, modifierGroupIds }) =>
              ProductMapper.toResponse(product, images, modifierGroupIds),
          ),
        }))
        .filter((s) => s.products.length > 0),
      modifierGroups: menu.modifierGroups.map(({ group, options }) =>
        ModifierMapper.groupToResponse(group, options),
      ),
    };
  }

  /**
   * Enqueue a PETPOOJA fetch. This is the ONLY way to refresh menu
   * data — the frontend must NEVER perform direct catalog writes.
   */
  async requestRefresh(input: MenuRefreshDto, correlationId?: string): Promise<{ jobId: string }> {
    const job = await this.fetchMenuQueue.add(
      input.scope ?? 'FULL',
      { storeId: input.storeId, scope: input.scope ?? 'FULL', force: !!input.force, correlationId },
      { attempts: 3 },
    );
    return { jobId: job.id ?? '' };
  }

  async invalidateCache(
    storeId?: string,
    reason = 'manual',
    correlationId?: string,
  ): Promise<void> {
    await this.cache.invalidate(storeId);
    this.bus.publish<MenuCacheInvalidatedEvent>(MENU_EVENTS.CACHE_INVALIDATED, {
      storeId,
      reason,
      correlationId,
    });
  }
}
