import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '@common/errors';
import { CacheService } from '@infra/cache/cache.service';
import { DomainEventBus } from '@infra/events/domain-event-bus';
import type { ListProductsQueryDto } from '../dto';
import {
  PRODUCT_REPOSITORY,
  type IProductRepository,
  type ProductWithRelations,
} from '../repositories/interfaces/product-repository.interface';
import {
  PRODUCT_EVENTS,
  type ProductChangedEvent,
  type StockUpdatedEvent,
} from '../events/product.events';
import type { ProductUpsertInput, StockUpdateInput } from '../validators/product.validators';

const CACHE_TTL = 300;
const cacheKey = (productId: string) => `catalog:product:${productId}:v1`;

@Injectable()
export class ProductsService {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly repo: IProductRepository,
    private readonly cache: CacheService,
    private readonly bus: DomainEventBus,
  ) {}

  list(q: ListProductsQueryDto) {
    return this.repo.list(q);
  }

  async get(id: string): Promise<ProductWithRelations> {
    return this.cache.wrap(cacheKey(id), CACHE_TTL, async () => {
      const p = await this.repo.findById(id);
      if (!p) throw new NotFoundError('Product not found');
      return p;
    });
  }

  listByCategoryIds(categoryIds: string[]) {
    return this.repo.listByCategoryIds(categoryIds);
  }

  availability(productId: string, storeId: string) {
    return this.repo.availabilityFor(productId, storeId);
  }

  async upsertFromPetpooja(
    input: ProductUpsertInput,
    categoryDbId: string,
    modifierGroupDbIds: string[],
    correlationId?: string,
  ) {
    const prev = await this.repo.findByPetpoojaId(input.petpoojaId);
    const entity = await this.repo.upsertFromPetpooja(input, categoryDbId, modifierGroupDbIds);
    await this.cache.del(cacheKey(entity.id));
    this.bus.publish<ProductChangedEvent>(prev ? PRODUCT_EVENTS.UPDATED : PRODUCT_EVENTS.CREATED, {
      productId: entity.id,
      petpoojaId: entity.petpoojaId,
      categoryId: entity.categoryId,
      source: 'PETPOOJA_SYNC',
      correlationId,
    });
    return entity;
  }

  async applyStockUpdate(
    input: StockUpdateInput,
    productDbId: string,
    storeDbId: string,
    source: StockUpdatedEvent['source'] = 'PETPOOJA_WEBHOOK',
    correlationId?: string,
  ) {
    const res = await this.repo.applyStockUpdate(input, productDbId, storeDbId);
    await this.cache.del(cacheKey(productDbId));
    this.bus.publish<StockUpdatedEvent>(PRODUCT_EVENTS.STOCK_UPDATED, {
      productId: productDbId,
      storeId: storeDbId,
      inStock: res.inStock,
      source,
      correlationId,
    });
    return res;
  }
}
