/**
 * D3 — a ready quote may only unlock PAY for the fulfillment it was quoted for.
 *
 * The fees state is NOT persisted and the coordinator drops stale answers, but
 * two screens (checkout and payment) can hold the store across a mode switch:
 * the takeaway quote that arrived while "delivery" was selected (or the delivery
 * quote that arrived while "takeaway" was) is still `ready`. Reading only
 * `status === "ready"` would then enable PAY on a price the server never quoted
 * for the order about to be placed — and, for takeaway, on a courier fare the
 * customer does not owe.
 *
 * Both directions matter:
 *  - delivery is only payable on a delivery quote with an id + expiry, and the
 *    screen may not pretend an off-mode quote is a courier price;
 *  - takeaway/dine-in are only payable on a quote of that same mode.
 *
 * The existing loading / unserviceable / STORE_NOT_LINKED behaviour and the
 * matching positives are preserved (asserted here so a fix cannot regress them).
 */
import { describe, expect, it } from "vitest";
import { deliveryQuoteView } from "@/features/checkout/utils/deliveryQuoteView";
import type { CheckoutFeesState } from "@/features/checkout/state/checkoutFeesTypes";
import { STORE_NOT_LINKED } from "@/features/payments/utils/paymentFailure";

const NOW = 1_700_000_000_000;

const deliveryReady = (overrides: Record<string, unknown> = {}): CheckoutFeesState =>
  ({
    status: "ready",
    orderType: "delivery",
    packagingFee: 15,
    deliveryFee: 57,
    deliveryQuoteId: "q_del",
    provider: "borzo",
    expiresAt: NOW + 60_000,
    ...overrides,
  }) as CheckoutFeesState;

const takeawayReady = (overrides: Record<string, unknown> = {}): CheckoutFeesState =>
  ({
    status: "ready",
    orderType: "takeaway",
    packagingFee: 10,
    deliveryFee: 0,
    deliveryQuoteId: null,
    provider: null,
    expiresAt: null,
    ...overrides,
  }) as CheckoutFeesState;

describe("D3 — delivery quotes never price a non-delivery order", () => {
  it("does not enable PAY for takeaway on a ready DELIVERY quote", () => {
    const view = deliveryQuoteView({
      state: deliveryReady(),
      fulfillment: "takeaway",
      hasAddress: true,
      now: NOW,
    });

    // The courier fare is meaningless off-delivery: it must not enable payment
    // and must not be presented as the customer's own packaging price.
    expect(view.payEnabled).toBe(false);
    expect(view.deliveryQuoteId).toBeNull();
    expect(view.showDeliveryFee).toBe(false);
    expect(view.packagingFee).toBeNull();
    expect(view.packagingPending).toBe(true);
    expect(view.message).not.toBe("Getting delivery price");
  });

  it("does not enable PAY for dine-in on a ready DELIVERY quote", () => {
    const view = deliveryQuoteView({
      state: deliveryReady(),
      fulfillment: "dinein",
      hasAddress: true,
      now: NOW,
    });

    expect(view.payEnabled).toBe(false);
    expect(view.packagingPending).toBe(true);
    expect(view.packagingFee).toBeNull();
  });

  it("does not enable PAY for dine-in on a ready TAKEAWAY quote", () => {
    // Modes must match exactly; one non-delivery mode is not another.
    const view = deliveryQuoteView({
      state: takeawayReady(),
      fulfillment: "dinein",
      hasAddress: false,
      now: NOW,
    });

    expect(view.payEnabled).toBe(false);
  });
});

