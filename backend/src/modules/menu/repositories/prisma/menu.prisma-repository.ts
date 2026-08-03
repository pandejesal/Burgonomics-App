import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infra/prisma/prisma.service';
import { CategoryMapper } from '../../../categories/mappers/category.mapper';
import { ProductMapper } from '../../../products/mappers/product.mapper';
import { ModifierMapper } from '../../../modifiers/mappers/modifier.mapper';
import type { AggregatedMenu, IMenuRepository } from '../interfaces/menu-repository.interface';

@Injectable()
export class MenuPrismaRepository implements IMenuRepository {
  constructor(private readonly prisma: PrismaService) {}

  async aggregateForStore(storeId: string): Promise<AggregatedMenu> {
    const [categories, products, groups] = await this.prisma.$transaction([
      this.prisma.category.findMany({
        where: { isVisible: true, isAvailable: true },
        orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.product.findMany({
        where: {
          isAvailable: true,
          OR: [
            { storeAvailability: { some: { storeId, isAvailable: true, inStock: true } } },
            { storeAvailability: { none: { storeId } } },
          ],
        },
        include: {
          images: { orderBy: { displayOrder: 'asc' } },
          modifierGroups: { select: { groupId: true } },
        },
        orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.modifierGroup.findMany({
        where: { isAvailable: true },
        include: { modifiers: { where: { isAvailable: true }, orderBy: { displayOrder: 'asc' } } },
        orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      }),
    ]);

    return {
      storeId,
      categories: categories.map(CategoryMapper.toEntity),
      products: products.map((p) => ProductMapper.fromRowWithRelations(p)),
      modifierGroups: groups.map((g) => ({
        group: ModifierMapper.groupToEntity(g),
        options: g.modifiers.map(ModifierMapper.optionToEntity),
      })),
      version: `${Date.now()}`,
      generatedAt: new Date(),
    };
  }

  async latestVersion(): Promise<string> {
    const last = await this.prisma.menuSyncLog.findFirst({
      where: { status: { in: ['SUCCESS', 'PARTIAL'] } },
      orderBy: { finishedAt: 'desc' },
      select: { finishedAt: true, id: true },
    });
    return last?.finishedAt ? `${last.finishedAt.getTime()}` : '0';
  }
}
