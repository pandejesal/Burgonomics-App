import { describe, expect, it } from "vitest";

import type { CartLine } from "@/features/cart/models";
import type { CustomizationGroup, ProductDetails } from "@/features/menu/models";
import { buildReorderPlan, type ReorderPlan } from "./reorderValidation";

function product(overrides: Partial<ProductDetails> = {}): ProductDetails {
  return {
    id: "prod-1",
    categoryId: "cat",
    name: "Big Bang Burger",
    price: 299,
    veg: true,
    inStock: true,
    customizations: [],
    ...overrides,
  } as ProductDetails;
}

function line(overrides: Partial<CartLine> = {}): CartLine {
  return {
    lineId: "line-1",
    productId: "prod-1",
    storeId: "store-A",
    name: "Big Bang Burger",
    unitPrice: 299,
    quantity: 1,
    modifiers: [],
    availability: "available",
    ...overrides,
  };
}

const sizeGroup = (overrides: Partial<CustomizationGroup> = {}): CustomizationGroup =>
  ({
    id: "size",
    name: "Size",
    selection: "single",
    required: true,
    options: [
      { id: "regular", name: "Regular", priceDelta: 0 },
      { id: "large", name: "Large", priceDelta: 40 },
    ],
    ...overrides,
  }) as CustomizationGroup;

const extrasGroup = (overrides: Partial<CustomizationGroup> = {}): CustomizationGroup =>
  ({
    id: "extras",
    name: "Extras",
    selection: "multi",
    options: [
      { id: "cheese", name: "Cheese", priceDelta: 30 },
      { id: "jalapeno", name: "Jalapeño", priceDelta: 20 },
      { id: "sauce", name: "Sauce", priceDelta: 15 },
    ],
    ...overrides,
  }) as CustomizationGroup;

function plan(lines: readonly CartLine[], details: ProductDetails | null): ReorderPlan {
  return buildReorderPlan(lines, new Map([["prod-1", details]]));
}

describe("buildReorderPlan — live option rules", () => {
  it("rejects a NEW required group the snapshot never selected", () => {
    const result = plan([line()], product({ customizations: [sizeGroup()] }));

    expect(result.lines).toHaveLength(0);
    expect(result.rejected[0].code).toBe("selection_invalid");
    expect(result.rejected[0].message).toContain("options changed");
  });

  it("keeps a satisfied required group", () => {
    const result = plan(
      [
        line({
          unitPrice: 339,
          modifiers: [
            { groupId: "size", groupName: "Size", optionId: "large", name: "Large", priceDelta: 40 },
          ],
        }),
      ],
      product({ customizations: [sizeGroup()] }),
    );

    expect(result.rejected).toHaveLength(0);
    expect(result.lines[0].unitPrice).toBe(339);
    expect(result.hasPriceChanges).toBe(false);
  });

  it("rejects duplicate options selected from the same group", () => {
    const duplicate = {
      groupId: "extras",
      groupName: "Extras",
      optionId: "cheese",
      name: "Cheese",
      priceDelta: 30,
    };
    const result = plan(
      [line({ unitPrice: 359, modifiers: [duplicate, { ...duplicate }] })],
      product({ customizations: [extrasGroup()] }),
    );

    expect(result.lines).toHaveLength(0);
    expect(result.rejected[0].code).toBe("selection_invalid");
  });

  it("rejects a multi-select group above the live max", () => {
    const result = plan(
      [
        line({
          unitPrice: 364,
          modifiers: [
            { groupId: "extras", groupName: "Extras", optionId: "cheese", name: "Cheese", priceDelta: 30 },
            { groupId: "extras", groupName: "Extras", optionId: "jalapeno", name: "Jalapeño", priceDelta: 20 },
            { groupId: "extras", groupName: "Extras", optionId: "sauce", name: "Sauce", priceDelta: 15 },
          ],
        }),
      ],
      product({ customizations: [extrasGroup({ maxSelect: 2 })] }),
    );

    expect(result.lines).toHaveLength(0);
    expect(result.rejected[0].code).toBe("selection_invalid");
  });

  it("rejects a single-select group that somehow carries two options", () => {
    const result = plan(
      [
        line({
          unitPrice: 339,
          modifiers: [
            { groupId: "size", groupName: "Size", optionId: "regular", name: "Regular", priceDelta: 0 },
            { groupId: "size", groupName: "Size", optionId: "large", name: "Large", priceDelta: 40 },
          ],
        }),
      ],
      product({ customizations: [sizeGroup({ required: false })] }),
    );

    expect(result.lines).toHaveLength(0);
    expect(result.rejected[0].code).toBe("selection_invalid");
  });

  it("still rejects a retired option instead of substituting a default", () => {
    const result = plan(
      [
        line({
          modifiers: [
            { groupId: "size", groupName: "Size", optionId: "family", name: "Family", priceDelta: 99 },
          ],
        }),
      ],
      product({ customizations: [sizeGroup()] }),
    );

    expect(result.rejected[0].code).toBe("variation_retired");
  });
});

