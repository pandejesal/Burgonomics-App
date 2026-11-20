import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The offers client's OUTCOME contract (rewritten 2026-11-20).
 *
 * The service used to read the `petpooja_offers` collection directly, so these
 * tests mocked `getDocs`. The single coupon authority moved the decision to the
 * server, so what matters now is that the CLIENT reports each outcome honestly:
 *
 *   - a transport failure is an outage (`retryable`), never "no offers";
 *   - a genuine empty answer is a success with an empty list;
 *   - a server refusal carries the SERVER's code and wording (the customer must
 *     see "expired", "minimum order", "already used"), never a generic error;
 *   - nothing here computes a discount.
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

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("offers read outcomes", () => {
  it("returns a retryable failure rather than a successful empty bundle on outage", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    const result = await offersService.list();
    expect(result).toEqual({
      success: false,
      error: {
        code: "OFFERS_UNAVAILABLE",
        message: "Could not load offers. Please try again.",
        retryable: true,
      },
    });
  });

  it("keeps a genuine empty answer successful", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { coupons: [] }));
    const result = await offersService.list();
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error.code);
    expect(result.data.offers).toEqual([]);
  });

  it("maps a server coupon into the offer shape without inventing a discount", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        coupons: [
          {
            code: "SAVE10",
            title: "Save 10%",
            discountType: "percent",
            value: 10,
            maxDiscount: 80,
            minOrder: 199,
            validToMs: null,
          },
        ],
      }),
    );
    const result = await offersService.list();
    if (!result.success) throw new Error(result.error.code);
    expect(result.data.offers).toHaveLength(1);
    expect(result.data.offers[0].code).toBe("SAVE10");
    expect(result.data.offers[0].discount.value).toBe(10);
    expect(result.data.offers[0].eligibility.minOrderValue).toBe(199);
  });

  it("does not misreport a coupon-check outage as an invalid coupon", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    const lines = [{ productId: "p1", quantity: 1 }];
    const quoted = await offersService.quote({ code: "SAVE", lines });
    expect(quoted.success).toBe(false);
    if (!quoted.success) {
      expect(quoted.error.code).toBe("COUPON_CHECK_UNAVAILABLE");
      expect(quoted.error.retryable).toBe(true);
    }
    const applied = await offersService.apply({ code: "SAVE", lines });
    expect(applied.success).toBe(false);
    if (!applied.success) expect(applied.error.code).toBe("COUPON_CHECK_UNAVAILABLE");
  });
});

describe("the server decides, the client reports", () => {
  it("shows the server's discount and items total", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        valid: true,
        code: "SAVE10",
        title: "Save 10%",
        discount: 40,
        subtotal: 400,
        totalAfterDiscount: 360,
        message: "Coupon applied.",
        reason: "OK",
      }),
    );
    const result = await offersService.apply({
      code: "SAVE10",
      lines: [{ productId: "p1", quantity: 2 }],
    });
    if (!result.success) throw new Error(result.error.code);
    expect(result.data.discount).toBe(40);
    expect(result.data.savingsLabel).toBe("You saved ₹40");
  });

  it("passes a refused code's own REASON through to the customer", async () => {
    // The quote route answers HTTP 200 with `code` = the COUPON code the
    // customer typed and `reason` = why it was refused. Reading `code` first
    // (as the client used to) made every refusal look like an unknown error, so
    // PromoInput discarded the server's wording for a generic message.
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        valid: false,
        code: "BIG",
        reason: "MIN_ORDER_NOT_MET",
        error: "Add items worth ₹99 more to use this coupon.",
      }),
    );
    const result = await offersService.quote({
      code: "BIG",
      lines: [{ productId: "p1", quantity: 1 }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("MIN_ORDER_NOT_MET");
      expect(result.error.message).toContain("₹99");
    }
  });

  it("refuses to quote an empty cart before calling the server", async () => {
    const result = await offersService.quote({ code: "SAVE", lines: [] });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("CART_EMPTY");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
