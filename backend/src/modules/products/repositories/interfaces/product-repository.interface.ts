import type {
  ProductEntity,
  ProductImageEntity,
  ProductStoreAvailabilityEntity,
} from '../../entities/product.entity';
import type { ListProductsQueryDto } from '../../dto';
import type { ProductUpsertInput, StockUpdateInput } from '../../validators/product.validators';

export const PRODUCT_REPOSITORY = Symbol('PRODUCT_REPOSITORY');

export interface ProductWithRelations {
  product: ProductEntity;
  images: ProductImageEntity[];
  modifierGroupIds: string[];
}

export interface IProductRepository {
  list(q: ListProductsQueryDto): Promise<{ items: ProductWithRelations[]; total: number }>;
  findById(id: string): Promise<ProductWithRelations | null>;
  findByPetpoojaId(petpoojaId: string): Promise<ProductEntity | null>;
  listByCategoryIds(categoryIds: string[]): Promise<ProductWithRelations[]>;
  availabilityFor(
    productId: string,
    storeId: string,
  ): Promise<ProductStoreAvailabilityEntity | null>;
  upsertFromPetpooja(
    input: ProductUpsertInput,
    categoryDbId: string,
    modifierGroupDbIds: string[],
  ): Promise<ProductEntity>;
  applyStockUpdate(
    input: StockUpdateInput,
    productDbId: string,
    storeDbId: string,
  ): Promise<ProductStoreAvailabilityEntity>;
  deleteByPetpoojaIdsNotIn(keep: string[]): Promise<number>;
}