describe("buildReorderPlan — money", () => {
  it("rejects a NaN modifier delta instead of coercing it to zero", () => {
    const result = plan(
      [
        line({
          modifiers: [
            { groupId: "extras", groupName: "Extras", optionId: "cheese", name: "Cheese", priceDelta: 30 },
          ],
        }),
      ],
      product({
        customizations: [
          extrasGroup({
            options: [{ id: "cheese", name: "Cheese", priceDelta: Number.NaN }],
          }),
        ],
      }),
    );

    expect(result.lines).toHaveLength(0);
    expect(result.rejected[0].code).toBe("price_invalid");
  });

  it("rejects an Infinity price and a missing price", () => {
    const infinite = plan([line()], product({ price: Number.POSITIVE_INFINITY }));
    expect(infinite.rejected[0].code).toBe("price_invalid");

    const missing = plan(
      [line()],
      product({ price: undefined as unknown as number }),
    );
    expect(missing.rejected[0].code).toBe("price_invalid");
  });

  it("keeps a legitimate finite NEGATIVE delta when the all-in price stays >= 0", () => {
    const result = plan(
      [
        line({
          unitPrice: 279,
          modifiers: [
            { groupId: "size", groupName: "Size", optionId: "small", name: "Small", priceDelta: -20 },
          ],
        }),
      ],
      product({
        customizations: [
          sizeGroup({
            options: [{ id: "small", name: "Small", priceDelta: -20 }],
          }),
        ],
      }),
    );

    expect(result.rejected).toHaveLength(0);
    expect(result.lines[0].modifiers[0].priceDelta).toBe(-20);
    expect(result.lines[0].unitPrice).toBe(279);
    expect(result.hasPriceChanges).toBe(false);
  });

  it("rejects an all-in price that goes negative", () => {
    const result = plan(
      [
        line({
          unitPrice: -5,
          modifiers: [
            { groupId: "size", groupName: "Size", optionId: "small", name: "Small", priceDelta: -320 },
          ],
        }),
      ],
      product({
        price: 299,
        customizations: [
          sizeGroup({ options: [{ id: "small", name: "Small", priceDelta: -320 }] }),
        ],
      }),
    );

    expect(result.lines).toHaveLength(0);
    expect(result.rejected[0].code).toBe("price_invalid");
  });
});

describe("buildReorderPlan — quantity", () => {
  it.each([
    ["fractional", 1.5],
    ["zero", 0],
    ["over the cart maximum", 100],
    ["non-numeric", "2" as unknown as number],
    ["NaN", Number.NaN],
  ])("rejects a %s quantity instead of flooring/clamping it", (_label, quantity) => {
    const result = plan([line({ quantity })], product());

    expect(result.lines).toHaveLength(0);
    expect(result.rejected[0].code).toBe("quantity_invalid");
  });

  it("keeps the exact integer quantity (no silent re-clamp)", () => {
    const result = plan([line({ quantity: 99 })], product());
    expect(result.lines[0].quantity).toBe(99);
  });
});
