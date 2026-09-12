import { describe, it, expect } from 'vitest';

export interface CouponRule {
  code: string;
  discountType: 'percentage' | 'flat';
  discountValue: number; // e.g. 20 for 20% or 100 for ₹100
  minOrderValuePaise: number;
  maxDiscountPaise: number;
  isFirstOrderOnly?: boolean;
  applicableCategoryIds?: string[];
  excludedCategoryIds?: string[];
  expiresAtTimestamp?: number;
}

export interface CartPricingItem {
  id: string;
  categoryId: string;
  pricePaise: number;
  quantity: number;
}

export interface CouponValidationResult {
  isValid: boolean;
  discountPaise: number;
  shortfallPaise: number;
  error?: string;
}

export function validateAndApplyCoupon(
  coupon: CouponRule,
  cartItems: CartPricingItem[],
  isFirstOrder = false,
  nowMs = Date.now()
): CouponValidationResult {
  // Check expiry
  if (coupon.expiresAtTimestamp && nowMs > coupon.expiresAtTimestamp) {
    return { isValid: false, discountPaise: 0, shortfallPaise: 0, error: 'Coupon has expired.' };
  }

  // Check first order restriction
  if (coupon.isFirstOrderOnly && !isFirstOrder) {
    return {
      isValid: false,
      discountPaise: 0,
      shortfallPaise: 0,
      error: 'Coupon is valid only on your first order.',
    };
  }

  // Calculate eligible subtotal
  let eligibleSubtotalPaise = 0;
  let totalSubtotalPaise = 0;

  for (const item of cartItems) {
    const itemTotal = item.pricePaise * item.quantity;
    totalSubtotalPaise += itemTotal;

    const isExcluded = coupon.excludedCategoryIds?.includes(item.categoryId);
    const isApplicable =
      !coupon.applicableCategoryIds ||
      coupon.applicableCategoryIds.includes(item.categoryId);

    if (!isExcluded && isApplicable) {
      eligibleSubtotalPaise += itemTotal;
    }
  }

  // Check Minimum Order Value
  if (totalSubtotalPaise < coupon.minOrderValuePaise) {
    const shortfall = coupon.minOrderValuePaise - totalSubtotalPaise;
    return {
      isValid: false,
      discountPaise: 0,
      shortfallPaise: shortfall,
      error: `Add items worth ₹${(shortfall / 100).toFixed(0)} more to unlock coupon ${coupon.code}.`,
    };
  }

  if (eligibleSubtotalPaise <= 0) {
    return {
      isValid: false,
      discountPaise: 0,
      shortfallPaise: 0,
      error: 'No eligible items in cart for this coupon.',
    };
  }

  // Calculate discount
  let rawDiscountPaise = 0;
  if (coupon.discountType === 'percentage') {
    rawDiscountPaise = Math.round((eligibleSubtotalPaise * coupon.discountValue) / 100);
  } else {
    rawDiscountPaise = coupon.discountValue * 100;
  }

  const finalDiscountPaise = Math.min(rawDiscountPaise, coupon.maxDiscountPaise);

  return {
    isValid: true,
    discountPaise: finalDiscountPaise,
    shortfallPaise: 0,
  };
}

describe('Customer App — Coupon Validation & Promotion Engine Suite', () => {
  const sampleItems: CartPricingItem[] = [
    { id: 'b1', categoryId: 'burgers', pricePaise: 24900, quantity: 2 }, // ₹498.00
    { id: 'f1', categoryId: 'sides', pricePaise: 12900, quantity: 1 }, // ₹129.00
    { id: 'c1', categoryId: 'beverages', pricePaise: 6000, quantity: 1 }, // ₹60.00
  ];
  // Total Subtotal = 498 + 129 + 60 = ₹687.00 (68,700 paise)

  it('successfully applies percentage coupon with max discount cap', () => {
    const coupon: CouponRule = {
      code: 'BURGER30',
      discountType: 'percentage',
      discountValue: 30, // 30% OFF
      minOrderValuePaise: 40000, // ₹400 MOV
      maxDiscountPaise: 10000, // ₹100 Max cap
    };

    const res = validateAndApplyCoupon(coupon, sampleItems);
    expect(res.isValid).toBe(true);
    // 30% of ₹687 = ₹206.10, capped at max ₹100 (10,000 paise)
    expect(res.discountPaise).toBe(10000);
  });

  it('calculates shortfall when order does not meet minimum order value', () => {
    const coupon: CouponRule = {
      code: 'FEAST1000',
      discountType: 'flat',
      discountValue: 200,
      minOrderValuePaise: 100000, // ₹1,000 MOV
      maxDiscountPaise: 20000,
    };

    const res = validateAndApplyCoupon(coupon, sampleItems);
    expect(res.isValid).toBe(false);
    // Total subtotal ₹687, MOV ₹1,000 -> shortfall = ₹313 (31,300 paise)
    expect(res.shortfallPaise).toBe(31300);
    expect(res.error).toContain('Add items worth ₹313 more');
  });

  it('excludes beverages and combos when category restrictions apply', () => {
    const coupon: CouponRule = {
      code: 'BURGERONLY20',
      discountType: 'percentage',
      discountValue: 20, // 20% OFF
      minOrderValuePaise: 30000,
      maxDiscountPaise: 15000,
      applicableCategoryIds: ['burgers'], // Burgers only (₹498 eligible)
    };

    const res = validateAndApplyCoupon(coupon, sampleItems);
    expect(res.isValid).toBe(true);
    // 20% of ₹498 = ₹99.60 (9,960 paise)
    expect(res.discountPaise).toBe(9960);
  });

  it('rejects first-order-only coupons for repeat customers', () => {
    const coupon: CouponRule = {
      code: 'WELCOME50',
      discountType: 'percentage',
      discountValue: 50,
      minOrderValuePaise: 20000,
      maxDiscountPaise: 15000,
      isFirstOrderOnly: true,
    };

    const res = validateAndApplyCoupon(coupon, sampleItems, false);
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('first order');
  });

  it('rejects expired coupons with clear error message', () => {
    const coupon: CouponRule = {
      code: 'EXPIRED10',
      discountType: 'flat',
      discountValue: 50,
      minOrderValuePaise: 10000,
      maxDiscountPaise: 5000,
      expiresAtTimestamp: 1000,
    };

    const res = validateAndApplyCoupon(coupon, sampleItems, true, 2000);
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('Coupon has expired');
  });
});
