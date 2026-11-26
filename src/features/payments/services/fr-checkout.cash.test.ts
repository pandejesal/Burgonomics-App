/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CREATE_CASH_ORDER_PATH,
  createCashOrderOnServer,
  type CashOrderRequest,
} from "@/features/payments/services/cashOrderService";
import {
  PENDING_CASH_ORDER_TTL_MS,
  clearPendingCashOrder,
  markPendingCashOrderConfirmed,
  readPendingCashOrder,
  savePendingCashOrder,
} from "@/features/payments/services/pendingCashOrder";

/**
 * fr-checkout M4/M5: the exact cash request is persisted before the send and a
 * zero-due / re-priced response is handled honestly.
 */
const request: CashOrderRequest = {
  orderId: "ord_fr_cash",
  storeId: "store_1",
  branchId: "branch_a",
  orderType: "takeaway",
  items: [{ productId: "p1", quantity: 1 }],
  expectedTotalPaise: 5000,
};

const transport = (impl: (url: string, body: unknown) => Promise<{ data: unknown }>) => ({
  post: vi.fn(impl),
});

beforeEach(() => {
  // The customer suite runs in the node environment; pendingCashOrder uses its
  // in-memory Storage fallback there.
  clearPendingCashOrder();
});

describe("M5 cash response handling", () => {
  it("accepts a fully-discounted zero-due order", async () => {
    const t = transport(async () => ({
      data: {
        orderId: "ord_fr_cash",
        replayed: false,
        cashDuePaise: 0,
        totals: { split: { totalAmountPaise: 0 } },
        status: { code: "PLACED", label: "Order placed", kind: "upcoming", terminal: false },
      },
    }));
    const res = await createCashOrderOnServer(request, { transport: t as never });
    expect(res.success).toBe(true);
    expect(res.success && res.data.cashDuePaise).toBe(0);
  });

  it("carries the server's totals on PRICE_CHANGED for reconfirmation", async () => {
    const totals = { split: { totalAmountPaise: 6200 } };
    const t = transport(async () => {
      throw {
        status: 409,
        response: {
          status: 409,
          data: { code: "PRICE_CHANGED", error: "Please reconfirm.", totals },
        },
      };
    });
    const res = await createCashOrderOnServer(request, { transport: t as never });
    expect(res.success).toBe(false);
    expect(!res.success && res.error.code).toBe("PRICE_CHANGED");
    expect(!res.success && res.error.details?.totals).toEqual(totals);
  });
});

describe("M4 pending cash request", () => {
  it("persists the exact request and marks it confirmed", () => {
    expect(readPendingCashOrder()).toBeNull();
    savePendingCashOrder("attempt_r2", request.orderId, request);
    const pending = readPendingCashOrder();
    expect(pending?.orderId).toBe(request.orderId);
    expect(pending?.request).toEqual(request);
    expect(pending?.confirmed).toBe(false);

    markPendingCashOrderConfirmed(request.orderId);
    expect(readPendingCashOrder()?.confirmed).toBe(true);
  });

  it("retires an UNCONFIRMED attempt past the TTL, and clears after resolution", () => {
    savePendingCashOrder("attempt_r2", request.orderId, request);
    // A6-c11 item 1: an abandoned (unconfirmed) attempt must NOT be replayed for
    // ever — an expired record is gone, not merely ignored.
    expect(readPendingCashOrder(Date.now() + PENDING_CASH_ORDER_TTL_MS + 1)).toBeNull();
    expect(readPendingCashOrder()).toBeNull();

    // A CONFIRMED id still survives any TTL: it is the only proof of the write.
    savePendingCashOrder("attempt_r2", request.orderId, request);
    markPendingCashOrderConfirmed(request.orderId);
    expect(readPendingCashOrder(Date.now() + PENDING_CASH_ORDER_TTL_MS * 10)?.confirmed).toBe(true);

    clearPendingCashOrder();
    expect(readPendingCashOrder()).toBeNull();
  });
});
