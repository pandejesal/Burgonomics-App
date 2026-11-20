import { describe, expect, it } from "vitest";
import {
  DEFAULT_CASH_ON_DELIVERY,
  cashOnDeliveryAvailability,
  type CheckoutFeesState,
} from "@/features/checkout/state/checkoutFeesTypes";
import {
  parseCashOnDelivery,
  parseCheckoutFees,
} from "@/features/checkout/services/deliveryQuoteService";

/**
 * CASH-FLOWS (owner decision 2026-11-20): cash on delivery is offered only
 * where the BRANCH allows it, and only under its per-order ceiling. The screen
 * must say why a cash option is gone, and a stale/absent quote must never hide
 * the only offline tender.
 */
const ready = (cashOnDelivery?: { enabled: boolean; maxOrderValuePaise: number | null }) =>
  ({
    status: "ready",
    orderType: "delivery",
    packagingFee: 15,
    deliveryFee: 40,
    deliveryQuoteId: "dfq_1",
    provider: "borzo",
    expiresAt: Date.now() + 60_000,
    ...(cashOnDelivery ? { cashOnDelivery } : {}),
  }) as CheckoutFeesState;

describe("cashOnDeliveryAvailability", () => {
  it("keeps the option while the server has not answered (offline fallback)", () => {
    expect(cashOnDeliveryAvailability({ status: "loading" }, 11500)).toEqual({
      allowed: true,
      reason: null,
    });
    expect(cashOnDeliveryAvailability({ status: "idle" }, null).allowed).toBe(true);
  });

  it("allows cash when the branch has it on and the bill is under the ceiling", () => {
    expect(
      cashOnDeliveryAvailability(ready({ enabled: true, maxOrderValuePaise: 500000 }), 11500),
    ).toEqual({ allowed: true, reason: null });
  });

  it("refuses with the server's sentence when the branch switched it off", () => {
    const result = cashOnDeliveryAvailability(
      ready({ enabled: false, maxOrderValuePaise: null }),
      11500,
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("not available at this outlet");
  });

  it("refuses above the branch ceiling and names the ceiling", () => {
    const result = cashOnDeliveryAvailability(
      ready({ enabled: true, maxOrderValuePaise: 10000 }),
      11500,
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("₹100");
  });

  it("falls back to the documented default when the field is absent", () => {
    expect(DEFAULT_CASH_ON_DELIVERY).toEqual({ enabled: true, maxOrderValuePaise: null });
    expect(cashOnDeliveryAvailability(ready(), 11500).allowed).toBe(true);
  });
});

describe("the quote carries the branch's COD answer", () => {
  it("parses an explicit switch + ceiling", () => {
    expect(parseCashOnDelivery({ enabled: false, maxOrderValuePaise: 25000 })).toEqual({
      enabled: false,
      maxOrderValuePaise: 25000,
    });
  });

  it("defaults a missing/odd block instead of inventing a refusal", () => {
    expect(parseCashOnDelivery(undefined)).toEqual(DEFAULT_CASH_ON_DELIVERY);
    expect(parseCashOnDelivery({ enabled: "yes", maxOrderValuePaise: "lots" })).toEqual(
      DEFAULT_CASH_ON_DELIVERY,
    );
  });

  it("includes the answer on a non-delivery quote", () => {
    const parsed = parseCheckoutFees(
      { packagingFee: 15, cashOnDelivery: { enabled: true, maxOrderValuePaise: 30000 } },
      "takeaway",
    );
    expect(parsed).toMatchObject({
      serviceable: true,
      packagingFee: 15,
      cashOnDelivery: { enabled: true, maxOrderValuePaise: 30000 },
    });
  });

  it("includes the answer on a delivery quote", () => {
    const parsed = parseCheckoutFees(
      {
        serviceable: true,
        packagingFee: 15,
        deliveryFee: 40,
        deliveryQuoteId: "dfq_1",
        provider: "borzo",
        expiresAt: Date.now() + 60_000,
        cashOnDelivery: { enabled: false, maxOrderValuePaise: null },
      },
      "delivery",
    );
    expect(parsed).toMatchObject({
      serviceable: true,
      cashOnDelivery: { enabled: false, maxOrderValuePaise: null },
    });
  });
});
