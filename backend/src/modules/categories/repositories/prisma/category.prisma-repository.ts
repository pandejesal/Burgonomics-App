import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';
import type { CategoryEntity } from '../../entities/category.entity';
import type { ListCategoriesQueryDto } from '../../dto';
import { CategoryMapper } from '../../mappers/category.mapper';
import { CategorySpecifications } from '../../specifications/category.specifications';
import type { CategoryUpsertInput } from '../../validators/category.validators';
import type { ICategoryRepository } from '../interfaces/category-repository.interface';

@Injectable()
export class CategoryPrismaRepository implements ICategoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<CategoryEntity | null> {
    const row = await this.prisma.category.findUnique({ where: { id } });
    return row ? CategoryMapper.toEntity(row) : null;
  }

  async findByPetpoojaId(petpoojaId: string): Promise<CategoryEntity | null> {
    const row = await this.prisma.category.findUnique({ where: { petpoojaId } });
    return row ? CategoryMapper.toEntity(row) : null;
  }

  async list(input: ListCategoriesQueryDto): Promise<{ items: CategoryEntity[]; total: number }> {
    const where: Prisma.CategoryWhereInput = {};
    if (input.search) Object.assign(where, CategorySpecifications.search(input.search));
    if (input.parentId) where.parentId = input.parentId;
    if (input.visibleOnly === 'true') Object.assign(where, CategorySpecifications.visible());
    const skip = (input.page - 1) * input.pageSize;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.category.findMany({
        where,
        orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
        skip,
        take: input.pageSize,
      }),
      this.prisma.category.count({ where }),
    ]);
    return { items: rows.map(CategoryMapper.toEntity), total };
  }

  async listVisibleTree(): Promise<CategoryEntity[]> {
    const rows = await this.prisma.category.findMany({
      where: CategorySpecifications.visible(),
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map(CategoryMapper.toEntity);
  }

  async upsertFromPetpooja(
    input: CategoryUpsertInput,
    parentDbId: string | null,
  ): Promise<CategoryEntity> {
    const row = await this.prisma.category.upsert({
      where: { petpoojaId: input.petpoojaId },
      create: {
        petpoojaId: input.petpoojaId,
        name: input.name,
        description: input.description ?? null,
        imageUrl: input.imageUrl ?? null,
        bannerUrl: input.bannerUrl ?? null,
        displayOrder: input.displayOrder,
        isVisible: input.isVisible,
        isAvailable: input.isAvailable,
        parentId: parentDbId,
        translations: (input.translations ?? undefined) as Prisma.InputJsonValue | undefined,
      },
      update: {
        name: input.name,
        description: input.description ?? null,
        imageUrl: input.imageUrl ?? null,
        bannerUrl: input.bannerUrl ?? null,
        displayOrder: input.displayOrder,
        isVisible: input.isVisible,
        isAvailable: input.isAvailable,
        parentId: parentDbId,
        translations: (input.translations ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
    return CategoryMapper.toEntity(row);
  }

  async deleteByPetpoojaIdsNotIn(keep: string[]): Promise<number> {
    const res = await this.prisma.category.deleteMany({
      where: { petpoojaId: { notIn: keep } },
    });
    return res.count;
  }
}
