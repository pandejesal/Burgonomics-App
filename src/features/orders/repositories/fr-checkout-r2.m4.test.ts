/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/core/network/http";

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

import { OrderRepository } from "./OrderRepository";
import { useCartStore } from "@/features/cart/state/cartStore";
import { useStoreSelection } from "@/features/stores/state/storeStore";
import { useCheckoutStore } from "@/features/checkout/state/checkoutStore";
import {
  PENDING_CASH_ORDER_BASE_KEY,
  savePendingCashOrder,
} from "@/features/payments/services/pendingCashOrder";
import {
  configureAuthUidSource,
  purgeScopedLocalCaches,
  scopedStorageKey,
} from "@/features/auth/utils/scopedPersistence";
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
const order = (id: string) =>
  ({
    id,
    status: { code: "PLACED", label: "Order placed", kind: "upcoming", terminal: false },
    totals,
    items: [],
    store: { id: "s1", name: "S" },
    payment: { method: "cod", label: "Cash", status: "CASH_PENDING" },
  }) as never;

let uid = "cust_r2";
const listeners = new Set<(s: any) => void>();
function setUid(next: string) {
  uid = next;
  for (const l of listeners) l({ user: { id: uid } });
}

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: { request: async (_key: string, claim: () => unknown) => claim() },
  });
  cash.createCashOrderOnServer.mockReset();
  service.getOrder.mockReset();
  cartRepo.calculateTotals.mockReset();
  cartRepo.calculateTotals.mockResolvedValue(ok(totals));
  cash.createCashOrderOnServer.mockImplementation(async (request: any) =>
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
  service.getOrder.mockResolvedValue(ok(order("ord_r2")));
  useCartStore.setState({
    lines: [
      {
        lineId: "l1",
        productId: "p1",
        storeId: "s1",
        name: "Burger",
        unitPrice: 100,
        quantity: 1,
        modifiers: [],
        availability: "available",
      },
    ],
    storeId: "s1",
    status: "ready",
  });
  useStoreSelection.setState({
    activeStore: { id: "s1", name: "S" } as never,
    fulfillment: "takeaway",
  });
  useCheckoutStore.getState().reset();
  configureAuthUidSource({
    getUid: () => uid,
    subscribe: (l: any) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  });
  setUid("cust_r2");
});

describe("M4 â€” the account-bound ID survives repeated read failures and reloads", () => {
  it("two failed receipt reads still retry only the ORIGINAL id, never a new POST", async () => {
    service.getOrder.mockResolvedValueOnce(fail("OFFLINE", "offline", true));
    service.getOrder.mockResolvedValueOnce(fail("OFFLINE", "offline", true));
    service.getOrder.mockImplementation(async (id: string) => ok(order(id)));
    const repo = new OrderRepository(service as never);
    await repo.createCashOrder();
    const id = cash.createCashOrderOnServer.mock.calls[0][0].orderId;
    expect(cash.createCashOrderOnServer).toHaveBeenCalledTimes(1);
    await repo.createCashOrder();
    await repo.createCashOrder();
    expect(cash.createCashOrderOnServer).toHaveBeenCalledTimes(1);
    expect(service.getOrder.mock.calls.map((c: any[]) => c[0])).toEqual([id, id, id]);
  });

  it("a reload recovers the confirmed id and only hydrates it", async () => {
    service.getOrder.mockResolvedValueOnce(fail("OFFLINE", "offline", true));
    await new OrderRepository(service as never).createCashOrder();
    await new OrderRepository(service as never).createCashOrder();
    expect(cash.createCashOrderOnServer).toHaveBeenCalledTimes(1);
    expect(service.getOrder).toHaveBeenCalledTimes(2);
  });

  it("two tabs on one account converge on the same id", async () => {
    const a = new OrderRepository(service as never);
    const b = new OrderRepository(service as never);
    await Promise.all([a.createCashOrder(), b.createCashOrder()]);
    const ids = cash.createCashOrderOnServer.mock.calls.map((c: any[]) => (c[0] as any).orderId);
    expect(new Set(ids).size).toBe(1);
  });
});

describe("M4 privacy â€” minimal replay payload and scoped purge", () => {
  it("refuses to POST when the durable attempt cannot be written", async () => {
    const denied = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    try {
      const result = await new OrderRepository(service as never).createCashOrder();
      expect(result.success).toBe(false);
      expect(cash.createCashOrderOnServer).not.toHaveBeenCalled();
    } finally {
      denied.mockRestore();
    }
  });

  it("stores only fields required for replay, never contact details or notes", () => {
    savePendingCashOrder("attempt_r2", "ord_r2", {
      orderId: "ord_r2",
      storeId: "s1",
      branchId: "b1",
      orderType: "takeaway",
      items: [{ productId: "p1", quantity: 1, modifiers: [{ id: "opt1", priceDelta: 10 }] }],
      expectedTotalPaise: 11900,
      deliveryQuoteId: "dq1",
      couponCode: "FR20",
      customerName: "Private Name",
      customerPhone: "9999999999",
      notes: "private note",
      fulfillmentInstructions: "leave at door",
      address: { line1: "secret" },
      store: { id: "s1" },
      promo: { code: "FR20" },
    } as never);
    const raw =
      localStorage.getItem(scopedStorageKey(PENDING_CASH_ORDER_BASE_KEY, "cust_r2")) ?? "";
    expect(raw).toContain("ord_r2");
    expect(raw).toContain("opt1");
    for (const secret of [
      "Private Name",
      "9999999999",
      "private note",
      "leave at door",
      "secret",
    ]) {
      expect(raw).not.toContain(secret);
    }
  });

  it("purges the old account's key on account switch and on deletion", () => {
    setUid("cust_r2");
    savePendingCashOrder("attempt_r2", "ord_r2", {
      orderId: "ord_r2",
      orderType: "takeaway",
      items: [],
      expectedTotalPaise: 100,
    } as never);
    const oldKey = scopedStorageKey(PENDING_CASH_ORDER_BASE_KEY, "cust_r2");
    expect(localStorage.getItem(oldKey)).not.toBeNull();
    setUid("cust_other");
    expect(localStorage.getItem(oldKey)).toBeNull();

    setUid("cust_r2");
    savePendingCashOrder("attempt_r2", "ord_r2", {
      orderId: "ord_r2",
      orderType: "takeaway",
      items: [],
      expectedTotalPaise: 100,
    } as never);
    expect(localStorage.getItem(oldKey)).not.toBeNull();
    purgeScopedLocalCaches("cust_r2");
    expect(localStorage.getItem(oldKey)).toBeNull();
  });
});
