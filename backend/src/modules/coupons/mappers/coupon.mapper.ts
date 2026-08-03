import type { Coupon, CouponRedemption } from '@prisma/client';
import { CouponEntity, CouponRedemptionEntity } from '../entities/coupon.entity';
import type { CouponResponseDto } from '../dto';

export class CouponMapper {
  static toEntity(row: Coupon): CouponEntity {
    const e = new CouponEntity();
    Object.assign(e, {
      ...row,
      discountValue: row.discountValue.toString(),
      maxDiscount: row.maxDiscount?.toString() ?? null,
      minOrderValue: row.minOrderValue?.toString() ?? null,
      metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    });
    return e;
  }

  static redemptionToEntity(row: CouponRedemption): CouponRedemptionEntity {
    const e = new CouponRedemptionEntity();
    Object.assign(e, { ...row, discount: row.discount.toString() });
    return e;
  }

  static toResponse(e: CouponEntity): CouponResponseDto {
    return {
      id: e.id,
      code: e.code,
      title: e.title,
      description: e.description ?? null,
      discountKind: e.discountKind,
      discountValue: e.discountValue,
      maxDiscount: e.maxDiscount ?? null,
      minOrderValue: e.minOrderValue ?? null,
      requiresLogin: e.requiresLogin,
      isActive: e.isActive,
      startsAt: e.startsAt ?? null,
      endsAt: e.endsAt ?? null,
    };
  }
}
