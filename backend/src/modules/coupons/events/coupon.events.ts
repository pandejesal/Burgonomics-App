export const COUPON_EVENTS = {
  VALIDATED: 'coupon.validated',
  APPLIED: 'coupon.applied',
  REMOVED: 'coupon.removed',
  REDEEMED: 'coupon.redeemed',
  REJECTED: 'coupon.rejected',
} as const;

export interface CouponAppliedEvent {
  couponId: string;
  code: string;
  userId: string;
  cartId?: string;
  orderId?: string;
  discount: string;
  correlationId?: string;
}
