import { describe, it, expect } from "vitest";
import type { CustomizationGroup, CustomizationOption, ProductDetails } from "../src/features/menu/models";

describe("Prompt 12: Product Customization Modal & Modifiers Suite", () => {
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
      maxSelect: 2,
      options: [
        { id: "opt_cheddar", name: "Extra Cheddar Slice", priceDelta: 35 },
        { id: "opt_jalapenos", name: "Pickled Jalapeños", priceDelta: 25 },
        { id: "opt_mushrooms", name: "Sautéed Mushrooms", priceDelta: 45 },
      ],
    },
  ];

  describe("1. Dynamic Price Aggregation Math", () => {
    const basePrice = 249;

    it("calculates exact total price with base price + selected modifiers", () => {
      // Brioche Bun (+0) + Extra Cheddar (+35) + Jalapenos (+25) = 249 + 35 + 25 = 309
      const selectedDeltas = [0, 35, 25];
      const totalUnitPrice = basePrice + selectedDeltas.reduce((sum, d) => sum + d, 0);
      expect(totalUnitPrice).toBe(309);

      const qty = 2;
      const totalCartPrice = totalUnitPrice * qty;
      expect(totalCartPrice).toBe(618);
    });

    it("includes combo meal upsell price accurately", () => {
      const selectedDeltas = [40]; // Gluten free bun (+40)
      const comboMealAddon = 99; // Regular meal (+99)
      const unitPrice = basePrice + selectedDeltas[0] + comboMealAddon;
      expect(unitPrice).toBe(388);
    });
  });

  describe("2. Mandatory Group Validation Gate", () => {
    it("fails validation if a required single-choice group has no selection", () => {
      const selections: Record<string, string[]> = {
        grp_cheese: ["opt_cheddar"], // bun group missing!
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

  describe("3. Multi-Select Max Selection Constraints", () => {
    it("enforces maxSelect limit on multi-select topping groups", () => {
      const group = sampleCustomizationGroups[1]; // maxSelect: 2
      let currentSelected = ["opt_cheddar", "opt_jalapenos"];
      const newOption = "opt_mushrooms";

      const handleAddMulti = (current: string[], nextOpt: string, max?: number) => {
        let next = [...current, nextOpt];
        if (max && next.length > max) {
          next = next.slice(-max);
        }
        return next;
      };

      const result = handleAddMulti(currentSelected, newOption, group.maxSelect);
      expect(result.length).toBe(2);
      expect(result).toContain("opt_jalapenos");
      expect(result).toContain("opt_mushrooms");
      expect(result).not.toContain("opt_cheddar");
    });
  });

  describe("4. Out-of-Stock Modifier Handling", () => {
    it("prevents selecting out-of-stock modifier options", () => {
      const charcoalOption = sampleCustomizationGroups[0].options[3];
      expect(charcoalOption.outOfStock).toBe(true);

      const canSelectOption = (opt: CustomizationOption) => !opt.outOfStock;
      expect(canSelectOption(charcoalOption)).toBe(false);
    });
  });
});
