import { Injectable } from '@nestjs/common';
import { ValidationError } from '@common/errors';
import { StoresService } from '@modules/stores/services/stores.service';
import { CartService } from '@modules/cart/services/cart.service';
import { CouponValidatorService } from '@modules/coupons/services/coupon-validator.service';
import { InventoryValidatorService } from '@modules/orders/services/inventory-validator.service';
import type { CartEntity } from '@modules/cart/entities/cart.entity';
import type { CheckoutIssueDto } from '../dto';

export interface CheckoutValidationResult {
  valid: boolean;
  issues: CheckoutIssueDto[];
  couponDiscount: string;
  prepEtaMinutes: number;
}

@Injectable()
export class CheckoutValidatorService {
  constructor(
    private readonly cart: CartService,
    private readonly stores: StoresService,
    private readonly coupons: CouponValidatorService,
    private readonly inventory: InventoryValidatorService,
  ) {}

  async validate(args: {
    cart: CartEntity;
    userId: string;
    couponCode?: string | null;
  }): Promise<CheckoutValidationResult> {
    const issues: CheckoutIssueDto[] = [];

    const cartCheck = await this.cart.validateForCheckout(args.cart);
    for (const i of cartCheck.issues) issues.push(i);

    if (!args.cart.storeId) {
      return { valid: false, issues, couponDiscount: '0', prepEtaMinutes: 0 };
    }

    const store = await this.stores.get(args.cart.storeId);
    if (!this.stores.isOpen(store.store)) {
      issues.push({
        code: 'STORE_CLOSED',
        message: 'Selected store is not accepting orders right now',
      });
    }

    try {
      await this.inventory.assertCartIsFulfillable(args.cart);
    } catch (err) {
      if (err instanceof ValidationError) {
        issues.push({ code: 'UNFULFILLABLE', message: err.message });
      } else throw err;
    }

    let couponDiscount = '0';
    if (args.couponCode) {
      const r = await this.coupons.validate({
        code: args.couponCode,
        userId: args.userId,
        storeId: args.cart.storeId,
        cart: args.cart,
      });
      if (!r.valid) {
        issues.push({ code: r.reason ?? 'COUPON_INVALID', message: 'Coupon not applicable' });
      } else {
        couponDiscount = r.estimatedDiscount ?? '0';
      }
    }

    const prepEtaMinutes = this.estimateEta(args.cart);
    return {
      valid: issues.length === 0,
      issues,
      couponDiscount,
      prepEtaMinutes,
    };
  }

  private estimateEta(cart: CartEntity): number {
    const base = cart.fulfillment === 'DELIVERY' ? 35 : 20;
    const perItem = 1;
    const items = cart.items.reduce((s, i) => s + i.quantity, 0);
    return base + Math.min(20, items * perItem);
  }
}