describe("D3 — a non-delivery quote never unlocks delivery", () => {
  it("does not enable PAY on delivery from a ready TAKEAWAY quote", () => {
    const view = deliveryQuoteView({
      state: takeawayReady(),
      fulfillment: "delivery",
      hasAddress: true,
      now: NOW,
    });

    expect(view.payEnabled).toBe(false);
    expect(view.showDeliveryFee).toBe(false);
    expect(view.deliveryQuoteId).toBeNull();
    // Still the honest "we are quoting" state, with the takeaway escape.
    expect(view.message).toBe("Getting delivery price");
    expect(view.takeawaySelectable).toBe(true);
  });

  it("does not enable PAY for delivery when the ready quote has no address", () => {
    const view = deliveryQuoteView({
      state: deliveryReady(),
      fulfillment: "delivery",
      hasAddress: false,
      now: NOW,
    });

    expect(view.payEnabled).toBe(false);
    expect(view.status).toBe("idle");
    expect(view.deliveryQuoteId).toBeNull();
  });

  it("does not enable PAY for delivery on an expired delivery quote", () => {
    const view = deliveryQuoteView({
      state: deliveryReady({ expiresAt: NOW - 1 }),
      fulfillment: "delivery",
      hasAddress: true,
      now: NOW,
    });

    expect(view.payEnabled).toBe(false);
    expect(view.status).toBe("loading");
    expect(view.deliveryQuoteId).toBeNull();
  });
});

describe("D3 — matching quotes keep their ready positives", () => {
  it("enables PAY on a matching delivery quote and exposes the courier price", () => {
    const view = deliveryQuoteView({
      state: deliveryReady(),
      fulfillment: "delivery",
      hasAddress: true,
      now: NOW,
    });

    expect(view.status).toBe("ready");
    expect(view.payEnabled).toBe(true);
    expect(view.showDeliveryFee).toBe(true);
    expect(view.deliveryFee).toBe(57);
    expect(view.packagingFee).toBe(15);
    expect(view.deliveryQuoteId).toBe("q_del");
    expect(view.expiresAt).toBe(NOW + 60_000);
    expect(view.message).toBeNull();
    expect(view.packagingPending).toBeFalsy();
  });

  it("enables PAY on a matching takeaway quote", () => {
    const view = deliveryQuoteView({
      state: takeawayReady(),
      fulfillment: "takeaway",
      hasAddress: false,
      now: NOW,
    });

    expect(view.status).toBe("ready");
    expect(view.payEnabled).toBe(true);
    expect(view.packagingFee).toBe(10);
    expect(view.deliveryFee).toBe(0);
    expect(view.deliveryQuoteId).toBeNull();
    expect(view.packagingPending).toBe(false);
  });
});

describe("D3 — terminal quote states are unchanged", () => {
  it("keeps the unserviceable copy and the takeaway escape", () => {
    const view = deliveryQuoteView({
      state: {
        status: "unserviceable",
        packagingFee: 15,
        reason: "OUT_OF_RANGE",
        message: "no courier",
      },
      fulfillment: "delivery",
      hasAddress: true,
      now: NOW,
    });

    expect(view.status).toBe("unserviceable");
    expect(view.payEnabled).toBe(false);
    expect(view.message).toBe("Delivery isn't available to this address");
    expect(view.canRetry).toBe(false);
    expect(view.takeawaySelectable).toBe(true);
  });

  it("keeps STORE_NOT_LINKED non-retryable for every mode", () => {
    const errorState = { status: "error", code: STORE_NOT_LINKED } as CheckoutFeesState;

    const delivery = deliveryQuoteView({
      state: errorState,
      fulfillment: "delivery",
      hasAddress: true,
      now: NOW,
    });
    expect(delivery.payEnabled).toBe(false);
    expect(delivery.storeNotLinked).toBe(true);
    expect(delivery.canRetry).toBe(false);
    expect(delivery.message).toBe("This outlet isn't taking online orders yet.");

    const takeaway = deliveryQuoteView({
      state: errorState,
      fulfillment: "takeaway",
      hasAddress: false,
      now: NOW,
    });
    expect(takeaway.payEnabled).toBe(false);
    expect(takeaway.storeNotLinked).toBe(true);
    expect(takeaway.canRetry).toBe(false);
  });

  it("keeps loading non-payable for delivery without inventing a fee", () => {
    const view = deliveryQuoteView({
      state: { status: "loading" },
      fulfillment: "delivery",
      hasAddress: true,
      now: NOW,
    });

    expect(view.status).toBe("loading");
    expect(view.payEnabled).toBe(false);
    expect(view.deliveryFee).toBeNull();
    expect(view.showTotal).toBe(false);
  });
});
