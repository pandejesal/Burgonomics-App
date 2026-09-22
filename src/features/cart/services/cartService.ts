/**
 * CartService — Pure pricing calculation engine and cart validation logic.
 *
 * Encapsulates all line item calculations, fee additions, GST taxes,
 * packing charges, and promo evaluation via the canonical pricing engine.
 */
import type { ApiResult } from "@/core/network/http";
import { ok } from "@/core/network/http";
import type {
  AppliedPromo,
  CartLine,
  CartTotals,
  Fulfillment,
} from "@/features/cart/models";
import {
  calculateOrderTotals,
  computeItemUnitPrice,
  computeItemLineTotal,
  type PricingConfig,
  type StorePricingConfig,
} from "@/shared/pricing/pricingEngine";

/**
 * Computes the unit price of a single line item including all selected modifiers.
 */
export function computeLineUnitPrice(line: CartLine): number {
  return computeItemUnitPrice(line);
}

/**
 * Computes the total line price for a item taking quantity into account.
 */
export function computeLineTotal(line: CartLine): number {
  return computeItemLineTotal(line);
}

export interface CalculateInput {
  lines: CartLine[];
  fulfillment: Fulfillment;
  promo?: AppliedPromo | null;
  pricingConfig: PricingConfig | StorePricingConfig;
}

/**
 * Calculates complete order totals breakdown (subtotal, discounts, GST, fees, grand total).
 * Strict mode: Throws if pricingConfig is missing, ensuring no invented numbers on the client.
 */
export function calculateTotals(input: CalculateInput): CartTotals {
  const { lines = [], fulfillment, promo, pricingConfig } = input;
  if (!pricingConfig) {
    throw new Error(
      "PRICING_CONFIG_UNAVAILABLE: Store pricing configuration is required to calculate totals.",
    );
  }

  const totals = calculateOrderTotals({
    items: lines,
    fulfillment,
    promoDiscount: promo?.discount ?? 0,
    config: pricingConfig,
  });

  return {
    subtotal: totals.subtotal,
    itemDiscount: totals.itemDiscount,
    promoDiscount: totals.promoDiscount,
    taxes: totals.taxes,
    deliveryFee: totals.deliveryFee,
    packingFee: totals.packingFee,
    grandTotal: totals.grandTotal,
    currency: "INR",
  };
}
