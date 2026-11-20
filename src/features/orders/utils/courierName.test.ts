import { describe, expect, it } from "vitest";
import type { Order } from "@/features/orders/models";
import { DEFAULT_COURIER_NAME, courierDisplayName, hasNamedCourier } from "./courierName";

/**
 * The dispatch backend writes `delivery.provider` ("borzo"/"shadowfax"/"porter")
 * and NOT `delivery.providerName`, so the tracker showed the generic fallback
 * twice: "Delivery partner" as the label and "Delivery partner" as the value.
 *
 * The order document never carries a brand we may assert beyond the providers
 * our own adapters book: a brand is derived from the recorded provider id,
 * never guessed from an unknown string.
 */

const order = (overrides: Record<string, unknown> = {}) => overrides as unknown as Order;

describe("courierDisplayName derives the real partner from the order", () => {
  it.each([
    ["borzo", "Borzo"],
    ["shadowfax", "Shadowfax"],
    ["porter", "Porter"],
    ["BORZO", "Borzo"],
  ])("maps the recorded provider %s to %s", (provider, expected) => {
    expect(courierDisplayName(order({ delivery: { provider } }))).toBe(expected);
    expect(hasNamedCourier(order({ delivery: { provider } }))).toBe(true);
  });

  it("prefers an explicit partner name over the provider id", () => {
    expect(
      courierDisplayName(order({ delivery: { provider: "borzo", providerName: "Borzo Express" } })),
    ).toBe("Borzo Express");
    expect(courierDisplayName(order({ deliveryPartner: { name: "In-house rider" } }))).toBe(
      "In-house rider",
    );
  });

  it("never echoes an unknown provider id as a brand", () => {
    expect(courierDisplayName(order({ delivery: { provider: "acme-logistics" } }))).toBe(
      DEFAULT_COURIER_NAME,
    );
    expect(courierDisplayName(order({ delivery: { provider: "  " } }))).toBe(DEFAULT_COURIER_NAME);
  });

  it("falls back to the neutral label with no courier facts at all", () => {
    expect(courierDisplayName(order({ delivery: { status: "pending" } }))).toBe(
      DEFAULT_COURIER_NAME,
    );
    expect(courierDisplayName(null)).toBe(DEFAULT_COURIER_NAME);
  });
});
