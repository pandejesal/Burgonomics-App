import { describe, it, expect } from "vitest";
import { mapProductDoc } from "./menuService";

/**
 * Availability is the CONSUMER's last line of truth.
 *
 * The Petpooja ingest writes a boolean `inStock`, but a products doc can reach
 * the customer app without one (legacy/manual/seed docs). Until now the mapper
 * defaulted that to `true`, and nothing downstream re-checks: the cart only
 * blocks `availability === "unavailable"` (cartStore.ts:174,
 * CartRepository.ts:261-265) and the payments pricing engine never reads
 * inStock at all. "We do not know" therefore became "order it".
 *
 * The scope correction for this round is explicit - no permissive
 * unknown-stock=>available mapping, preserve truthful unknown/unavailable
 * states - so these tests pin the fail-closed mapping, not the old default.
 */
describe("mapProductDoc availability mapping (consumer of the Petpooja sync)", () => {
  const base = { name: "Test Item", price: 199 };

  it("does NOT present a doc with no availability signal as sellable", () => {
    const product = mapProductDoc({ ...base }, "prod_x");
    expect(product.inStock).toBe(false);
    // Truthful state, not a silent "sold out": the reason says why.
    expect(product.unavailableReason).toBe("Availability unknown");
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
