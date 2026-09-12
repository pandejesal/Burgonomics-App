import { describe, it, expect } from "vitest";
import { validateAndCalculateCoupon } from "../src/features/offers/hooks/useCouponValidation";
import type { Offer } from "../src/features/offers/models";
import type { CartLine } from "../src/features/cart/models";

describe("Prompt 10: Deals, Offers & La Pino'z BOGO Engine Suite", () => {
  const baseOffer: Offer = {
    id: "promo_flat100",
    code: "DIRECT100",
    title: "Flat ₹100 Off",
    description: "Get ₹100 off on orders above ₹399",
    type: "coupon",
    discount: {
      mode: "flat",
      value: 100,
      label: "FLAT ₹100 OFF",
    },
    eligibility: {
      minOrderValue: 399,
    },
    status: "active",
    automatic: false,
    createdAt: new Date().toISOString(),
  };

  describe("1. Minimum Order Value (MOV) & Progress To Unlock", () => {
    it("fails when cart subtotal is below minimum order value and calculates shortfall", () => {
      const result = validateAndCalculateCoupon(baseOffer, 250, []);
      expect(result.isValid).toBe(false);
      expect(result.discountAmount).toBe(0);
      expect(result.progressToUnlock?.shortfall).toBe(149);
      expect(result.progressToUnlock?.percentage).toBe(63);
      expect(result.errorMessage).toContain("Add items worth ₹149 more");
    });

    it("passes when cart subtotal meets or exceeds minimum order value", () => {
      const result = validateAndCalculateCoupon(baseOffer, 450, []);
      expect(result.isValid).toBe(true);
      expect(result.discountAmount).toBe(100);
      expect(result.progressToUnlock).toBeUndefined();
    });
  });

  describe("2. Maximum Discount Cap Enforcement", () => {
    const percentOffer: Offer = {
      id: "promo_percent20",
      code: "BURGER20",
      title: "20% Off Burgers",
      description: "Get 20% off up to ₹150",
      type: "coupon",
      discount: {
        mode: "percent",
        value: 20,
        maxDiscount: 150,
        label: "20% OFF",
      },
      eligibility: {
        minOrderValue: 200,
      },
      status: "active",
      automatic: false,
      createdAt: new Date().toISOString(),
    };

    it("calculates 20% discount correctly when below max discount cap", () => {
      // 20% of 500 = 100 <= 150 cap
      const result = validateAndCalculateCoupon(percentOffer, 500, []);
      expect(result.isValid).toBe(true);
      expect(result.discountAmount).toBe(100);
    });

    it("caps discount at maxDiscount when 20% exceeds cap", () => {
      // 20% of 1000 = 200 > 150 cap -> should cap at 150
      const result = validateAndCalculateCoupon(percentOffer, 1000, []);
      expect(result.isValid).toBe(true);
      expect(result.discountAmount).toBe(150);
    });
  });

  describe("3. La Pino'z Inspired BOGO (Buy 1 Get 1 Free) Engine", () => {
    const bogoOffer: Offer = {
      id: "bogo_tuesday",
      code: "BURGERBOGO",
      title: "Buy 1 Get 1 Free",
      description: "Buy 2 Smashed Burgers, get lower priced one FREE",
      type: "combo",
      discount: {
        mode: "flat",
        label: "1+1 FREE",
      },
      status: "active",
      automatic: false,
      createdAt: new Date().toISOString(),
    };

    it("fails when fewer than 2 items are in the cart", () => {
      const singleItem: CartLine[] = [
        {
          lineId: "l1",
          storeId: "s1",
          productId: "p1",
          name: "Classic Smashed Burger",
          unitPrice: 249,
          quantity: 1,
          veg: true,
          modifiers: [],
        },
      ];
      const result = validateAndCalculateCoupon(bogoOffer, 249, singleItem);
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toContain("Add 2 or more eligible burgers");
      expect(result.progressToUnlock?.shortfall).toBe(1);
    });

    it("automatically discounts the lower-priced burger when 2 burgers of different prices are in cart", () => {
      const items: CartLine[] = [
        {
          lineId: "l1",
          storeId: "s1",
          productId: "p1",
          name: "Double Truffle Burger",
          unitPrice: 349,
          quantity: 1,
          veg: true,
          modifiers: [],
        },
        {
          lineId: "l2",
          storeId: "s1",
          productId: "p2",
          name: "Classic Smashed Burger",
          unitPrice: 249,
          quantity: 1,
          veg: true,
          modifiers: [],
        },
      ];
      const result = validateAndCalculateCoupon(bogoOffer, 598, items);
      expect(result.isValid).toBe(true);
      expect(result.discountAmount).toBe(249); // lowest item (₹249) is free
    });

    it("handles quantity >= 2 of the same burger correctly", () => {
      const items: CartLine[] = [
        {
          lineId: "l1",
          storeId: "s1",
          productId: "p1",
          name: "Classic Smashed Burger",
          unitPrice: 249,
          quantity: 2,
          veg: true,
          modifiers: [],
        },
      ];
      const result = validateAndCalculateCoupon(bogoOffer, 498, items);
      expect(result.isValid).toBe(true);
      expect(result.discountAmount).toBe(249); // one of the two is free
    });
  });
});
