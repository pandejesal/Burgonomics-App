import type { Category } from '@prisma/client';
import { CategoryEntity } from '../entities/category.entity';
import { CategoryResponseDto } from '../dto';

export class CategoryMapper {
  static toEntity(row: Category): CategoryEntity {
    const e = new CategoryEntity();
    Object.assign(e, row, {
      translations: (row.translations as Record<string, string> | null) ?? null,
    });
    return e;
  }

  static toResponse(e: CategoryEntity, children: CategoryResponseDto[] = []): CategoryResponseDto {
    return {
      id: e.id,
      name: e.name,
      description: e.description ?? null,
      imageUrl: e.imageUrl ?? null,
      bannerUrl: e.bannerUrl ?? null,
      displayOrder: e.displayOrder,
      isVisible: e.isVisible,
      isAvailable: e.isAvailable,
      parentId: e.parentId ?? null,
      children: children.length ? children : undefined,
    };
  }
}
