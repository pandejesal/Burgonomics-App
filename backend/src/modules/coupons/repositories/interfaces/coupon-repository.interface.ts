import type { CouponEntity } from '../../entities/coupon.entity';

export const COUPON_REPOSITORY = Symbol('COUPON_REPOSITORY');

export interface ICouponRepository {
  findByCode(code: string): Promise<CouponEntity | null>;
  list(args: {
    storeId?: string;
    page: number;
    pageSize: number;
  }): Promise<{ items: CouponEntity[]; total: number }>;
  countUserRedemptions(couponId: string, userId: string): Promise<number>;
  recordRedemption(args: {
    couponId: string;
    userId: string;
    orderId?: string;
    discount: string;
  }): Promise<void>;
  incrementUsage(couponId: string): Promise<void>;
}
