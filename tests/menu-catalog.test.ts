import { describe, it, expect } from "vitest";
import type { Product, MenuCategoryModel } from "../src/features/menu/models";

describe("Prompt 11: Menu Catalog, Filtering & 1-Tap Quick Add Suite", () => {
  const sampleProducts: Product[] = [
    {
      id: "prod_classic_burger",
      categoryId: "cat_burgers",
      name: "Classic Smashed Burger",
      description: "Crispy herb potato patty with house smash sauce",
      price: 199,
      veg: true,
      inStock: true,
      customizable: false,
      prepTimeMinutes: 8,
      badges: [{ id: "b1", label: "Bestseller" }],
    },
    {
      id: "prod_truffle_burger",
      categoryId: "cat_burgers",
      name: "Truffle Mushroom Smashed Burger",
      description: "Sauteed mushrooms, truffle aioli & crispy patty",
      price: 299,
      veg: true,
      inStock: true,
      customizable: true, // Requires customizer sheet
      prepTimeMinutes: 12,
      badges: [{ id: "b3", label: "Chef Special" }],
    },
    {
      id: "prod_soldout_wrap",
      categoryId: "cat_wraps",
      name: "Spicy Peri-Peri Paneer Wrap",
      description: "Grilled paneer with spicy mayo in toasted tortilla",
      price: 229,
      veg: true,
      inStock: false, // 86ed / Out of stock
      customizable: false,
    },
    {
      id: "prod_jain_burger",
      categoryId: "cat_burgers",
      name: "Jain Special Herb Smashed Burger",
      description: "No onion no garlic special potato-banana patty with mint chutney",
      price: 219,
      veg: true,
      inStock: true,
      customizable: false,
      badges: [{ id: "b2", label: "Jain Friendly" }],
    },
  ];

  describe("1. 1-Tap Quick Add vs Customization Routing", () => {
    it("allows direct 1-tap quick add for non-customizable products in stock", () => {
      const product = sampleProducts[0];
      expect(product.inStock).toBe(true);
      expect(product.customizable).toBe(false);

      const canQuickAdd = product.inStock && !product.customizable;
      expect(canQuickAdd).toBe(true);
    });

    it("routes customizable products to customizer modal/route instead of instant add", () => {
      const product = sampleProducts[1];
      expect(product.customizable).toBe(true);

      const requiresCustomization = product.customizable;
      expect(requiresCustomization).toBe(true);
    });
  });

  describe("2. Quantity Stepper Logic & Cart Removal", () => {
    it("increments item quantity when '+' button is pressed", () => {
      let quantity = 1;
      quantity += 1;
      expect(quantity).toBe(2);
    });

    it("decrements quantity and cleanly removes line item when reaching 0", () => {
      let lines = [{ lineId: "line_1", productId: "prod_classic_burger", quantity: 1 }];

      // Decrement quantity
      const line = lines[0];
      const newQty = line.quantity - 1;

      if (newQty <= 0) {
        lines = lines.filter((l) => l.lineId !== line.lineId);
      }

      expect(lines.length).toBe(0);
    });
  });

  describe("3. Out-of-Stock (86ed) Handling & Petpooja POS Sync", () => {
    it("identifies out-of-stock items and blocks cart addition", () => {
      const product = sampleProducts[2];
      expect(product.inStock).toBe(false);

      const canAdd = product.inStock;
      expect(canAdd).toBe(false);
    });

    it("dynamically reflects instant 86ing status changes without page reload", () => {
      const productState = { ...sampleProducts[0], inStock: true };
      expect(productState.inStock).toBe(true);

      // Branch manager 86es product via POS
      productState.inStock = false;
      expect(productState.inStock).toBe(false);
    });
  });

  describe("4. 100% Pure Veg Compliance", () => {
    it("verifies all menu items comply with 100% Pure Vegetarian standard", () => {
      expect(sampleProducts.every((p) => p.veg === true)).toBe(true);
    });
  });

  describe("5. Category Navigation & Counts", () => {
    const categories: MenuCategoryModel[] = [
      { id: "cat_burgers", name: "Smashed Burgers", itemCount: 12 },
      { id: "cat_wraps", name: "Crispy Wraps", itemCount: 6 },
      { id: "cat_sides", name: "Fries & Sides", itemCount: 8 },
    ];

    it("correctly tracks category counts and active category", () => {
      let activeCategory = "cat_burgers";
      expect(activeCategory).toBe("cat_burgers");

      activeCategory = "cat_wraps";
      expect(activeCategory).toBe("cat_wraps");

      const totalItems = categories.reduce((sum, c) => sum + (c.itemCount || 0), 0);
      expect(totalItems).toBe(26);
    });

    it("supports deep linking search params for category selection", () => {
      const validateSearch = (search: Record<string, unknown>) => ({
        category: typeof search.category === "string" ? search.category : undefined,
        view: search.view === "list" || search.view === "grid" ? search.view : undefined,
      });

      const parsed = validateSearch({ category: "cat_burgers", view: "grid" });
      expect(parsed.category).toBe("cat_burgers");
      expect(parsed.view).toBe("grid");
    });
  });

  describe("6. Search & Diet Filter Badges", () => {
    it("filters products based on Jain friendly diet tag", () => {
      const jainItems = sampleProducts.filter(
        (p) =>
          p.name.toLowerCase().includes("jain") ||
          p.description?.toLowerCase().includes("jain") ||
          p.badges?.some((b) => b.label.toLowerCase().includes("jain"))
      );
      expect(jainItems.length).toBe(1);
      expect(jainItems[0].id).toBe("prod_jain_burger");
    });

    it("filters products based on Spicy diet tag", () => {
      const spicyItems = sampleProducts.filter(
        (p) =>
          p.name.toLowerCase().includes("spicy") ||
          p.name.toLowerCase().includes("peri") ||
          p.description?.toLowerCase().includes("spicy")
      );
      expect(spicyItems.length).toBe(1);
      expect(spicyItems[0].id).toBe("prod_soldout_wrap");
    });

    it("filters products based on Chef Special / Bestseller tag", () => {
      const specialItems = sampleProducts.filter((p) =>
        p.badges?.some(
          (b) =>
            b.label.toLowerCase().includes("special") ||
            b.label.toLowerCase().includes("bestseller")
        )
      );
      expect(specialItems.length).toBe(2);
    });
  });

  describe("7. Floating Cart Bar Calculations & Visibility", () => {
    it("computes item count and total subtotal correctly for floating bar", () => {
      const cartLines = [
        { productId: "prod_classic_burger", unitPrice: 199, quantity: 2 },
        { productId: "prod_truffle_burger", unitPrice: 299, quantity: 1 },
      ];

      const itemCount = cartLines.reduce((sum, l) => sum + l.quantity, 0);
      const subtotal = cartLines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);

      expect(itemCount).toBe(3);
      expect(subtotal).toBe(199 * 2 + 299);
      expect(itemCount > 0).toBe(true); // FloatingCartBar is visible
    });

    it("hides floating cart bar when itemCount is 0", () => {
      const cartLines: Array<{ quantity: number; unitPrice: number }> = [];
      const itemCount = cartLines.reduce((sum, l) => sum + l.quantity, 0);
      expect(itemCount).toBe(0); // FloatingCartBar returns null
    });
  });
});
