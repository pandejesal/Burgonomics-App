import { useMemo, useCallback } from "react";
import { useCartStore } from "@/features/cart/state/cartStore";
import type { CartLine } from "@/features/cart/models";
import type { Offer } from "../models";

export interface CouponValidationResult {
  isValid: boolean;
  discountAmount: number;
  errorMessage?: string;
  progressToUnlock?: {
    shortfall: number;
    required: number;
    current: number;
    percentage: number;
  };
}

/**
 * Pure coupon calculation engine verifying Minimum Order Value, Max Discount Cap, and BOGO pair rules.
 */
export function validateAndCalculateCoupon(
  offer: Offer,
  cartSubtotal: number,
  cartLines: CartLine[] = []
): CouponValidationResult {
  const minOrder = offer.eligibility?.minOrderValue || 0;

  // 1. Check Minimum Order Value (MOV)
  if (cartSubtotal < minOrder) {
    const shortfall = minOrder - cartSubtotal;
    const percentage = Math.min(100, Math.round((cartSubtotal / minOrder) * 100));
    return {
      isValid: false,
      discountAmount: 0,
      errorMessage: `Add items worth ₹${shortfall} more to unlock this offer`,
      progressToUnlock: {
        shortfall,
        required: minOrder,
        current: cartSubtotal,
        percentage,
      },
    };
  }

  // 2. BOGO Promotion (Buy 1 Get 1 Free - lowest priced eligible item free)
  if (offer.type === "combo" || offer.code?.toUpperCase().includes("BOGO")) {
    const expandedItems: { price: number; name: string }[] = [];
    cartLines.forEach((l) => {
      for (let i = 0; i < l.quantity; i++) {
        expandedItems.push({ price: l.unitPrice, name: l.name });
      }
    });

    if (expandedItems.length < 2) {
      return {
        isValid: false,
        discountAmount: 0,
        errorMessage: "Add 2 or more eligible burgers to activate Buy 1 Get 1 Free",
        progressToUnlock: {
          shortfall: 1,
          required: 2,
          current: expandedItems.length,
          percentage: (expandedItems.length / 2) * 100,
        },
      };
    }

    // Sort ascending by price: lowest item is free
    const sorted = [...expandedItems].sort((a, b) => a.price - b.price);
    const bogoFreeDiscount = sorted[0].price;

    return {
      isValid: true,
      discountAmount: bogoFreeDiscount,
    };
  }

  // 3. Flat or Percentage Discount
  let calculatedDiscount = 0;
  if (offer.discount.mode === "flat") {
    calculatedDiscount = offer.discount.value || 0;
  } else if (offer.discount.mode === "percent" && offer.discount.value) {
    calculatedDiscount = Math.round((cartSubtotal * offer.discount.value) / 100);
  }

  // 4. Max Discount Cap Enforcement
  if (offer.discount.maxDiscount && offer.discount.maxDiscount > 0) {
    calculatedDiscount = Math.min(calculatedDiscount, offer.discount.maxDiscount);
  }

  return {
    isValid: true,
    discountAmount: calculatedDiscount,
  };
}

export function useCouponValidation() {
  const lines = useCartStore((s) => s.lines);
  const promo = useCartStore((s) => s.promo);

  const subtotal = useMemo(() => {
    return lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  }, [lines]);

  const checkCoupon = useCallback(
    (offer: Offer): CouponValidationResult => {
      return validateAndCalculateCoupon(offer, subtotal, lines);
    },
    [subtotal, lines]
  );

  return {
    subtotal,
    cartLinesCount: lines.length,
    appliedPromo: promo,
    checkCoupon,
  };
}
