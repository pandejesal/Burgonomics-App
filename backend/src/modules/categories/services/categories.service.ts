import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '@common/errors';
import { CacheService } from '@infra/cache/cache.service';
import { DomainEventBus } from '@infra/events/domain-event-bus';
import type { CategoryEntity } from '../entities/category.entity';
import type { ListCategoriesQueryDto } from '../dto';
import {
  CATEGORY_REPOSITORY,
  type ICategoryRepository,
} from '../repositories/interfaces/category-repository.interface';
import { CATEGORY_EVENTS, type CategoryChangedEvent } from '../events/category.events';
import type { CategoryUpsertInput } from '../validators/category.validators';

const CACHE_KEY_TREE = 'catalog:categories:tree:v1';
const CACHE_TTL = 300;

@Injectable()
export class CategoriesService {
  constructor(
    @Inject(CATEGORY_REPOSITORY) private readonly repo: ICategoryRepository,
    private readonly cache: CacheService,
    private readonly bus: DomainEventBus,
  ) {}

  list(input: ListCategoriesQueryDto) {
    return this.repo.list(input);
  }

  async get(id: string): Promise<CategoryEntity> {
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundError('Category not found');
    return row;
  }

  async getVisibleTree(): Promise<CategoryEntity[]> {
    return this.cache.wrap(CACHE_KEY_TREE, CACHE_TTL, () => this.repo.listVisibleTree());
  }

  /** Called by the PETPOOJA synchronization pipeline. Not exposed via HTTP. */
  async upsertFromPetpooja(
    input: CategoryUpsertInput,
    parentDbId: string | null,
    correlationId?: string,
  ) {
    const previous = await this.repo.findByPetpoojaId(input.petpoojaId);
    const entity = await this.repo.upsertFromPetpooja(input, parentDbId);
    await this.invalidateCache();
    this.bus.publish<CategoryChangedEvent>(
      previous ? CATEGORY_EVENTS.UPDATED : CATEGORY_EVENTS.CREATED,
      {
        categoryId: entity.id,
        petpoojaId: entity.petpoojaId,
        source: 'PETPOOJA_SYNC',
        correlationId,
      },
    );
    return entity;
  }

  async invalidateCache(): Promise<void> {
    await this.cache.del(CACHE_KEY_TREE);
  }
}
