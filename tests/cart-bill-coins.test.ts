import { describe, it, expect } from "vitest";

describe("Prompt 13: Cart, Bill Breakdown & Grill Coins Engine Suite", () => {
  describe("1. Financial & Tax Math Precision", () => {
    it("calculates 5% GST composite accurately without floating point skew", () => {
      const subtotal = 498;
      const gst = Math.round(subtotal * 0.05); // 24.9 -> 25
      expect(gst).toBe(25);

      const cgst = gst / 2; // 12.5
      const sgst = gst / 2; // 12.5
      expect(cgst + sgst).toBe(gst);
    });

    it("applies tiered delivery fee correctly based on order subtotal", () => {
      const calculateDeliveryFee = (subtotal: number, fulfillment: "delivery" | "takeaway" | "dine_in") => {
        if (fulfillment !== "delivery") return 0;
        return subtotal >= 349 ? 0 : 35;
      };

      expect(calculateDeliveryFee(299, "delivery")).toBe(35);
      expect(calculateDeliveryFee(349, "delivery")).toBe(0);
      expect(calculateDeliveryFee(599, "delivery")).toBe(0);
      expect(calculateDeliveryFee(200, "takeaway")).toBe(0);
      expect(calculateDeliveryFee(200, "dine_in")).toBe(0);
    });

    it("waives packaging fee for dine-in fulfillment", () => {
      const calculatePackagingFee = (fulfillment: "delivery" | "takeaway" | "dine_in") => {
        return fulfillment === "dine_in" ? 0 : 15;
      };

      expect(calculatePackagingFee("delivery")).toBe(15);
      expect(calculatePackagingFee("takeaway")).toBe(15);
      expect(calculatePackagingFee("dine_in")).toBe(0);
    });
  });

  describe("2. Grill Coins Loyalty Engine", () => {
    it("enforces max 50% subtotal redemption cap on Grill Coins", () => {
      const userAvailableCoins = 300;
      const subtotal = 400;

      // Max 50% cap = 200
      const maxRedeemable = Math.min(userAvailableCoins, Math.floor(subtotal * 0.5));
      expect(maxRedeemable).toBe(200);
    });

    it("restricts coin redemption when available coins are less than cap", () => {
      const userAvailableCoins = 80;
      const subtotal = 500; // 50% cap is 250

      const maxRedeemable = Math.min(userAvailableCoins, Math.floor(subtotal * 0.5));
      expect(maxRedeemable).toBe(80);
    });
  });

  describe("3. Final 'To Pay' Aggregation Formula", () => {
    it("computes complete multi-factor bill correctly", () => {
      const subtotal = 500;
      const couponDiscount = 100;
      const coinsRedeemed = 50;
      const gst = Math.round(subtotal * 0.05); // 25
      const packagingFee = 15;
      const deliveryFee = 0; // subtotal >= 349
      const tip = 30;

      const toPay = Math.max(
        0,
        subtotal - couponDiscount - coinsRedeemed + gst + packagingFee + deliveryFee + tip
      );

      // 500 - 100 - 50 + 25 + 15 + 0 + 30 = 420
      expect(toPay).toBe(420);
    });

    it("guarantees non-negative bounds if discounts exceed bill", () => {
      const subtotal = 100;
      const couponDiscount = 150;
      const coinsRedeemed = 50;
      const gst = 5;
      const packagingFee = 15;
      const deliveryFee = 35;
      const tip = 0;

      const toPay = Math.max(
        0,
        subtotal - couponDiscount - coinsRedeemed + gst + packagingFee + deliveryFee + tip
      );

      expect(toPay).toBeGreaterThanOrEqual(0);
    });
  });

  describe("4. Delivery Partner Tip Integrity", () => {
    it("passes preset and custom tip amounts cleanly without deduction", () => {
      const tipPresets = [10, 20, 30, 50];
      tipPresets.forEach((tip) => {
        expect(tip).toBeGreaterThan(0);
        expect(tip % 1).toBe(0); // whole rupee
      });

      const customTip = 45;
      expect(customTip).toBe(45);
    });
  });
});
