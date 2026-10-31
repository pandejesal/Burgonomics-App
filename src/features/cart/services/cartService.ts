/**
 * CartService — Pure pricing calculation engine and cart validation logic.
 *
 * Encapsulates all line item calculations, order-level fees, the GST already
 * embedded in menu prices, and promo evaluation via the canonical pricing
 * engine. Fee schedules are never built here — they come from
 * `resolvePricingConfig` (see CartRepository), so the cart, the checkout
 * screen and the gateway all charge the same numbers.
 */
import type { AppliedPromo, CartLine, CartTotals, Fulfillment } from "@/features/cart/models";
import {
  calculateOrderTotals,
  computeItemUnitPrice,
  computeItemLineTotal,
  resolvePricingConfig,
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
  /**
   * Resolved pricing schedule (fees + GST rate + minimum). Built by
   * `resolvePricingConfig`; when omitted it is derived from the launch
   * schedule with the sandbox delivery quote.
   */
  pricingConfig?: PricingConfig;
  /** Store-level overrides, e.g. a per-outlet minimum order amount. */
  storePricingOverride?: { minOrderAmount?: number | null } | null;
  /** Live delivery quote (₹). Ignored for takeaway / dine-in. */
  deliveryQuoteFee?: number | null;
}

/**
 * Calculates the complete order breakdown (subtotal, discounts, embedded GST,
 * packaging, delivery, grand total).
 *
 * GST-inclusive: `taxes`/`cgst`/`sgst` describe money contained in
 * `subtotal` and are never added to the total.
 */
export function calculateTotals(input: CalculateInput): CartTotals {
  const { lines = [], fulfillment, promo, storePricingOverride, deliveryQuoteFee } = input;

  const pricingConfig =
    input.pricingConfig ??
    resolvePricingConfig({
      fulfillment,
      deliveryQuoteFee,
      storeOverride: storePricingOverride,
    });

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
    cgst: totals.cgst,
    sgst: totals.sgst,
    gstRate: totals.gstRate,
    deliveryFee: totals.deliveryFee,
    packingFee: totals.packagingFee,
    grandTotal: totals.grandTotal,
    currency: "INR",
  };
}
