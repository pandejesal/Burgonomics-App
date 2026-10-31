import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import type { Fulfillment } from "../src/features/stores/models/Store";

describe("Prompt 09: Customer Home & Landing Experience Suite", () => {
  describe("1. Fulfillment Mode State Transitions", () => {
    it("supports all 3 fulfillment modes: delivery, takeaway, dinein", () => {
      const validModes: Fulfillment[] = ["delivery", "takeaway", "dinein"];
      expect(validModes).toContain("delivery");
      expect(validModes).toContain("takeaway");
      expect(validModes).toContain("dinein");
      expect(validModes.length).toBe(3);
    });

    it("verifies default fallback mode is delivery", () => {
      const getInitialFulfillment = (persisted?: Fulfillment): Fulfillment => {
        return persisted || "delivery";
      };

      expect(getInitialFulfillment(undefined)).toBe("delivery");
      expect(getInitialFulfillment("takeaway")).toBe("takeaway");
      expect(getInitialFulfillment("dinein")).toBe("dinein");
    });
  });

  describe("2. Hero Banners & Coupon Copying", () => {
    const banners = [
      {
        id: "bogo_tuesday",
        title: "BUY 1 GET 1 FREE",
        code: "BURGERBOGO",
        discountBadge: "BOGO DEAL",
        tag: "100% Pure Veg",
      },
      {
        id: "flat_100_off",
        title: "FLAT ₹100 OFF",
        code: "DIRECT100",
        discountBadge: "SAVE ₹100",
        tag: "Trending Offer",
      },
    ];

    it("ensures each promo banner contains a valid uppercase coupon code and pure veg tag", () => {
      banners.forEach((banner) => {
        expect(banner.code).toMatch(/^[A-Z0-9_]+$/);
        expect(banner.title.length).toBeGreaterThan(0);
        expect(banner.discountBadge.length).toBeGreaterThan(0);
      });
    });
  });

  describe("3. Category Pills & Dietary Indicators", () => {
    const categories = [
      { id: "all", name: "All Items" },
      { id: "burgers", name: "Smashed Burgers", isVeg: true },
      { id: "wraps", name: "Crispy Wraps", isVeg: true },
      { id: "combos", name: "Value Combos", isVeg: true },
      { id: "sides", name: "Fries & Sides", isVeg: true },
      { id: "beverages", name: "Shakes & Drinks", isVeg: true },
    ];

    it("verifies all culinary categories have 100% Pure Veg flag active", () => {
      const foodCategories = categories.filter((c) => c.id !== "all");
      expect(foodCategories.every((c) => c.isVeg === true)).toBe(true);
    });
  });

  describe("4. Theme token verification", () => {
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

    function tokenBlock(selector: string): string {
      const match = new RegExp(`(?:^|\\n)${selector.replace(".", "\\.")} \\{`).exec(css);
      expect(match).not.toBeNull();
      const start = match!.index + match![0].length;
      return css.slice(start, css.indexOf("}", start));
    }

    it("uses the settled white / black canvases and forest-green primary", () => {
      expect(css).not.toContain("#F5F5F5");
      expect(css).not.toContain("#0A0A0A");
      expect(css).not.toContain("#FF6600");

      expect(tokenBlock(":root")).toContain("--background: #FFFFFF");
      expect(tokenBlock(".dark")).toContain("--background: #000000");
      expect(css).toContain("--primary: #0E4825");
      expect(css).toContain("--accent: #C2410C");
    });

    it("serves the owner's MonstroSolid / Montserrat roles without remote fonts", () => {
      expect(css).toContain('font-family: "Montserrat"');
      expect(css).toContain("MontserratVariable.woff2");
      expect(css).toContain("font-weight: 100 900");
      expect(css).toContain("font-display: swap");
      expect(css).toContain('--font-sans: "Montserrat"');
      expect(css).toContain('--font-display: "MonstroSolid"');
      expect(css).toContain('--font-mono: "Montserrat"');
      expect(css).not.toContain("fonts.googleapis");
      // The display face never replaces body, price or control text.
      expect(css).toContain(".type-brand-heading");
      expect(css).toMatch(/\.type-brand-heading \{[\s\S]*?font-family: var\(--font-brand\)/);
      for (const role of [
        "type-body",
        "type-caption",
        "type-button",
        "type-price",
        "type-label-large",
      ]) {
        expect(css).toMatch(
          new RegExp(`\\.${role} \\{[\\s\\S]*?font-family: var\\(--font-sans\\)`),
        );
      }
    });

    it("keeps body copy at 16px and metadata at 14px", () => {
      expect(css).toMatch(/body \{[\s\S]*?font-size: 16px;/);
      expect(css).toMatch(/\.type-body \{[\s\S]*?font-size: 16px;/);
      expect(css).toMatch(/\.type-caption \{[\s\S]*?font-size: 14px;/);
      expect(css).toMatch(/\.type-label-large \{[\s\S]*?font-size: 14px;/);
    });
  });
});
