import type { Prisma } from '@prisma/client';
import type { ListOrdersQueryDto } from '../dto';

export class OrderSpecifications {
  static forListQuery(userId: string, q: ListOrdersQueryDto): Prisma.OrderWhereInput {
    const where: Prisma.OrderWhereInput = { userId };
    if (q.status) where.status = q.status;
    if (q.storeId) where.storeId = q.storeId;
    if (q.search) {
      where.OR = [
        { clientOrderId: { contains: q.search, mode: 'insensitive' } },
        { petpoojaOrderId: { contains: q.search, mode: 'insensitive' } },
      ];
    }
    return where;
  }

  static sortOrder(q: ListOrdersQueryDto): Prisma.OrderOrderByWithRelationInput[] {
    const dir: Prisma.SortOrder = q.sortDir === 'asc' ? 'asc' : 'desc';
    switch (q.sortBy) {
      case 'grandTotal':
        return [{ grandTotal: dir }];
      default:
        return [{ placedAt: dir }];
    }
  }
}
