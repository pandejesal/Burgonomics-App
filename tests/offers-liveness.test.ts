import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Liveness: the client must never promise savings the server refuses at charge.
 *
 * Originally (Loop 14/120) this suite proved that by checking
 * `petpooja_offers` locally. That check is gone with the collection: the server
 * coupon authority now owns every rule (active, expiry, minimum, branch,
 * per-customer limit, cap). What still needs proving on the client is that the
 * verdict it shows IS the server's — no local fallback, no optimistic discount.
 */

const fetchMock = vi.fn();

vi.mock("../src/core/config/env", () => ({
  appConfig: { integrations: { paymentsApiBaseUrl: "https://api.test/api" } },
}));
vi.mock("../src/core/storage/secureStorage", () => ({
  secureStorage: { get: async () => null },
  SECURE_KEYS: { ACCESS_TOKEN: "access_token" },
}));
vi.mock("../src/core/config/firebase", () => ({
  db: {},
  getAppCheckToken: async () => null,
}));

import { offersService } from "../src/features/offers/services/offersService";

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const LINES = [{ productId: "p1", quantity: 1 }];

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("offersService liveness", () => {
  it("applies a live coupon at the server's value", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        valid: true,
        code: "LIVE10",
        title: "Live offer",
        discount: 50,
        subtotal: 500,
        totalAfterDiscount: 450,
        message: "Coupon applied.",
        reason: "OK",
      }),
    );
    const res = await offersService.apply({ code: "LIVE10", lines: LINES });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.discount).toBe(50);
  });

  it("refuses an inactive coupon at apply time, with the server's code", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, {
        valid: false,
        code: "COUPON_INACTIVE",
        error: "This coupon is no longer active.",
        reason: "COUPON_INACTIVE",
      }),
    );
    const res = await offersService.apply({ code: "DEAD10", lines: LINES });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe("COUPON_INACTIVE");
  });

  it("refuses an expired coupon at validate and apply time", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, {
        valid: false,
        code: "COUPON_EXPIRED",
        error: "This coupon has expired.",
        reason: "COUPON_EXPIRED",
      }),
    );
    const v = await offersService.validateCoupon("OLD10", { lines: LINES });
    expect(v.success).toBe(false);
    const a = await offersService.apply({ code: "OLD10", lines: LINES });
    expect(a.success).toBe(false);
    if (!a.success) expect(a.error.code).toBe("COUPON_EXPIRED");
  });

  it("never reports a discount the server did not send", async () => {
    // A 200 that claims validity but carries no discount used to be attached
    // with `discount: 0`, which the cart then showed as "You saved ₹0" while
    // the customer paid full price (staging 2026-11-21, F1). The client still
    // never computes a discount of its own; it now refuses the ₹0 quote
    // outright instead of celebrating it.
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        valid: true,
        code: "ODD",
        title: "Odd",
        subtotal: 500,
        totalAfterDiscount: 500,
        message: "Coupon applied.",
        reason: "OK",
      }),
    );
    const res = await offersService.apply({ code: "ODD", lines: LINES });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe("COUPON_NO_DISCOUNT");
      expect(res.error.retryable).toBe(false);
    }
  });
});
