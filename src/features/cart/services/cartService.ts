/**
 * CartService — Pure pricing calculation engine and cart validation logic.
 *
 * Encapsulates all line item calculations, fee additions, GST taxes,
 * packing charges, and promo evaluation via the canonical pricing engine.
 */
import type { ApiResult } from "@/core/network/http";
import { ok, delay } from "@/core/network/http";
import type {
  AppliedPromo,
  CartLine,
  CartTotals,
  CartValidation,
  Fulfillment,
} from "@/features/cart/models";
import {
  calculateOrderTotals,
  computeItemUnitPrice,
  computeItemLineTotal,
  DEFAULT_PRICING_CONFIG,
  type PricingConfig,
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
  pricingConfig?: PricingConfig | null;
}

/**
 * Calculates complete order totals breakdown (subtotal, discounts, GST, fees, grand total).
 */
export function calculateTotals(input: CalculateInput): CartTotals {
  const { lines = [], fulfillment, promo, pricingConfig } = input;
  const config = pricingConfig || DEFAULT_PRICING_CONFIG;

  const totals = calculateOrderTotals({
    items: lines,
    fulfillment,
    promoDiscount: promo?.discount ?? 0,
    config,
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

/**
 * Validates availability of cart items prior to checkout.
 */
export async function validateCartMock(lines: CartLine[]): Promise<ApiResult<CartValidation>> {
  await delay(150);
  const issues = lines
    .filter((line) => line.availability === "unavailable")
    .map((line) => ({
      lineId: line.lineId,
      code: "unavailable" as const,
      message: line.unavailableReason ?? `${line.name} is currently out of stock.`,
    }));

  return ok({ valid: issues.length === 0, issues });
}

/**
 * Prepares a secure checkout token handle for payment processing.
 */
export async function prepareCheckoutMock(
  lines: CartLine[],
): Promise<ApiResult<{ checkoutToken: string }>> {
  await delay(200);
  if (!lines.length) {
    return {
      success: false,
      error: { code: "EMPTY_CART", message: "Your cart is empty. Please add items to proceed." },
    };
  }

  return ok({ checkoutToken: `chk_${Date.now()}` });
}
