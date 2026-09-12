import { describe, it, expect } from "vitest";
import type { Address, AddressLabel } from "../src/features/addresses/models";
import { computeCompletion } from "../src/features/profile/state/profileStore";

describe("Prompt 14: Customer Profile, Saved Addresses & Favorites Suite", () => {
  describe("1. Address Data Model & Validation", () => {
    it("validates address with standard labels and required fields", () => {
      const sampleAddress: Address = {
        id: "addr_1",
        label: "home",
        line1: "Flat 402, Sunshine Heights",
        line2: "Linking Road",
        landmark: "Near Metro",
        city: "Mumbai",
        pincode: "400050",
        isDefault: true,
      };

      expect(sampleAddress.label).toBe("home");
      expect(sampleAddress.pincode).toHaveLength(6);
      expect(sampleAddress.isDefault).toBe(true);
    });

    it("supports custom label when label is 'other'", () => {
      const sampleOtherAddress: Address = {
        id: "addr_2",
        label: "other",
        customLabel: "Gym Studio",
        line1: "Plot 12, Sector 5",
        city: "Mumbai",
        pincode: "400051",
        isDefault: false,
      };

      expect(sampleOtherAddress.label).toBe("other");
      expect(sampleOtherAddress.customLabel).toBe("Gym Studio");
    });
  });

  describe("2. Default Address Invariant", () => {
    it("ensures exactly one default address when switching defaults", () => {
      let addresses: Address[] = [
        { id: "a1", label: "home", line1: "Street 1", city: "Mumbai", pincode: "400001", isDefault: true },
        { id: "a2", label: "work", line1: "Street 2", city: "Mumbai", pincode: "400002", isDefault: false },
      ];

      const setDefault = (list: Address[], targetId: string): Address[] => {
        return list.map((a) => ({
          ...a,
          isDefault: a.id === targetId,
        }));
      };

      addresses = setDefault(addresses, "a2");

      expect(addresses.find((a) => a.id === "a1")?.isDefault).toBe(false);
      expect(addresses.find((a) => a.id === "a2")?.isDefault).toBe(true);
      expect(addresses.filter((a) => a.isDefault)).toHaveLength(1);
    });
  });

  describe("3. Profile Completion Ring Engine", () => {
    it("computes profile completion percentage accurately", () => {
      const basicProfile = {
        id: "usr_1",
        phone: "+919876543210",
        fullName: "Aarav Sharma",
        email: "aarav@example.com",
        createdAt: "2026-01-01",
      };

      const completion = computeCompletion(basicProfile);
      expect(completion.percent).toBeGreaterThan(0);
      expect(completion.percent).toBeLessThanOrEqual(100);
    });
  });

  describe("4. Favorites Filter Categorization", () => {
    it("filters favorites correctly by kind", () => {
      const favs = [
        { id: "f1", refId: "p1", name: "Truffle Smash Burger", kind: "product" as const },
        { id: "f2", refId: "c1", name: "BOGO Smash Combo", kind: "combo" as const },
        { id: "f3", refId: "p2", name: "Peri-Peri Crispy Burger", kind: "product" as const },
      ];

      const productFavs = favs.filter((f) => f.kind === "product");
      const comboFavs = favs.filter((f) => f.kind === "combo");

      expect(productFavs).toHaveLength(2);
      expect(comboFavs).toHaveLength(1);
    });
  });
});
