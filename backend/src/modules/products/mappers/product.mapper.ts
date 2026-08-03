import type { Prisma, Product, ProductImage, ProductStoreAvailability } from '@prisma/client';
import {
  ProductEntity,
  ProductImageEntity,
  ProductStoreAvailabilityEntity,
} from '../entities/product.entity';
import { NutritionResponseDto, ProductImageResponseDto, ProductResponseDto } from '../dto';

type ProductRow = Product & { images?: ProductImage[]; modifierGroups?: { groupId: string }[] };

export class ProductMapper {
  static toEntity(row: Product): ProductEntity {
    const e = new ProductEntity();
    Object.assign(e, {
      ...row,
      basePrice: row.basePrice.toString(),
      taxRate: row.taxRate.toString(),
      proteinG: row.proteinG?.toString() ?? null,
      carbsG: row.carbsG?.toString() ?? null,
      fatG: row.fatG?.toString() ?? null,
      fiberG: row.fiberG?.toString() ?? null,
      translations: (row.translations as Record<string, string> | null) ?? null,
    });
    return e;
  }

  static imageToEntity(row: ProductImage): ProductImageEntity {
    const e = new ProductImageEntity();
    Object.assign(e, row);
    return e;
  }

  static availabilityToEntity(row: ProductStoreAvailability): ProductStoreAvailabilityEntity {
    const e = new ProductStoreAvailabilityEntity();
    Object.assign(e, {
      ...row,
      priceOverride: row.priceOverride?.toString() ?? null,
    });
    return e;
  }

  static imageToResponse(i: ProductImageEntity): ProductImageResponseDto {
    return {
      url: i.url,
      altText: i.altText ?? null,
      isPrimary: i.isPrimary,
      displayOrder: i.displayOrder,
    };
  }

  static toResponse(
    e: ProductEntity,
    images: ProductImageEntity[] = [],
    modifierGroupIds: string[] = [],
  ): ProductResponseDto {
    const nutrition: NutritionResponseDto = {
      calories: e.calories ?? null,
      proteinG: e.proteinG ?? null,
      carbsG: e.carbsG ?? null,
      fatG: e.fatG ?? null,
      fiberG: e.fiberG ?? null,
      servingSize: e.servingSize ?? null,
    };
    return {
      id: e.id,
      categoryId: e.categoryId,
      name: e.name,
      description: e.description ?? null,
      shortDescription: e.shortDescription ?? null,
      basePrice: e.basePrice,
      taxRate: e.taxRate,
      currency: e.currency,
      isPureVeg: true,
      isAvailable: e.isAvailable,
      prepTimeMinutes: e.prepTimeMinutes ?? null,
      images: images.map(ProductMapper.imageToResponse),
      nutrition,
      allergens: e.allergens,
      tags: e.tags,
      displayOrder: e.displayOrder,
      isPopular: e.isPopular,
      isRecommended: e.isRecommended,
      isBestSeller: e.isBestSeller,
      isFeatured: e.isFeatured,
      isSeasonal: e.isSeasonal,
      modifierGroupIds: modifierGroupIds.length ? modifierGroupIds : undefined,
    };
  }

  static fromRowWithRelations(row: ProductRow): {
    product: ProductEntity;
    images: ProductImageEntity[];
    modifierGroupIds: string[];
  } {
    return {
      product: ProductMapper.toEntity(row),
      images: (row.images ?? []).map(ProductMapper.imageToEntity),
      modifierGroupIds: (row.modifierGroups ?? []).map((m) => m.groupId),
    };
  }

  static jsonToInput(value: unknown): Prisma.InputJsonValue | undefined {
    return value == null ? undefined : (value as Prisma.InputJsonValue);
  }
}
