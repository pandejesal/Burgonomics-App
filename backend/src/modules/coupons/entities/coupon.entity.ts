import type { DiscountKind } from '@prisma/client';

export class CouponEntity {
  id!: string;
  code!: string;
  title!: string;
  description?: string | null;
  discountKind!: DiscountKind;
  discountValue!: string;
  maxDiscount?: string | null;
  minOrderValue?: string | null;
  storeIds!: string[];
  categoryIds!: string[];
  productIds!: string[];
  usageLimit?: number | null;
  perUserLimit?: number | null;
  usageCount!: number;
  requiresLogin!: boolean;
  startsAt?: Date | null;
  endsAt?: Date | null;
  isActive!: boolean;
  metadata?: Record<string, unknown> | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export class CouponRedemptionEntity {
  id!: string;
  couponId!: string;
  userId!: string;
  orderId?: string | null;
  discount!: string;
  createdAt!: Date;
}
