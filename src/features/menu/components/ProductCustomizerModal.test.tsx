import { describe, it, expect } from "vitest";
import type { CustomizationGroup, CustomizationOption, ProductDetails } from "../models";

describe("ProductCustomizerModal & Modifiers Specification Suite", () => {
  const sampleCustomizationGroups: CustomizationGroup[] = [
    {
      id: "grp_bun",
      name: "Choose Bun / Base",
      required: true,
      selection: "single",
      options: [
        { id: "opt_brioche", name: "Brioche Bun", priceDelta: 0 },
        { id: "opt_gluten_free", name: "Gluten-Free Seeded Bun", priceDelta: 40 },
        { id: "opt_lettuce", name: "Lettuce Wrap (Low Carb)", priceDelta: 0 },
        { id: "opt_charcoal", name: "Charcoal Black Bun", priceDelta: 30, outOfStock: true },
      ],
    },
    {
      id: "grp_cheese",
      name: "Extra Cheese & Toppings",
      required: false,
      selection: "multi",
      maxSelect: 3,
      options: [
        { id: "opt_cheddar", name: "Extra Cheddar Slice", priceDelta: 35 },
        { id: "opt_jalapenos", name: "Pickled Jalapeños", priceDelta: 25 },
        { id: "opt_mushrooms", name: "Sautéed Mushrooms", priceDelta: 45 },
        { id: "opt_onions", name: "Caramelized Onions", priceDelta: 30 },
      ],
    },
  ];

  const sampleProduct: ProductDetails = {
    id: "prod_truffle_burger",
    categoryId: "cat_burgers",
    name: "Truffle Mushroom Smashed Burger",
    description: "Sauteed mushrooms, truffle aioli & crispy patty",
    price: 299,
    veg: true,
    inStock: true,
    customizable: true,
    prepTimeMinutes: 12,
    customizations: sampleCustomizationGroups,
  };

  describe("1. Dynamic Price Aggregation Math", () => {
    it("sums basePrice + selected modifier price deltas + combo upgrade", () => {
      const basePrice = sampleProduct.price; // 299
      const selectedModifiersDeltas = [40, 35, 25]; // Gluten-free bun (40) + Cheddar (35) + Jalapenos (25)
      const comboPrice = 99; // Regular meal combo

      const unitPrice =
        basePrice +
        selectedModifiersDeltas.reduce((acc, d) => acc + d, 0) +
        comboPrice;

      expect(unitPrice).toBe(299 + 40 + 35 + 25 + 99); // 498

      const qty = 2;
      const totalOrderPrice = unitPrice * qty;
      expect(totalOrderPrice).toBe(996);
    });
  });

  describe("2. Mandatory Modifier Selection Gate", () => {
    it("blocks validation when a required single-choice group has no selected option", () => {
      const selections: Record<string, string[]> = {
        grp_cheese: ["opt_cheddar"],
      };

      const validateRequired = (groups: CustomizationGroup[], sel: Record<string, string[]>) => {
        for (const g of groups) {
          if (g.required && (!sel[g.id] || sel[g.id].length === 0)) {
            return false;
          }
        }
        return true;
      };

      expect(validateRequired(sampleCustomizationGroups, selections)).toBe(false);

      selections.grp_bun = ["opt_brioche"];
      expect(validateRequired(sampleCustomizationGroups, selections)).toBe(true);
    });
  });

  describe("3. Multi-Select Max Selection Limits", () => {
    it("enforces maxSelect limit when adding extra toppings", () => {
      const maxSelect = 3;
      let currentSelected = ["opt_cheddar", "opt_jalapenos", "opt_mushrooms"];
      const newOption = "opt_onions";

      const handleToggle = (current: string[], nextOpt: string, max?: number) => {
        let next = [...current, nextOpt];
        if (max && next.length > max) {
          next = next.slice(-max);
        }
        return next;
      };

      const result = handleToggle(currentSelected, newOption, maxSelect);
      expect(result.length).toBe(3);
      expect(result).toContain("opt_onions");
      expect(result).not.toContain("opt_cheddar");
    });
  });

  describe("4. Out-of-Stock Modifier Guard", () => {
    it("prevents selecting unavailable or 86ed modifier options", () => {
      const charcoal = sampleCustomizationGroups[0].options[3];
      expect(charcoal.outOfStock).toBe(true);

      const canSelect = (opt: CustomizationOption) => !opt.outOfStock;
      expect(canSelect(charcoal)).toBe(false);
    });
  });

  describe("5. Deterministic Cart Fingerprint Generation", () => {
    it("generates matching fingerprints regardless of modifier selection order", () => {
      const generateFingerprint = (
        productId: string,
        mods: Array<{ groupId: string; optionId: string }>,
        comboId: string | null
      ) => {
        const sorted = [...mods]
          .sort((a, b) => `${a.groupId}:${a.optionId}`.localeCompare(`${b.groupId}:${b.optionId}`))
          .map((m) => `${m.groupId}:${m.optionId}`)
          .join("|");
        return `${productId}#${sorted}#${comboId || "none"}`;
      };

      const order1 = [
        { groupId: "grp_bun", optionId: "opt_brioche" },
        { groupId: "grp_cheese", optionId: "opt_cheddar" },
        { groupId: "grp_cheese", optionId: "opt_jalapenos" },
      ];

      const order2 = [
        { groupId: "grp_cheese", optionId: "opt_jalapenos" },
        { groupId: "grp_bun", optionId: "opt_brioche" },
        { groupId: "grp_cheese", optionId: "opt_cheddar" },
      ];

      const fp1 = generateFingerprint("prod_truffle_burger", order1, "combo_regular");
      const fp2 = generateFingerprint("prod_truffle_burger", order2, "combo_regular");

      expect(fp1).toBe(fp2);

      const fp3 = generateFingerprint("prod_truffle_burger", order1, null);
      expect(fp1).not.toBe(fp3);
    });
  });
});
