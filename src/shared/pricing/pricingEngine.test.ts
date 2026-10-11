import { describe, it, expect } from "vitest";
import {
  calculateOrderTotals,
  computeItemUnitPrice,
  computeItemLineTotal,
  DEFAULT_PRICING_CONFIG,
  type PricingLineItem,
} from "@/shared/pricing/pricingEngine";

/**
 * Regression suite for the add-on double-charge (Store-Readiness audit).
 *
 * `CartLine.unitPrice` is all-in — the customization modal and product page
 * bake `Σ modifier.priceDelta` into it before the line exists. Every display
 * path (cart rows, floating bar, order review, invoice, coupon math, Petpooja
 * POS payload) reads `unitPrice * qty`, so `computeItemUnitPrice` must not add
 * the deltas a second time.
 */
describe("pricingEngine — all-in unit price contract", () => {
  const customized = {
    unitPrice: 399, // 299 base + 40 bun + 35 cheese + 25 jalapeños
    price: 399,
    quantity: 2,
    modifiers: [
      { groupId: "grp_bun", optionId: "opt_gluten_free", priceDelta: 40 },
      { groupId: "grp_cheese", optionId: "opt_cheddar", priceDelta: 35 },
      { groupId: "grp_cheese", optionId: "opt_jalapenos", priceDelta: 25 },
    ],
  } as unknown as PricingLineItem;

  it("does not re-add modifier deltas to an all-in unitPrice", () => {
    expect(computeItemUnitPrice(customized)).toBe(399);
    expect(computeItemLineTotal(customized)).toBe(798);
  });

  it("still prices a legacy base-shaped line (price only) from its modifiers", () => {
    const legacy = {
      price: 299,
      quantity: 1,
      modifiers: [{ groupId: "grp_bun", optionId: "opt_gluten_free", priceDelta: 40 }],
    } as unknown as PricingLineItem;

    expect(computeItemUnitPrice(legacy)).toBe(339);
  });

  it("fails closed on a non-finite unit price", () => {
    expect(computeItemUnitPrice({ unitPrice: Number.NaN } as PricingLineItem)).toBe(0);
    expect(computeItemUnitPrice({ unitPrice: -5 } as PricingLineItem)).toBe(0);
    expect(computeItemUnitPrice(null as unknown as PricingLineItem)).toBe(0);
  });

  it("keeps subtotal free of a second GST pass — grandTotal adds fees only", () => {
    const totals = calculateOrderTotals({
      items: [customized],
      fulfillment: "delivery",
      config: DEFAULT_PRICING_CONFIG,
    });

    // GST is inclusive: subtotal is the GST-inclusive line amount, and the
    // grand total adds packaging + delivery but never `taxes` again.
    expect(totals.subtotal).toBe(798);
    expect(totals.grandTotal).toBe(
      Math.round((798 + DEFAULT_PRICING_CONFIG.packagingFee + DEFAULT_PRICING_CONFIG.deliveryFee) * 100) /
        100,
    );
    expect(totals.grandTotal).toBeGreaterThanOrEqual(totals.subtotal);
    expect(totals.taxes).toBeGreaterThan(0);
  });
});
