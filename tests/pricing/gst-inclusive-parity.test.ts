/**
 * R1/R2 parity vectors (owner pricing decision, 31 October 2026).
 *
 * Menu prices are GST-INCLUSIVE. The GST share of an inclusive amount is
 * `amount * rate / (1 + rate)` — never `amount * rate` (which reports 5.25 on a
 * ₹105 bill where the true share is exactly ₹5.00). The backend asserts the
 * same four vectors; those numbers are the contract between the repos.
 *
 * Vectors: food 100, 105, 333, 1109, each with and without a ₹21 discount.
 * Fees are outside the GST base and are never taxed again.
 */
import { describe, expect, it } from "vitest";
import {
  calculateOrderTotals,
  toPaise,
  type PricingConfig,
} from "../../src/shared/pricing/pricingEngine";

const PACKAGING = 15; // server default packaging fee for this vector set
const DELIVERY = 47; // a courier-quoted fee, not a static one

/** Builds the exact input both repos assert on. */
function totalsFor(food: number, discount = 0, fulfillment: "delivery" | "takeaway" = "delivery") {
  const config: PricingConfig = {
    gstRate: 0.05,
    packagingFee: PACKAGING,
    deliveryFee: fulfillment === "delivery" ? DELIVERY : 0,
    minOrderAmount: 0,
  };
  return calculateOrderTotals({
    items: [{ unitPrice: food, quantity: 1 }],
    fulfillment,
    promoDiscount: discount,
    config,
  });
}

/** CGST + SGST must equal the reported GST to the paisa. */
const paise = (rupees: number) => Math.round(rupees * 100);

describe("R1 — GST is the inclusive share, never 5% on top", () => {
  const vectors: Array<{ food: number; discount: number; gst: number }> = [
    { food: 100, discount: 0, gst: 4.76 },
    { food: 105, discount: 0, gst: 5 },
    { food: 333, discount: 0, gst: 15.86 },
    { food: 1109, discount: 0, gst: 52.81 },
    { food: 100, discount: 21, gst: 3.76 },
    { food: 105, discount: 21, gst: 4 },
    { food: 333, discount: 21, gst: 14.86 },
    { food: 1109, discount: 21, gst: 51.81 },
  ];

  for (const v of vectors) {
    it(`reports ₹${v.gst} GST on ₹${v.food} food with ₹${v.discount} off`, () => {
      const totals = totalsFor(v.food, v.discount);
      expect(totals.taxes).toBe(v.gst);
      expect(paise(totals.cgst) + paise(totals.sgst)).toBe(paise(totals.taxes));
      // 105 is the documented regression: the old 5%-on-top maths said 5.25.
      if (v.food === 105 && v.discount === 0) expect(totals.taxes).not.toBe(5.25);
    });
  }
});

describe("R2 — grand total adds fees only, and the paise match", () => {
  it("never adds GST on top and rounds to paise exactly", () => {
    for (const food of [100, 105, 333, 1109]) {
      const totals = totalsFor(food);
      expect(totals.grandTotal).toBe(Math.round((food + PACKAGING + DELIVERY) * 100) / 100);
      expect(toPaise(totals.grandTotal)).toBe(Math.round((food + PACKAGING + DELIVERY) * 100));
    }
  });

  it("keeps the same total for takeaway without a delivery fee", () => {
    const totals = totalsFor(333, 0, "takeaway");
    expect(totals.deliveryFee).toBe(0);
    expect(totals.grandTotal).toBe(348);
  });
});
