/** @vitest-environment jsdom */
/**
 * A6-c11 finding 1 (Critical): an abandoned cash attempt must expire, must be
 * bound to the basket it was created for, and must never be replayed onto a
 * later checkout.
 *
 * `readPendingCashOrder(nowMs)` ignored `nowMs` and returned the record for
 * ever, so the next "Place COD Order" re-sent the OLD basket, reported success
 * and `payment.tsx` cleared the NEW cart.
 *
 * The TTL and basket halves are asserted through the real storage module, and
 * the last two cases drive the REAL OrderRepository so the assertion is on the
 * POST body the kitchen would receive.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ok } from "@/core/network/http";

const cash = vi.hoisted(() => ({ createCashOrderOnServer: vi.fn() }));
const service = vi.hoisted(() => ({ getOrder: vi.fn() }));
const cartRepo = vi.hoisted(() => ({ calculateTotals: vi.fn() }));

vi.mock("@/features/payments/services/cashOrderService", () => ({
  ...cash,
  CREATE_CASH_ORDER_PATH: "/orders/createCashOrder",
  createCashOrderUrl: () => "http://x/orders/createCashOrder",
}));
vi.mock("@/features/orders/services/ordersService", () => ({ ordersService: service }));
vi.mock("@/features/cart/repositories/CartRepository", () => ({
  cartRepository: cartRepo,
  CartRepository: class {},
}));

import {
  PENDING_CASH_ORDER_TTL_MS,
  clearPendingCashOrder,
  markPendingCashOrderConfirmed,
  readPendingCashOrder,
  savePendingCashOrder,
} from "@/features/payments/services/pendingCashOrder";
import { OrderRepository } from "@/features/orders/repositories/OrderRepository";
import { useCartStore } from "@/features/cart/state/cartStore";
import { useStoreSelection } from "@/features/stores/state/storeStore";
import { useCheckoutStore } from "@/features/checkout/state/checkoutStore";
import { configureAuthUidSource } from "@/features/auth/utils/scopedPersistence";
import type { CartTotals } from "@/features/cart/models";

const totals: CartTotals = {
  subtotal: 100,
  itemDiscount: 0,
  promoDiscount: 0,
  taxes: 4.76,
  cgst: 2.38,
  sgst: 2.38,
  gstRate: 0.05,
  deliveryFee: 0,
  packingFee: 15,
  grandTotal: 119,
  currency: "INR",
};

const OLD_BASKET = {
  orderId: "ord_abandoned",
  storeId: "s1",
  orderType: "takeaway" as const,
  items: [{ productId: "p1", quantity: 1 }],
  expectedTotalPaise: 5000,
};

function liveCart(productId: string, quantity = 1) {
  useCartStore.setState({
    lines: [
      {
        lineId: "l1",
        productId,
        storeId: "s1",
        name: "Burger",
        unitPrice: 100,
        quantity,
        modifiers: [],
        availability: "available",
      },
    ],
    storeId: "s1",
    status: "ready",
  });
}

beforeEach(() => {
  localStorage.clear();
  clearPendingCashOrder();
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: { request: async (_key: string, claim: () => unknown) => claim() },
  });
  cash.createCashOrderOnServer.mockReset();
  service.getOrder.mockReset();
  cartRepo.calculateTotals.mockReset();
  cartRepo.calculateTotals.mockResolvedValue(ok(totals));
  cash.createCashOrderOnServer.mockImplementation(async (request: { orderId: string }) =>
    ok({
      orderId: request.orderId,
      replayed: false,
      paymentMethod: "cod",
      paymentChannel: "cash",
      cashDuePaise: 11900,
      totals: {},
      status: { code: "PLACED", label: "Order placed", kind: "upcoming", terminal: false },
    }),
  );
  service.getOrder.mockResolvedValue(ok({ id: "ord_any" }));
  useStoreSelection.setState({
    activeStore: { id: "s1", name: "S" } as never,
    fulfillment: "takeaway",
  });
  useCheckoutStore.getState().reset();
  configureAuthUidSource({ getUid: () => "cust_ttl", subscribe: () => () => {} });
});

describe("pending cash attempt TTL (A6-c11 item 1)", () => {
  it("still replays an ambiguous attempt inside the TTL", () => {
    savePendingCashOrder("attempt_1", "ord_abandoned", OLD_BASKET);
    const inside = Date.now() + PENDING_CASH_ORDER_TTL_MS - 1_000;
    expect(readPendingCashOrder(inside)?.orderId).toBe("ord_abandoned");
  });

  it("retires an UNCONFIRMED attempt once the TTL has passed", () => {
    savePendingCashOrder("attempt_1", "ord_abandoned", OLD_BASKET);
    const expired = Date.now() + PENDING_CASH_ORDER_TTL_MS + 1;
    expect(readPendingCashOrder(expired)).toBeNull();
    // Gone, not merely ignored: the next checkout must not inherit its id.
    expect(readPendingCashOrder()).toBeNull();
  });

  it("keeps a CONFIRMED id past the TTL — it is the only proof of the write", () => {
    savePendingCashOrder("attempt_1", "ord_abandoned", OLD_BASKET);
    markPendingCashOrderConfirmed("ord_abandoned");
    const longAfter = Date.now() + PENDING_CASH_ORDER_TTL_MS * 1_000;
    expect(readPendingCashOrder(longAfter)?.orderId).toBe("ord_abandoned");
  });
});

describe("pending cash attempt basket binding (A6-c11 item 1)", () => {
  /** The stored basket identity of a saved attempt (undefined pre-fix). */
  function storedBasketHash(): string | undefined {
    return readPendingCashOrder()?.basketHash;
  }

  it("discards an attempt whose basket no longer matches the live one", () => {
    // What the OTHER basket hashes to, measured on the fixed build.
    savePendingCashOrder("attempt_other", "ord_other", {
      ...OLD_BASKET,
      items: [{ productId: "p9", quantity: 2 }],
    });
    const otherHash = storedBasketHash();
    // Now the customer's live checkout is the OLD basket again.
    savePendingCashOrder("attempt_1", "ord_abandoned", OLD_BASKET);

    expect(readPendingCashOrder(Date.now(), otherHash)).toBeNull();
    // A mismatched attempt is abandoned, not kept around to poison the retry.
    expect(readPendingCashOrder()).toBeNull();
  });

  it("keeps an attempt whose basket still matches", () => {
    savePendingCashOrder("attempt_1", "ord_abandoned", OLD_BASKET);
    const live = storedBasketHash();
    expect(live).toBeTruthy();
    expect(readPendingCashOrder(Date.now(), live)?.orderId).toBe("ord_abandoned");
  });

  it("ignores the accepted money when identifying the basket", () => {
    savePendingCashOrder("attempt_1", "ord_abandoned", OLD_BASKET);
    const live = storedBasketHash();
    expect(live).toBeTruthy();
    // Same items/outlet/mode, only the reconfirmed total changed.
    savePendingCashOrder("attempt_1", "ord_abandoned", {
      ...OLD_BASKET,
      expectedTotalPaise: 6200,
    });
    expect(storedBasketHash()).toBe(live);
  });
});

