/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { paymentsService } from "./paymentsService";

// A08 A2 / P1-14 regression: the create-order transport used to collapse every
// failure into the LOCAL `GATEWAY_ERROR` code, so the server's structured
// money-time refusals (409 ITEM_UNAVAILABLE / ITEM_PRICE_UNVERIFIED) could
// never reach the customer-facing curated lists in checkout/payment. Same
// policy as the verify path: structured codes stay put and are non-retryable;
// only transport/provider failures stay retryable.

const fetchMock = vi.fn();

const makeResponse = (status: number, body: unknown): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    text: async () => JSON.stringify(body),
    // backendPost only reads Retry-After on 202; keep the accessor present.
    headers: { get: () => null },
  }) as unknown as Response;

const VALID_INPUT = {
  amount: 199,
  currency: "INR" as const,
  receipt: "rcpt_trx_1",
  storeId: "store_1",
  fulfillment: "takeaway",
  orderType: "takeaway" as const,
  orderId: "ord_internal_1",
};

describe("paymentsService.createOrder - structured server refusals survive transport", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("surfaces the server's 409 ITEM_UNAVAILABLE verbatim and non-retryable", async () => {
    fetchMock.mockResolvedValueOnce(
      makeResponse(409, { error: "Biryani is no longer available — please review your cart.", code: "ITEM_UNAVAILABLE" })
    );
    const res = await paymentsService.createOrder(VALID_INPUT);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe("ITEM_UNAVAILABLE");
      expect(res.error.message).toContain("no longer available");
      expect(res.error.retryable).toBe(false);
    }
  });

  it("surfaces 409 ITEM_PRICE_UNVERIFIED the same way (fail-closed on unverifiable price)", async () => {
    fetchMock.mockResolvedValueOnce(
      makeResponse(409, {
        error: "An item could not be verified against the menu — please refresh your cart and try again.",
        code: "ITEM_PRICE_UNVERIFIED",
      })
    );
    const res = await paymentsService.createOrder(VALID_INPUT);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe("ITEM_PRICE_UNVERIFIED");
      expect(res.error.retryable).toBe(false);
    }
  });

  it("keeps network failures as retryable GATEWAY_ERROR", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("failed to fetch"));
    const res = await paymentsService.createOrder(VALID_INPUT);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe("GATEWAY_ERROR");
      expect(res.error.retryable).toBe(true);
    }
  });

  it("maps a bare 503 (no code) to retryable GATEWAY_ERROR", async () => {
    fetchMock.mockResolvedValueOnce(makeResponse(503, { error: " momentarily unavailable" }));
    const res = await paymentsService.createOrder(VALID_INPUT);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe("GATEWAY_ERROR");
      expect(res.error.retryable).toBe(true);
    }
  });

  it("surfaces a 409 STORE_NOT_LINKED verbatim, non-retryable, for either envelope shape", async () => {
    // Flat envelope (code beside the message).
    fetchMock.mockResolvedValueOnce(
      makeResponse(409, {
        code: "STORE_NOT_LINKED",
        error: "This outlet isn't taking online orders yet.",
      }),
    );
    const flat = await paymentsService.createOrder(VALID_INPUT);
    expect(flat.success).toBe(false);
    if (!flat.success) {
      expect(flat.error.code).toBe("STORE_NOT_LINKED");
      expect(flat.error.message).toContain("isn't taking online orders");
      expect(flat.error.retryable).toBe(false);
    }

    // Nested envelope (the transport must not lose `error.code` and collapse
    // the refusal into a retryable GATEWAY_ERROR).
    fetchMock.mockResolvedValueOnce(
      makeResponse(409, {
        success: false,
        error: {
          code: "STORE_NOT_LINKED",
          message: "This outlet isn't taking online orders yet.",
        },
      }),
    );
    const nested = await paymentsService.createOrder(VALID_INPUT);
    expect(nested.success).toBe(false);
    if (!nested.success) {
      expect(nested.error.code).toBe("STORE_NOT_LINKED");
      expect(nested.error.message).toContain("isn't taking online orders");
      expect(nested.error.retryable).toBe(false);
    }
  });

  it("still parses a successful gateway order (create contract unchanged)", async () => {
    fetchMock.mockResolvedValueOnce(
      makeResponse(200, { razorpayOrderId: "order_rzp_ok", amountPaise: 19900, keyId: "rzp_test" })
    );
    const res = await paymentsService.createOrder(VALID_INPUT);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.razorpayOrderId).toBe("order_rzp_ok");
      expect(res.data.amountPaise).toBe(19900);
      expect(res.data.amount).toBe(199);
    }
  });
});
