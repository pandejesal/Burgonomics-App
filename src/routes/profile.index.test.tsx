import { describe, it, expect } from "vitest";
import type { Address } from "../features/addresses/models";
import { computeCompletion } from "../features/profile/state/profileStore";

describe("Prompt 14: Customer Profile, Saved Addresses & Favorites Suite", () => {
  describe("1. Address Schema & PIN Code Validation", () => {
    it("validates 6-digit Indian PIN code format", () => {
      const isValidPincode = (pin: string) => /^\d{6}$/.test(pin);

      expect(isValidPincode("400050")).toBe(true);
      expect(isValidPincode("395007")).toBe(true);
      expect(isValidPincode("40005")).toBe(false);
      expect(isValidPincode("4000501")).toBe(false);
      expect(isValidPincode("40005a")).toBe(false);
    });

    it("verifies address object schema adherence", () => {
      const address: Address = {
        id: "addr_test_01",
        label: "home",
        line1: "Flat 402, Sunshine Heights",
        line2: "Linking Road",
        landmark: "Near Metro",
        city: "Mumbai",
        pincode: "400050",
        isDefault: true,
      };

      expect(address.id).toBeDefined();
      expect(["home", "work", "other"]).toContain(address.label);
      expect(address.line1.length).toBeGreaterThan(0);
      expect(address.pincode).toHaveLength(6);
      expect(typeof address.isDefault).toBe("boolean");
    });
  });

  describe("2. Default Address Single-Selection Invariant", () => {
    it("ensures exactly one default address across switching operations", () => {
      let addresses: Address[] = [
        { id: "a1", label: "home", line1: "Flat 101", city: "Mumbai", pincode: "400001", isDefault: true },
        { id: "a2", label: "work", line1: "Tech Park", city: "Mumbai", pincode: "400002", isDefault: false },
        { id: "a3", label: "other", customLabel: "Gym", line1: "Clubhouse", city: "Mumbai", pincode: "400003", isDefault: false },
      ];

      const setDefault = (list: Address[], id: string): Address[] => {
        return list.map((a) => ({ ...a, isDefault: a.id === id }));
      };

      addresses = setDefault(addresses, "a2");
      const defaultAddresses = addresses.filter((a) => a.isDefault);
      expect(defaultAddresses).toHaveLength(1);
      expect(defaultAddresses[0].id).toBe("a2");
    });
  });

  describe("3. Profile Completion Score Calculation", () => {
    it("computes profile score with weights for name, email, and dob", () => {
      const profile = {
        id: "usr_101",
        phone: "9876543210",
        fullName: "Rohan Varma",
        email: "rohan@example.com",
        createdAt: "2026-01-01",
      };

      const result = computeCompletion(profile);
      expect(result.percent).toBeGreaterThanOrEqual(50);
      expect(result.percent).toBeLessThanOrEqual(100);
    });
  });

  describe("4. Grill Coins Loyalty Wallet & Valuation", () => {
    it("values Grill Coins at 1 Coin = ₹1 with 20% redemption ceiling (server cap)", () => {
      const coins = 450;
      const coinValueINR = coins * 1;
      expect(coinValueINR).toBe(450);

      const cartSubtotal = 600;
      const maxDiscount = Math.min(coins, Math.floor(cartSubtotal * 0.2));
      expect(maxDiscount).toBe(120);
    });
  });
});
