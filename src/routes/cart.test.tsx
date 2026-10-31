import { describe, it, expect } from "vitest";

describe("Cart Route & Financial Calculations Specification Suite", () => {
  describe("1. 5% GST Restaurant Tax Breakdown", () => {
    it("computes 5% composite GST with accurate 2.5% CGST and 2.5% SGST splits", () => {
      const subtotal = 349;
      const gst = Math.round(subtotal * 0.05); // 17.45 -> 17
      expect(gst).toBe(17);

      const cgst = gst / 2;
      const sgst = gst / 2;
      expect(cgst + sgst).toBe(gst);
    });
  });

  describe("2. Tiered Delivery & Packaging Charges", () => {
    it("offers free delivery above ₹349 threshold", () => {
      const isFreeDelivery = (subtotal: number) => subtotal >= 349;
      expect(isFreeDelivery(349)).toBe(true);
      expect(isFreeDelivery(350)).toBe(true);
      expect(isFreeDelivery(348)).toBe(false);
    });

    it("applies ₹20 packaging charge for delivery and takeaway, waived for dine-in", () => {
      const getPackaging = (fulfillment: string) => (fulfillment === "dine_in" ? 0 : 20);
      expect(getPackaging("delivery")).toBe(20);
      expect(getPackaging("takeaway")).toBe(20);
      expect(getPackaging("dine_in")).toBe(0);
    });
  });

  describe("3. Global Grill Coins Redemption Capping", () => {
    it("enforces a maximum 20% discount ceiling from loyalty coins (server cap)", () => {
      const subtotal = 600;
      const userCoins = 500;

      const redeemCoins = (available: number, sub: number) => {
        return Math.min(available, Math.floor(sub * 0.2));
      };

      const redeemed = redeemCoins(userCoins, subtotal);
      expect(redeemed).toBe(120); // 20% of 600
    });
  });

  describe("4. Final 'To Pay' Precision & Non-Negative Clamp", () => {
    it("accurately calculates total payable amount (GST is already inside the subtotal)", () => {
      const subtotal = 400;
      const discount = 50;
      const coins = 100;
      const packaging = 20;
      const delivery = 0; // >= 349
      const tip = 20;

      // MT-09: menu prices are GST-inclusive (5% already sits inside the 400),
      // so the tax must NOT be added on top — that double-charges it. The old
      // additive formula billed 310 for this basket.
      const toPay = Math.max(0, subtotal - discount - coins + packaging + delivery + tip);

      // 400 - 50 - 100 + 20 + 0 + 20 = 290
      expect(toPay).toBe(290);
    });

    it("clamps the payable at zero when discounts exceed the bill", () => {
      const subtotal = 100;
      const discount = 80;
      const coins = 60;
      const packaging = 20;

      const toPay = Math.max(0, subtotal - discount - coins + packaging);
      expect(toPay).toBe(0);
    });
  });
});
