import type { Prisma } from '@prisma/client';
import type { ListProductsQueryDto } from '../dto';

export class ProductSpecifications {
  static forListQuery(q: ListProductsQueryDto): Prisma.ProductWhereInput {
    const where: Prisma.ProductWhereInput = {};
    if (q.categoryId) where.categoryId = q.categoryId;
    if (q.availableOnly === 'true') where.isAvailable = true;
    if (q.popular === 'true') where.isPopular = true;
    if (q.featured === 'true') where.isFeatured = true;
    if (q.bestSeller === 'true') where.isBestSeller = true;
    if (q.recommended === 'true') where.isRecommended = true;
    if (q.tag) where.tags = { has: q.tag };
    if (q.search) {
      where.OR = [
        { name: { contains: q.search, mode: 'insensitive' } },
        { description: { contains: q.search, mode: 'insensitive' } },
        { tags: { has: q.search } },
      ];
    }
    return where;
  }

  static sortOrder(q: ListProductsQueryDto): Prisma.ProductOrderByWithRelationInput[] {
    const dir: Prisma.SortOrder = q.sortDir === 'desc' ? 'desc' : 'asc';
    switch (q.sortBy) {
      case 'name':
        return [{ name: dir }];
      case 'basePrice':
        return [{ basePrice: dir }];
      case 'createdAt':
        return [{ createdAt: dir }];
      default:
        return [{ displayOrder: 'asc' }, { name: 'asc' }];
    }
  }
}
