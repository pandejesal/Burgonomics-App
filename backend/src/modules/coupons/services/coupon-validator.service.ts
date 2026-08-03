import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError, ValidationError } from '@common/errors';
import { DomainEventBus } from '@infra/events/domain-event-bus';
import type { CartEntity } from '@modules/cart/entities/cart.entity';
import {
  COUPON_REPOSITORY,
  type ICouponRepository,
} from '../repositories/interfaces/coupon-repository.interface';
import { COUPON_EVENTS, type CouponAppliedEvent } from '../events/coupon.events';
import type { CouponEntity } from '../entities/coupon.entity';

export interface CouponEvaluationResult {
  valid: boolean;
  reason?: string;
  coupon?: CouponEntity;
  estimatedDiscount?: string;
}

@Injectable()
export class CouponValidatorService {
  constructor(
    @Inject(COUPON_REPOSITORY) private readonly repo: ICouponRepository,
    private readonly bus: DomainEventBus,
  ) {}

  async validate(args: {
    code: string;
    userId?: string;
    storeId?: string;
    cart?: CartEntity | null;
  }): Promise<CouponEvaluationResult> {
    const coupon = await this.repo.findByCode(args.code);
    if (!coupon) return { valid: false, reason: 'COUPON_NOT_FOUND' };
    if (!coupon.isActive) return { valid: false, reason: 'COUPON_INACTIVE', coupon };

    const now = new Date();
    if (coupon.startsAt && coupon.startsAt > now)
      return { valid: false, reason: 'COUPON_NOT_STARTED', coupon };
    if (coupon.endsAt && coupon.endsAt < now)
      return { valid: false, reason: 'COUPON_EXPIRED', coupon };
    if (coupon.usageLimit != null && coupon.usageCount >= coupon.usageLimit) {
      return { valid: false, reason: 'COUPON_USAGE_LIMIT', coupon };
    }
    if (coupon.requiresLogin && !args.userId) {
      return { valid: false, reason: 'LOGIN_REQUIRED', coupon };
    }
    if (coupon.storeIds.length && args.storeId && !coupon.storeIds.includes(args.storeId)) {
      return { valid: false, reason: 'STORE_NOT_ELIGIBLE', coupon };
    }
    if (args.userId && coupon.perUserLimit != null) {
      const used = await this.repo.countUserRedemptions(coupon.id, args.userId);
      if (used >= coupon.perUserLimit) return { valid: false, reason: 'PER_USER_LIMIT', coupon };
    }

    const subtotal =
      args.cart?.items.reduce((s, i) => {
        const modTotal = i.modifiers.reduce((mm, m) => mm + Number(m.priceDelta), 0);
        return s + (Number(i.unitPrice) + modTotal) * i.quantity;
      }, 0) ?? 0;

    if (coupon.minOrderValue && subtotal < Number(coupon.minOrderValue)) {
      return { valid: false, reason: 'MIN_ORDER_VALUE_NOT_MET', coupon };
    }

    const estimatedDiscount = this.computeDiscount(coupon, subtotal);
    return { valid: true, coupon, estimatedDiscount: estimatedDiscount.toFixed(2) };
  }

  async apply(args: {
    code: string;
    userId: string;
    orderId?: string;
    cartId?: string;
    discount: string;
    correlationId?: string;
  }): Promise<void> {
    const coupon = await this.repo.findByCode(args.code);
    if (!coupon) throw new NotFoundError('Coupon not found');
    await this.repo.recordRedemption({
      couponId: coupon.id,
      userId: args.userId,
      orderId: args.orderId,
      discount: args.discount,
    });
    await this.repo.incrementUsage(coupon.id);
    this.bus.publish<CouponAppliedEvent>(COUPON_EVENTS.APPLIED, {
      couponId: coupon.id,
      code: coupon.code,
      userId: args.userId,
      cartId: args.cartId,
      orderId: args.orderId,
      discount: args.discount,
      correlationId: args.correlationId,
    });
  }

  computeDiscount(coupon: CouponEntity, subtotal: number): number {
    let discount = 0;
    switch (coupon.discountKind) {
      case 'PERCENTAGE':
        discount = subtotal * (Number(coupon.discountValue) / 100);
        break;
      case 'FLAT':
        discount = Number(coupon.discountValue);
        break;
      case 'FREE_ITEM':
      case 'BOGO':
        // Future: resolved by dedicated engine
        discount = 0;
        break;
      default:
        throw new ValidationError('Unsupported coupon type');
    }
    if (coupon.maxDiscount) discount = Math.min(discount, Number(coupon.maxDiscount));
    return Math.max(0, Math.min(discount, subtotal));
  }
}
