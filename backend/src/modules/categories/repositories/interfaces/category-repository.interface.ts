import type { CategoryEntity } from '../../entities/category.entity';
import type { ListCategoriesQueryDto } from '../../dto';
import type { CategoryUpsertInput } from '../../validators/category.validators';

export const CATEGORY_REPOSITORY = Symbol('CATEGORY_REPOSITORY');

export interface ICategoryRepository {
  findById(id: string): Promise<CategoryEntity | null>;
  findByPetpoojaId(petpoojaId: string): Promise<CategoryEntity | null>;
  list(input: ListCategoriesQueryDto): Promise<{ items: CategoryEntity[]; total: number }>;
  listVisibleTree(): Promise<CategoryEntity[]>;
  upsertFromPetpooja(
    input: CategoryUpsertInput,
    parentDbId: string | null,
  ): Promise<CategoryEntity>;
  deleteByPetpoojaIdsNotIn(keep: string[]): Promise<number>;
}
