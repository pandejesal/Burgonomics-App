import type { CategoryEntity } from '@modules/categories/entities/category.entity';
import type { ProductWithRelations } from '@modules/products/repositories/interfaces/product-repository.interface';
import type { ModifierGroupWithOptions } from '@modules/modifiers/repositories/interfaces/modifier-repository.interface';

export const MENU_REPOSITORY = Symbol('MENU_REPOSITORY');

export interface AggregatedMenu {
  storeId: string;
  categories: CategoryEntity[];
  products: ProductWithRelations[];
  modifierGroups: ModifierGroupWithOptions[];
  version: string;
  generatedAt: Date;
}

export interface IMenuRepository {
  aggregateForStore(storeId: string): Promise<AggregatedMenu>;
  latestVersion(): Promise<string>;
}