describe("abandoned attempt never orders the old basket (A6-c11 item 1)", () => {
  it("does not replay an EXPIRED attempt; it orders the LIVE basket", async () => {
    savePendingCashOrder("attempt_1", "ord_abandoned", OLD_BASKET);
    const key = Object.keys(localStorage).find((k) => k.includes("pendingCashOrder"));
    expect(key).toBeTruthy();
    const aged = JSON.parse(localStorage.getItem(key!)!);
    aged.createdAtMs = Date.now() - PENDING_CASH_ORDER_TTL_MS - 60_000;
    localStorage.setItem(key!, JSON.stringify(aged));

    liveCart("p9", 2);
    await new OrderRepository(service as never).createCashOrder();

    expect(cash.createCashOrderOnServer).toHaveBeenCalledTimes(1);
    const posted = cash.createCashOrderOnServer.mock.calls[0][0] as {
      orderId: string;
      items: Array<{ productId: string; quantity: number }>;
    };
    expect(posted.items.map((i) => i.productId)).toEqual(["p9"]);
    expect(posted.orderId).not.toBe("ord_abandoned");
  });

  it("does not replay a FRESH attempt that belongs to a different basket", async () => {
    savePendingCashOrder("attempt_1", "ord_abandoned", OLD_BASKET);
    liveCart("p9", 2);

    await new OrderRepository(service as never).createCashOrder();

    expect(cash.createCashOrderOnServer).toHaveBeenCalledTimes(1);
    const posted = cash.createCashOrderOnServer.mock.calls[0][0] as {
      orderId: string;
      items: Array<{ productId: string; quantity: number }>;
    };
    expect(posted.items.map((i) => i.productId)).toEqual(["p9"]);
    expect(posted.orderId).not.toBe("ord_abandoned");
  });

  it("still replays the SAME attempt when the basket has not changed", async () => {
    liveCart("p1", 1);
    savePendingCashOrder("attempt_1", "ord_abandoned", OLD_BASKET);

    await new OrderRepository(service as never).createCashOrder();

    expect(cash.createCashOrderOnServer).toHaveBeenCalledTimes(1);
    const posted = cash.createCashOrderOnServer.mock.calls[0][0] as { orderId: string };
    expect(posted.orderId).toBe("ord_abandoned");
  });
});
