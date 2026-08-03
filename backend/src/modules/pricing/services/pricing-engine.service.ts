import { Injectable } from '@nestjs/common';
import type { CartItemEntity } from '@modules/cart/entities/cart-item.entity';
import type { FulfillmentType } from '@modules/cart/entities/cart.entity';
import type { CartTotalsDto } from '@modules/cart/dto';

/**
 * PricingEngine — deterministic, side-effect-free composition of pricing
 * rules. Order of application:
 *   1. item pricing (unit × qty + modifiers)
 *   2. offer & coupon discounts (already resolved by callers)
 *   3. taxes on the discounted taxable base
 *   4. service charge, packing charge, delivery fee
 *   5. round-off
 *
 * The engine is intentionally isolated so new pricing rules (loyalty,
 * membership, dynamic pricing) can be added without touching Cart,
 * Checkout, or Orders.
 */

export interface PriceCartInput {
  items: CartItemEntity[];
  fulfillment: FulfillmentType;
  currency: string;
  offerDiscount?: string; // decimal string
  couponDiscount?: string; // decimal string
  serviceChargeRate?: number; // e.g. 0.05
  packingChargePerItem?: number; // e.g. 5
  deliveryFee?: number; // resolved by callers
  loyaltyDiscount?: string; // future
  membershipDiscount?: string; // future
}

const round2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class PricingEngineService {
  priceCart(input: PriceCartInput): CartTotalsDto {
    const currency = input.currency;

    // 1) Item + modifier subtotal, per-line and aggregated tax
    let subtotal = 0;
    let taxable = 0;
    let taxes = 0;

    for (const item of input.items) {
      const modTotal = item.modifiers.reduce((s, m) => s + Number(m.priceDelta), 0);
      const unit = Number(item.unitPrice) + modTotal;
      const lineTotal = unit * item.quantity;
      subtotal += lineTotal;
      taxable += lineTotal;
      taxes += lineTotal * (Number(item.taxRate) / 100);
    }

    const itemDiscount = 0; // populated when PETPOOJA exposes item-level offers
    const offerDiscount = Number(input.offerDiscount ?? 0);
    const couponDiscount = Number(input.couponDiscount ?? 0);
    const loyaltyDiscount = Number(input.loyaltyDiscount ?? 0);
    const membershipDiscount = Number(input.membershipDiscount ?? 0);

    const totalDiscount =
      itemDiscount + offerDiscount + couponDiscount + loyaltyDiscount + membershipDiscount;
    taxable = Math.max(0, taxable - totalDiscount);
    // Rescale tax proportionally when discounts reduce the base.
    if (subtotal > 0) {
      taxes = round2(taxes * (taxable / (subtotal || 1)));
    }

    const packingFee =
      input.packingChargePerItem != null && input.items.length
        ? input.items.reduce((s, i) => s + i.quantity, 0) * input.packingChargePerItem
        : 0;

    const deliveryFee = input.fulfillment === 'DELIVERY' ? Number(input.deliveryFee ?? 0) : 0;

    const serviceCharge = input.serviceChargeRate ? round2(taxable * input.serviceChargeRate) : 0;

    const preRound =
      Math.max(0, subtotal - totalDiscount) + taxes + packingFee + deliveryFee + serviceCharge;
    const grandTotal = Math.round(preRound);
    const roundOff = round2(grandTotal - preRound);

    return {
      subtotal: round2(subtotal).toFixed(2),
      itemDiscount: round2(itemDiscount).toFixed(2),
      offerDiscount: round2(offerDiscount).toFixed(2),
      couponDiscount: round2(couponDiscount).toFixed(2),
      taxes: round2(taxes).toFixed(2),
      packingFee: round2(packingFee).toFixed(2),
      deliveryFee: round2(deliveryFee).toFixed(2),
      serviceCharge: round2(serviceCharge).toFixed(2),
      roundOff: round2(roundOff).toFixed(2),
      grandTotal: grandTotal.toFixed(2),
      currency,
    };
  }
}
