import { describe, expect, it, vi } from "vitest";
import { toUserMessage } from "@/core/errors/userMessages";
import {
  CREATE_CASH_ORDER_PATH,
  createCashOrderOnServer,
  createCashOrderUrl,
  type CashOrderRequest,
} from "@/features/payments/services/cashOrderService";

/**
 * CASH-FLOWS: the app never writes a cash order. It POSTs the cart and the
 * branch/store identity, and the SERVER prices it. A typed refusal keeps the
 * server's own sentence; an unreadable success is a retryable failure, never a
 * "placed" order.
 */
const request: CashOrderRequest = {
  orderId: "ord_cash_1",
  storeId: "store_1",
  branchId: "branch_a",
  orderType: "takeaway",
  items: [{ productId: "p1", quantity: 1 }],
  expectedTotalPaise: 11500,
};

const transport = (impl: (url: string, body: unknown) => Promise<{ data: unknown }>) => {
  const post = vi.fn(impl);
  return { post };
};

describe("createCashOrderOnServer", () => {
  it("posts to the create-cash route on the Functions base", async () => {
    const t = transport(async () => ({
      data: {
        orderId: "ord_cash_1",
        replayed: false,
        cashDuePaise: 11500,
        totals: { grandTotal: 115 },
        status: { code: "PLACED", label: "Order placed", kind: "upcoming", terminal: false },
      },
    }));
    const res = await createCashOrderOnServer(request, { transport: t as never });
    expect(t.post).toHaveBeenCalledTimes(1);
    expect(t.post.mock.calls[0][0]).toBe(createCashOrderUrl());
    expect(createCashOrderUrl().endsWith(CREATE_CASH_ORDER_PATH)).toBe(true);
    expect(t.post.mock.calls[0][1]).toMatchObject({
      orderId: "ord_cash_1",
      expectedTotalPaise: 11500,
    });
    expect(res).toMatchObject({
      success: true,
      data: {
        orderId: "ord_cash_1",
        paymentMethod: "cod",
        paymentChannel: "cash",
        cashDuePaise: 11500,
      },
    });
  });

  it("reports a replay honestly", async () => {
    const t = transport(async () => ({
      data: { orderId: "ord_cash_1", replayed: true, cashDuePaise: 11500 },
    }));
    const res = await createCashOrderOnServer(request, { transport: t as never });
    expect(res.success && res.data.replayed).toBe(true);
  });

  it("keeps a typed branch refusal and does not offer a retry", async () => {
    const t = transport(async () => {
      throw {
        status: 409,
        response: {
          status: 409,
          data: {
            code: "COD_LIMIT_EXCEEDED",
            error: "Cash on delivery is available up to ₹100 for one order.",
          },
        },
      };
    });
    const res = await createCashOrderOnServer(request, { transport: t as never });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe("COD_LIMIT_EXCEEDED");
      expect(res.error.message).toContain("₹100");
      expect(res.error.retryable).toBe(false);
    }
  });

  it("treats the launch no-cash-delivery refusal as final and shows its sentence", async () => {
    // Owner policy, 26 Nov 2026: a payable delivery is online-only. The server
    // refuses delivery cash before any write, so this must never read as
    // "outcome unknown, please retry".
    const t = transport(async () => {
      throw {
        status: 409,
        response: {
          status: 409,
          data: {
            code: "COURIER_COD_DISABLED",
            error:
              "Delivery orders must be paid online. Courier cash collection is not available at launch. " +
              "Cash is available for takeaway and dine-in only.",
          },
        },
      };
    });
    const res = await createCashOrderOnServer(
      { ...request, orderType: "delivery" },
      { transport: t as never },
    );
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe("COURIER_COD_DISABLED");
      expect(res.error.retryable).toBe(false);
      expect(res.error.message).toContain("paid online");
    }
    // The payment screen maps uncurated codes through toUserMessage; before
    // this entry existed the customer read a generic "Something went wrong".
    expect(toUserMessage({ code: "COURIER_COD_DISABLED" })).toContain("paid online");
  });

  it("treats an unknown transport failure as a safe retry (server is idempotent)", async () => {
    const t = transport(async () => {
      throw new TypeError("Failed to fetch");
    });
    const res = await createCashOrderOnServer(request, { transport: t as never });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.retryable).toBe(true);
  });

  it("never reports success without a server order id and collectible amount", async () => {
    const t = transport(async () => ({ data: { orderId: "ord_cash_1" } }));
    const res = await createCashOrderOnServer(request, { transport: t as never });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe("CASH_ORDER_INVALID");
      expect(res.error.retryable).toBe(true);
    }
  });
});
