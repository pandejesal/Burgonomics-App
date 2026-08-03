import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';
import { CouponMapper } from '../../mappers/coupon.mapper';
import type { CouponEntity } from '../../entities/coupon.entity';
import type { ICouponRepository } from '../interfaces/coupon-repository.interface';

@Injectable()
export class CouponPrismaRepository implements ICouponRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByCode(code: string): Promise<CouponEntity | null> {
    const row = await this.prisma.coupon.findUnique({ where: { code } });
    return row ? CouponMapper.toEntity(row) : null;
  }

  async list(args: { storeId?: string; page: number; pageSize: number }) {
    const where: Prisma.CouponWhereInput = { isActive: true };
    if (args.storeId) {
      where.OR = [{ storeIds: { has: args.storeId } }, { storeIds: { isEmpty: true } }];
    }
    const skip = (args.page - 1) * args.pageSize;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.coupon.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: args.pageSize,
      }),
      this.prisma.coupon.count({ where }),
    ]);
    return { items: rows.map(CouponMapper.toEntity), total };
  }

  countUserRedemptions(couponId: string, userId: string): Promise<number> {
    return this.prisma.couponRedemption.count({ where: { couponId, userId } });
  }

  async recordRedemption(args: {
    couponId: string;
    userId: string;
    orderId?: string;
    discount: string;
  }): Promise<void> {
    await this.prisma.couponRedemption.create({
      data: {
        couponId: args.couponId,
        userId: args.userId,
        orderId: args.orderId ?? null,
        discount: new Prisma.Decimal(args.discount),
      },
    });
  }

  async incrementUsage(couponId: string): Promise<void> {
    await this.prisma.coupon.update({
      where: { id: couponId },
      data: { usageCount: { increment: 1 } },
    });
  }
}
