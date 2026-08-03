import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';
import type { ListProductsQueryDto } from '../../dto';
import { ProductMapper } from '../../mappers/product.mapper';
import { ProductSpecifications } from '../../specifications/product.specifications';
import type { ProductUpsertInput, StockUpdateInput } from '../../validators/product.validators';
import type {
  IProductRepository,
  ProductWithRelations,
} from '../interfaces/product-repository.interface';
import type { ProductEntity, ProductStoreAvailabilityEntity } from '../../entities/product.entity';

const INCLUDE_RELATIONS = {
  images: { orderBy: { displayOrder: 'asc' as const } },
  modifierGroups: { select: { groupId: true, sortOrder: true } },
} satisfies Prisma.ProductInclude;

@Injectable()
export class ProductPrismaRepository implements IProductRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: ListProductsQueryDto): Promise<{ items: ProductWithRelations[]; total: number }> {
    const where = ProductSpecifications.forListQuery(q);
    if (q.storeId) {
      where.storeAvailability = {
        some: { storeId: q.storeId, isAvailable: true, inStock: true },
      };
    }
    const skip = (q.page - 1) * q.pageSize;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy: ProductSpecifications.sortOrder(q),
        include: INCLUDE_RELATIONS,
        skip,
        take: q.pageSize,
      }),
      this.prisma.product.count({ where }),
    ]);
    return { items: rows.map((r) => ProductMapper.fromRowWithRelations(r)), total };
  }

  async findById(id: string): Promise<ProductWithRelations | null> {
    const row = await this.prisma.product.findUnique({
      where: { id },
      include: INCLUDE_RELATIONS,
    });
    return row ? ProductMapper.fromRowWithRelations(row) : null;
  }

  async findByPetpoojaId(petpoojaId: string): Promise<ProductEntity | null> {
    const row = await this.prisma.product.findUnique({ where: { petpoojaId } });
    return row ? ProductMapper.toEntity(row) : null;
  }

  async listByCategoryIds(categoryIds: string[]): Promise<ProductWithRelations[]> {
    if (!categoryIds.length) return [];
    const rows = await this.prisma.product.findMany({
      where: { categoryId: { in: categoryIds }, isAvailable: true },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      include: INCLUDE_RELATIONS,
    });
    return rows.map((r) => ProductMapper.fromRowWithRelations(r));
  }

  async availabilityFor(
    productId: string,
    storeId: string,
  ): Promise<ProductStoreAvailabilityEntity | null> {
    const row = await this.prisma.productStoreAvailability.findUnique({
      where: { productId_storeId: { productId, storeId } },
    });
    return row ? ProductMapper.availabilityToEntity(row) : null;
  }

  async upsertFromPetpooja(
    input: ProductUpsertInput,
    categoryDbId: string,
    modifierGroupDbIds: string[],
  ): Promise<ProductEntity> {
    const priceScalar = new Prisma.Decimal(input.basePrice as string | number);
    const taxScalar = new Prisma.Decimal(input.taxRate as string | number);

    const row = await this.prisma.$transaction(async (tx) => {
      const upserted = await tx.product.upsert({
        where: { petpoojaId: input.petpoojaId },
        create: {
          petpoojaId: input.petpoojaId,
          categoryId: categoryDbId,
          name: input.name,
          description: input.description ?? null,
          shortDescription: input.shortDescription ?? null,
          basePrice: priceScalar,
          taxRate: taxScalar,
          taxCode: input.taxCode ?? null,
          currency: input.currency,
          displayOrder: input.displayOrder,
          isAvailable: input.isAvailable,
          prepTimeMinutes: input.prepTimeMinutes ?? null,
          calories: input.calories ?? null,
          proteinG:
            input.proteinG != null ? new Prisma.Decimal(input.proteinG as string | number) : null,
          carbsG: input.carbsG != null ? new Prisma.Decimal(input.carbsG as string | number) : null,
          fatG: input.fatG != null ? new Prisma.Decimal(input.fatG as string | number) : null,
          fiberG: input.fiberG != null ? new Prisma.Decimal(input.fiberG as string | number) : null,
          servingSize: input.servingSize ?? null,
          allergens: input.allergens,
          tags: input.tags,
          isPopular: input.isPopular,
          isRecommended: input.isRecommended,
          isBestSeller: input.isBestSeller,
          isFeatured: input.isFeatured,
          isSeasonal: input.isSeasonal,
          seasonalFrom: input.seasonalFrom ?? null,
          seasonalTo: input.seasonalTo ?? null,
          translations: ProductMapper.jsonToInput(input.translations),
        },
        update: {
          categoryId: categoryDbId,
          name: input.name,
          description: input.description ?? null,
          shortDescription: input.shortDescription ?? null,
          basePrice: priceScalar,
          taxRate: taxScalar,
          taxCode: input.taxCode ?? null,
          currency: input.currency,
          displayOrder: input.displayOrder,
          isAvailable: input.isAvailable,
          prepTimeMinutes: input.prepTimeMinutes ?? null,
          calories: input.calories ?? null,
          proteinG:
            input.proteinG != null ? new Prisma.Decimal(input.proteinG as string | number) : null,
          carbsG: input.carbsG != null ? new Prisma.Decimal(input.carbsG as string | number) : null,
          fatG: input.fatG != null ? new Prisma.Decimal(input.fatG as string | number) : null,
          fiberG: input.fiberG != null ? new Prisma.Decimal(input.fiberG as string | number) : null,
          servingSize: input.servingSize ?? null,
          allergens: input.allergens,
          tags: input.tags,
          isPopular: input.isPopular,
          isRecommended: input.isRecommended,
          isBestSeller: input.isBestSeller,
          isFeatured: input.isFeatured,
          isSeasonal: input.isSeasonal,
          seasonalFrom: input.seasonalFrom ?? null,
          seasonalTo: input.seasonalTo ?? null,
          translations: ProductMapper.jsonToInput(input.translations),
        },
      });

      // Reset images
      await tx.productImage.deleteMany({ where: { productId: upserted.id } });
      if (input.images.length) {
        await tx.productImage.createMany({
          data: input.images.map((img) => ({
            productId: upserted.id,
            url: img.url,
            altText: img.altText ?? null,
            isPrimary: img.isPrimary,
            displayOrder: img.displayOrder,
          })),
        });
      }

      // Reset modifier group links
      await tx.productModifierGroup.deleteMany({ where: { productId: upserted.id } });
      if (modifierGroupDbIds.length) {
        await tx.productModifierGroup.createMany({
          data: modifierGroupDbIds.map((groupId, idx) => ({
            productId: upserted.id,
            groupId,
            sortOrder: idx,
          })),
          skipDuplicates: true,
        });
      }

      return upserted;
    });

    return ProductMapper.toEntity(row);
  }

  async applyStockUpdate(
    input: StockUpdateInput,
    productDbId: string,
    storeDbId: string,
  ): Promise<ProductStoreAvailabilityEntity> {
    const row = await this.prisma.productStoreAvailability.upsert({
      where: { productId_storeId: { productId: productDbId, storeId: storeDbId } },
      create: {
        productId: productDbId,
        storeId: storeDbId,
        isAvailable: input.inStock,
        inStock: input.inStock,
      },
      update: { inStock: input.inStock, isAvailable: input.inStock },
    });
    return ProductMapper.availabilityToEntity(row);
  }

  async deleteByPetpoojaIdsNotIn(keep: string[]): Promise<number> {
    const res = await this.prisma.product.deleteMany({
      where: { petpoojaId: { notIn: keep } },
    });
    return res.count;
  }
}
