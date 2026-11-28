/**
 * F1 + F2 customer-facing copy and decisions (staging 2026-11-21).
 *
 * F1: the app must never tell a customer "Coupon applied" (or "You saved ₹0")
 * when the server's discount is zero. The server now refuses with
 * `COUPON_NO_DISCOUNT`, and the client must both pass that copy through and
 * refuse to apply a zero-saving quote even if an older server answers one.
 *
 * F2: a closed outlet answers 409 `STORE_CLOSED` on checkout/fees, online
 * payment and cash. The apps must show that sentence clearly, must NOT offer a
 * Retry that can never succeed, and must not keep offering takeaway as an
 * escape from a closed shop.
 */
import { describe, expect, it, vi } from "vitest";
import {
  COUPON_NO_DISCOUNT,
  COURIER_COD_DISABLED,
  describePaymentFailure,
  isNonRetryableOrderFailure,
  isStoreClosedRefusal,
  STORE_CLOSED,
} from "@/features/payments/utils/paymentFailure";
import { userMessageFor } from "@/core/errors/userMessages";
import { deliveryQuoteView, isClosedStoreView } from "@/features/checkout/utils/deliveryQuoteView";
import type { CheckoutFeesState } from "@/features/checkout/state/checkoutFeesTypes";

const CLOSED_MESSAGE =
  "This outlet is closed right now, so online orders can't be placed. Please try again during opening hours.";

describe("F2 — a closed outlet is shown honestly and never offered a Retry", () => {
  it("classifies STORE_CLOSED as a non-retryable order failure", () => {
    expect(STORE_CLOSED).toBe("STORE_CLOSED");
    expect(isNonRetryableOrderFailure(STORE_CLOSED)).toBe(true);
    expect(isStoreClosedRefusal(STORE_CLOSED)).toBe(true);
    // The pre-existing contracts are untouched.
    expect(isNonRetryableOrderFailure("STORE_NOT_LINKED")).toBe(true);
    expect(isNonRetryableOrderFailure("ITEM_UNAVAILABLE")).toBe(false);
    expect(isStoreClosedRefusal("STORE_NOT_LINKED")).toBe(false);
  });

  it("maps STORE_CLOSED to readable copy instead of the generic fallback", () => {
    expect(userMessageFor(STORE_CLOSED)).not.toBe("Something went wrong. Please try again.");
    expect(userMessageFor(STORE_CLOSED)).toMatch(/closed/i);
  });

  it("renders a closed-outlet failure with no Retry button", () => {
    const content = describePaymentFailure({
      status: "failed",
      message: CLOSED_MESSAGE,
      retryable: false,
      code: STORE_CLOSED,
    });
    expect(content.showRetry).toBe(false);
    expect(content.body).toContain(CLOSED_MESSAGE);
    expect(content.title).toMatch(/closed|unavailable/i);
  });

  it("turns a checkout-fees refusal for a closed outlet into a clear, non-retryable state", () => {
    const state: CheckoutFeesState = { status: "error", code: STORE_CLOSED };
    const view = deliveryQuoteView({
      state,
      fulfillment: "takeaway",
      hasAddress: false,
    });
    expect(view.payEnabled).toBe(false);
    expect(view.canRetry).toBe(false);
    expect(isClosedStoreView(view)).toBe(true);
    expect(view.message).toMatch(/closed/i);
    // A closed shop does not let the customer "escape" to takeaway either.
    expect(view.takeawaySelectable).toBe(false);
  });
});

describe("launch policy — a delivery paid in cash is refused, and the customer is told the truth", () => {
  const SERVER_SENTENCE =
    "Delivery orders must be paid online. Courier cash collection is not available at launch. " +
    "Cash is available for takeaway and dine-in only.";

  it("classifies the refusal as non-retryable", () => {
    expect(COURIER_COD_DISABLED).toBe("COURIER_COD_DISABLED");
    expect(isNonRetryableOrderFailure(COURIER_COD_DISABLED)).toBe(true);
    // Neighbouring cash refusals keep their existing behaviour.
    expect(isNonRetryableOrderFailure("COD_LIMIT_EXCEEDED")).toBe(false);
  });

  it("never claims money moved and never says 'do not pay again'", () => {
    // The `!retryable` catch-all in describePaymentFailure assumes money may
    // have moved ("Payment received — order pending / Do not pay again"). This
    // refusal happens BEFORE any write, so that copy would be a lie, and it
    // would tell the customer not to do the one thing that fixes the order:
    // pay online.
    const content = describePaymentFailure({
      status: "failed",
      message: SERVER_SENTENCE,
      retryable: false,
      code: COURIER_COD_DISABLED,
    });
    expect(content.showRetry).toBe(false);
    expect(content.body).toContain(SERVER_SENTENCE);
    expect(content.body).toMatch(/nothing has been charged/i);
    expect(content.body).not.toMatch(/payment received/i);
    expect(content.body).not.toMatch(/do not pay again/i);
    expect(content.title).toMatch(/pay online/i);
  });

  it("maps the code to a customer sentence instead of the generic fallback", () => {
    expect(userMessageFor(COURIER_COD_DISABLED)).toMatch(/paid online/i);
    expect(userMessageFor(COURIER_COD_DISABLED)).not.toBe("Something went wrong. Please try again.");
  });
});

describe("F1 — a coupon that takes nothing off is refused, never celebrated", () => {
  it("exposes the server's own no-discount refusal code", () => {
    expect(COUPON_NO_DISCOUNT).toBe("COUPON_NO_DISCOUNT");
  });

  it("never attaches a valid:true / ₹0 quote as an applied coupon", async () => {
    // An older server (or a stored quote) that still answers valid:true with a
    // zero discount must not reach the cart as "You saved ₹0".
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            valid: true,
            code: "QAFLAT23563",
            title: "Flat 25",
            discount: 0,
            subtotal: 109,
            totalAfterDiscount: 109,
            message: "Coupon applied.",
            reason: "OK",
          }),
      })),
    );
    const { offersService } = await import("@/features/offers/services/offersService");
    const res = await offersService.apply({
      code: "QAFLAT23563",
      storeId: "demo",
      lines: [{ productId: "p1", quantity: 1 }],
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe(COUPON_NO_DISCOUNT);
      expect(res.error.retryable).toBe(false);
    }
  });
});
