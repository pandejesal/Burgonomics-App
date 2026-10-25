import { describe, it, expect } from "vitest";
import { mapProductDoc } from "./menuService";

/**
 * Availability is shared with the server pricing gate: an EXPLICIT false is an
 * 86; a missing field (legacy/manual/combo/import docs) is sellable. Treating
 * unknown as unsellable made every combo unbuyable and contradicted the server,
 * which prices missing flags as available. Non-boolean writer values still fail
 * closed.
 */
describe("mapProductDoc availability mapping (consumer of the Petpooja sync)", () => {
  const base = { name: "Test Item", price: 199 };

  it("presents a doc with no availability signal as sellable (server parity)", () => {
    const product = mapProductDoc({ ...base }, "prod_x");
    expect(product.inStock).toBe(true);
    expect(product.unavailableReason).toBeUndefined();
  });

  it("honours an explicit true", () => {
    const product = mapProductDoc({ ...base, inStock: true }, "prod_x");
    expect(product.inStock).toBe(true);
    expect(product.unavailableReason).toBeUndefined();
  });

  it("honours an explicit false and keeps a supplied reason", () => {
    const product = mapProductDoc(
      { ...base, inStock: false, unavailableReason: "86'd by the kitchen" },
      "prod_x"
    );
    expect(product.inStock).toBe(false);
    expect(product.unavailableReason).toBe("86'd by the kitchen");
  });

  it("does not let a non-boolean truthy value masquerade as available", () => {
    // Boolean("false") === true was the trap; a bad writer must not create
    // sellable stock by writing a string.
    expect(mapProductDoc({ ...base, inStock: "false" }, "prod_x").inStock).toBe(false);
    expect(mapProductDoc({ ...base, inStock: "0" }, "prod_x").inStock).toBe(false);
    expect(mapProductDoc({ ...base, inStock: 1 }, "prod_x").inStock).toBe(false);
  });

  it("falls back to isAvailable when inStock is absent, strictly", () => {
    expect(mapProductDoc({ ...base, isAvailable: true }, "prod_x").inStock).toBe(true);
    expect(mapProductDoc({ ...base, isAvailable: false }, "prod_x").inStock).toBe(false);
    expect(mapProductDoc({ ...base, isAvailable: "true" }, "prod_x").inStock).toBe(false);
  });

  it("prefers inStock over isAvailable when both are present", () => {
    expect(
      mapProductDoc({ ...base, inStock: false, isAvailable: true }, "prod_x").inStock
    ).toBe(false);
    expect(
      mapProductDoc({ ...base, inStock: true, isAvailable: false }, "prod_x").inStock
    ).toBe(true);
  });
});
