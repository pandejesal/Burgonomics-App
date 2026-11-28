import { describe, expect, it } from "vitest";
import {
  DEFAULT_CASH_ON_DELIVERY,
  cashOnDeliveryAvailability,
  type CheckoutFeesState,
  type CheckoutOrderType,
} from "@/features/checkout/state/checkoutFeesTypes";
import {
  parseCashOnDelivery,
  parseCheckoutFees,
} from "@/features/checkout/services/deliveryQuoteService";

/**
 * Owner decision 2026-11-26: DELIVERY is paid online only (Razorpay). No cash
 * at the doorstep for either courier, whatever an older quote or a restored
 * selection says. Dine-in and takeaway keep the earlier branch switch/ceiling
 * rules and remain payable at the counter.
 */
const ready = (
  cashOnDelivery?: { enabled: boolean; maxOrderValuePaise: number | null },
  orderType: CheckoutOrderType = "takeaway",
) =>
  ({
    status: "ready",
    orderType,
    packagingFee: 15,
    deliveryFee: orderType === "delivery" ? 40 : 0,
    deliveryQuoteId: orderType === "delivery" ? "dfq_1" : null,
    provider: orderType === "delivery" ? "borzo" : null,
    expiresAt: orderType === "delivery" ? Date.now() + 60_000 : null,
    ...(cashOnDelivery ? { cashOnDelivery } : {}),
  }) as CheckoutFeesState;

describe("cashOnDeliveryAvailability", () => {
  it("refuses delivery cash in every quote state, including the old offline fallback", () => {
    const unsettled: CheckoutFeesState[] = [
      { status: "loading" },
      { status: "idle" },
      { status: "error", code: null },
      {
        status: "unserviceable",
        packagingFee: 0,
        reason: null,
        message: "Delivery isn't available to this address",
      },
    ];
    for (const state of unsettled) {
      const result = cashOnDeliveryAvailability(state, 11500, "delivery");
      expect(result.allowed).toBe(false);
      expect(result.reason ?? "").toContain("paid online only");
    }
  });

  it("refuses delivery cash with a legacy branch flag on and no ceiling", () => {
    const result = cashOnDeliveryAvailability(
      ready({ enabled: true, maxOrderValuePaise: null }, "delivery"),
      11500,
      "delivery",
    );
    expect(result.allowed).toBe(false);
    expect(result.reason ?? "").toContain("paid online only");
  });

  it("refuses delivery cash at any bill size, even above a legacy ceiling", () => {
    const result = cashOnDeliveryAvailability(
      ready({ enabled: true, maxOrderValuePaise: 10000 }, "delivery"),
      11500,
      "delivery",
    );
    expect(result.allowed).toBe(false);
    expect(result.reason ?? "").toContain("paid online only");
    expect(result.reason ?? "").not.toContain("₹100");
  });

  it("keeps counter cash while the quote is unknown (offline fallback unchanged)", () => {
    expect(cashOnDeliveryAvailability({ status: "loading" }, 11500, "takeaway")).toEqual({
      allowed: true,
      reason: null,
    });
    expect(cashOnDeliveryAvailability({ status: "idle" }, null, "dinein").allowed).toBe(true);
  });

  it("allows counter cash when the branch has it on and the bill is under the ceiling", () => {
    expect(
      cashOnDeliveryAvailability(
        ready({ enabled: true, maxOrderValuePaise: 500000 }, "takeaway"),
        11500,
        "takeaway",
      ),
    ).toEqual({ allowed: true, reason: null });
  });

  it("keeps the branch refusal and ceiling for counter cash", () => {
    const off = cashOnDeliveryAvailability(
      ready({ enabled: false, maxOrderValuePaise: null }, "takeaway"),
      11500,
      "takeaway",
    );
    expect(off.allowed).toBe(false);
    expect(off.reason ?? "").toContain("not available at this outlet");

    const capped = cashOnDeliveryAvailability(
      ready({ enabled: true, maxOrderValuePaise: 10000 }, "dinein"),
      11500,
      "dinein",
    );
    expect(capped.allowed).toBe(false);
    expect(capped.reason ?? "").toContain("₹100");
  });

  it("falls back to the documented counter default when the field is absent", () => {
    expect(DEFAULT_CASH_ON_DELIVERY).toEqual({ enabled: true, maxOrderValuePaise: null });
    expect(
      cashOnDeliveryAvailability(ready(undefined, "takeaway"), 11500, "takeaway").allowed,
    ).toBe(true);
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
