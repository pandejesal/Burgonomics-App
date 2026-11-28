/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/core/network/http";

const cash = vi.hoisted(() => ({ createCashOrderOnServer: vi.fn() }));
const service = vi.hoisted(() => ({ getOrder: vi.fn() }));
const cartRepo = vi.hoisted(() => ({ calculateTotals: vi.fn() }));
const lockState = { held: false };

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
import { useOrdersStore } from "@/features/orders/state/ordersStore";
import {
  PENDING_CASH_ORDER_BASE_KEY,
  PENDING_CASH_ORDER_TTL_MS,
  beginCashSubmit,
  markPendingCashOrderConfirmed,
  readPendingCashOrder,
  retirePriceChangedCashAttempt,
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

/* Deterministic barriers only — no sleeps. The lock fixture in beforeEach is
 * left byte-for-byte intact; these helpers are used by the r3 cases below. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
function storedRecord(): any {
  return JSON.parse(
    localStorage.getItem(scopedStorageKey(PENDING_CASH_ORDER_BASE_KEY, "cust_r2")) ?? "null",
  );
}
function cashReceipt(orderId: string) {
  return {
    success: true as const,
    data: {
      orderId,
      replayed: false,
      paymentMethod: "cod" as const,
      paymentChannel: "cash" as const,
      cashDuePaise: 11900,
      totals: {},
      status: { code: "PLACED", label: "Placed", kind: "upcoming", terminal: false },
    },
  };
}
function cashDecline(paise: number) {
  return {
    success: false as const,
    error: {
      code: "PRICE_CHANGED",
      message: "Please reconfirm",
      details: { totals: { split: { totalAmountPaise: paise } } },
    },
  };
}

beforeEach(() => {
  localStorage.clear();
  lockState.held = false;
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    // Web Lock API fidelity: both call forms; a returned async callback holds
    // the lock until it settles (ifAvailable yields null while it is held).
    value: {
      request: async (_key: string, optionsOrClaim: any, maybeClaim?: any) => {
        const options = maybeClaim ? optionsOrClaim : undefined;
        const claim = maybeClaim ?? optionsOrClaim;
        // Web Locks invokes the callback with null when no lock was granted.
        if (options?.ifAvailable && lockState.held) return await claim(null);
        lockState.held = true;
        try {
          return await claim({ name: _key, mode: "exclusive", ifAvailable: false, steal: false });
        } finally {
          lockState.held = false;
        }
      },
    },
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

/** customer-price-confirm-c11 r3 — High 1 & 2: bind the completion to the
 * exact request sent, and contain overlapping submissions under the account
 * lock. Existing assertions above are unchanged. */
describe("r3 — request-identity-bound cash completion", () => {
  it("a delayed PRICE_CHANGED cannot stamp a newer same-ID accepted-total retry", async () => {
    const firstPost = deferred<any>();
    const posted = deferred<void>();
    cash.createCashOrderOnServer.mockReset();
    cash.createCashOrderOnServer.mockImplementationOnce(() => {
      posted.resolve();
      return firstPost.promise;
    });
    const repo = new OrderRepository(service as never);
    const first = repo.createCashOrder();
    await posted.promise; // deterministic: pre-send record written, POST in flight
    const attemptId = storedRecord().attemptId as string;

    // A newer same-ID reconfirmation while the old POST is still unresolved.
    cash.createCashOrderOnServer.mockResolvedValue(cashReceipt("ord_new") as never);
    const newer = await repo.createCashOrder({ attemptId, acceptedTotalPaise: 60_000 });
    firstPost.resolve(cashDecline(40_000) as never);
    await first;

    // r2: stamps the old no-write proof on the newer generation and POSTs twice.
    expect(cash.createCashOrderOnServer).toHaveBeenCalledTimes(1);
    expect(newer.success).toBe(false); // contained busy / safely blocked
    const after = readPendingCashOrder();
    // A safely BLOCKED retry does not mutate the sent request at all.
    expect(after?.request.expectedTotalPaise).toBe(11_900);
    // The ORIGINAL refusal may legitimately mark its own record; no stale
    // evidence is attached to a newer same-id request (which was blocked).
    expect(after?.priceChangeDeclined?.acceptedTotalPaise).toBe(40_000);
    expect(retirePriceChangedCashAttempt(attemptId, 40_000)).toBe(true);
    expect(readPendingCashOrder()).toBeNull(); // proven-safe retirement cleared it
  });

  it("a duplicate same-payload submit while the first POST is unresolved cannot mint a second order", async () => {
    const firstPost = deferred<any>();
    const posted = deferred<void>();
    cash.createCashOrderOnServer.mockReset();
    cash.createCashOrderOnServer.mockImplementationOnce(() => {
      posted.resolve();
      return firstPost.promise;
    });
    const repo = new OrderRepository(service as never);
    const first = repo.createCashOrder();
    await posted.promise;
    cash.createCashOrderOnServer.mockResolvedValue(cashReceipt("ord_second") as never);
    const duplicate = await repo.createCashOrder();

    // r2: the in-flight record is re-submitted, creating a second order.
    expect(cash.createCashOrderOnServer).toHaveBeenCalledTimes(1);
    expect(duplicate.success).toBe(false);
    if (!duplicate.success) {
      expect(duplicate.error.code).toBe("CASH_BUSY");
      expect(duplicate.error.retryable).toBe(true);
    }

    const postedOrderId = (cash.createCashOrderOnServer.mock.calls[0][0] as any).orderId as string;
    service.getOrder.mockResolvedValue(ok(order(postedOrderId)));
    firstPost.resolve(cashReceipt(postedOrderId) as never);
    const settled = await first;
    expect(settled.success).toBe(true);
    expect(service.getOrder).toHaveBeenCalledWith(postedOrderId);
    expect(readPendingCashOrder()).toBeNull(); // verified hydrate clears the record
  });

  it("a losing PRICE_CHANGED completion cannot clear a confirmed receipt or a replacement record", async () => {
    const firstPost = deferred<any>();
    const posted = deferred<void>();
    cash.createCashOrderOnServer.mockReset();
    cash.createCashOrderOnServer.mockImplementationOnce(() => {
      posted.resolve();
      return firstPost.promise;
    });
    const repo = new OrderRepository(service as never);
    const first = repo.createCashOrder();
    await posted.promise;
    const attemptId = storedRecord().attemptId as string;

    // A newer record with the SAME attempt id replaces the one that was sent.
    savePendingCashOrder(attemptId, "ord_replacement", {
      orderId: "ord_replacement",
      orderType: "takeaway",
      items: [{ productId: "p1", quantity: 1 }],
      expectedTotalPaise: 60_000,
    } as never);
    firstPost.resolve(cashDecline(40_000) as never);
    await first;

    // r2: only the attempt id is checked, so it stamps the replacement.
    expect(storedRecord().orderId).toBe("ord_replacement");
    expect(storedRecord().priceChangeDeclined).toBeUndefined();
    expect(retirePriceChangedCashAttempt(attemptId, 40_000)).toBe(false);
    expect(readPendingCashOrder()?.orderId).toBe("ord_replacement");
  });

  it("dead-tab reload replays the same ID and a stale response cannot clear it", async () => {
    const firstPost = deferred<any>();
    const posted = deferred<void>();
    cash.createCashOrderOnServer.mockReset();
    cash.createCashOrderOnServer.mockImplementationOnce(() => {
      posted.resolve();
      return firstPost.promise;
    });
    const first = new OrderRepository(service as never).createCashOrder();
    await posted.promise;
    const attemptId = storedRecord().attemptId as string;
    const orderId = storedRecord().orderId as string;

    // Simulate the browser releasing a dead tab's lock; its POST stays pending.
    lockState.held = false;
    cash.createCashOrderOnServer.mockResolvedValueOnce(cashReceipt(orderId) as never);
    service.getOrder.mockResolvedValue(ok(order(orderId)));
    const reloaded = await new OrderRepository(service as never).createCashOrder();
    expect(reloaded.success).toBe(true);
    const bodies = cash.createCashOrderOnServer.mock.calls.map((call: any[]) => call[0]);
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toMatchObject({
      attemptId,
      orderId,
      expectedTotalPaise: 11_900,
    });

    firstPost.resolve(cashDecline(40_000) as never);
    expect((await first).success).toBe(false); // stale completion loses
    expect(readPendingCashOrder()).toBeNull(); // verified reload hydrate cleared it
  });

  it("an ambiguous replay keeps the tentative record and never retires it", async () => {
    const firstPost = deferred<any>();
    const posted = deferred<void>();
    cash.createCashOrderOnServer.mockReset();
    cash.createCashOrderOnServer.mockImplementationOnce(() => {
      posted.resolve();
      return firstPost.promise;
    });
    const first = new OrderRepository(service as never).createCashOrder();
    await posted.promise;
    const attemptId = storedRecord().attemptId as string;

    lockState.held = false;
    cash.createCashOrderOnServer.mockRejectedValueOnce(new Error("offline"));
    expect((await new OrderRepository(service as never).createCashOrder()).success).toBe(false);

    const record = readPendingCashOrder();
    expect(record?.attemptId).toBe(attemptId);
    expect(record?.priceChangeDeclined).toBeUndefined();
    expect(record?.activeProof).toBeUndefined();
    expect(retirePriceChangedCashAttempt(attemptId, 11_900)).toBe(false);

    firstPost.resolve(cashDecline(40_000) as never);
    await first;
    expect(readPendingCashOrder()?.priceChangeDeclined).toBeUndefined();
  });
});

/** customer-price-confirm-c11 r4 — lifecycle findings (tests only). */
describe("r4 — completion writes cannot erase a newer receipt", () => {
  const zeroDue = (attemptId: string, orderId: string) =>
    ({
      orderId,
      storeId: "s1",
      orderType: "takeaway" as const,
      items: [{ productId: "p1", quantity: 1 }],
      expectedTotalPaise: 0,
      zeroDueOnly: true as const,
    }) as never;

  it("a stale zero-due PRICE_CHANGED cannot clear a newer same-ID receipt", async () => {
    savePendingCashOrder("attempt_s1", "ord_zero", zeroDue("attempt_s1", "ord_zero"));
    const post = deferred<any>();
    const posted = deferred<void>();
    cash.createCashOrderOnServer.mockReset();
    cash.createCashOrderOnServer.mockImplementationOnce(() => {
      posted.resolve();
      return post.promise;
    });
    const first = new OrderRepository(service as never).createCashOrder();
    await posted.promise;

    // Same-ID recovery records and confirms a newer receipt while the old POST
    // is still unresolved.
    savePendingCashOrder("attempt_s1", "ord_new", zeroDue("attempt_s1", "ord_new"));
    markPendingCashOrderConfirmed("ord_new");

    post.resolve(cashDecline(12_000) as never);
    await first;
    const after = readPendingCashOrder();
    expect(after?.orderId).toBe("ord_new");
    expect(after?.confirmed).toBe(true);
  });

  it("a stale terminal no-write refusal cannot clear a newer same-ID receipt", async () => {
    savePendingCashOrder("attempt_s2", "ord_old", {
      orderId: "ord_old",
      storeId: "s1",
      orderType: "takeaway",
      items: [{ productId: "p1", quantity: 1 }],
      expectedTotalPaise: 11_900,
    } as never);
    const post = deferred<any>();
    const posted = deferred<void>();
    cash.createCashOrderOnServer.mockReset();
    cash.createCashOrderOnServer.mockImplementationOnce(() => {
      posted.resolve();
      return post.promise;
    });
    const first = new OrderRepository(service as never).createCashOrder();
    await posted.promise;

    savePendingCashOrder("attempt_s2", "ord_new2", {
      orderId: "ord_new2",
      storeId: "s1",
      orderType: "takeaway",
      items: [{ productId: "p1", quantity: 1 }],
      expectedTotalPaise: 11_900,
    } as never);
    markPendingCashOrderConfirmed("ord_new2");

    post.resolve({
      success: false,
      error: { code: "STORE_CLOSED", message: "closed", retryable: false },
    } as never);
    await first;
    expect(readPendingCashOrder()?.orderId).toBe("ord_new2");
    expect(readPendingCashOrder()?.confirmed).toBe(true);
  });

  it("a valid same-identity zero-due PRICE_CHANGED still clears its own record", async () => {
    savePendingCashOrder("attempt_s3", "ord_zero3", zeroDue("attempt_s3", "ord_zero3"));
    const post = deferred<any>();
    const posted = deferred<void>();
    cash.createCashOrderOnServer.mockReset();
    cash.createCashOrderOnServer.mockImplementationOnce(() => {
      posted.resolve();
      return post.promise;
    });
    const first = new OrderRepository(service as never).createCashOrder();
    await posted.promise;
    post.resolve(cashDecline(11_900) as never);
    await first;
    expect(readPendingCashOrder()).toBeNull();
  });

  it("a concurrent confirmed getOrder read cannot clear a newer receipt", async () => {
    savePendingCashOrder("attempt_s4", "ord_old4", {
      orderId: "ord_old4",
      orderType: "takeaway",
      items: [{ productId: "p1", quantity: 1 }],
      expectedTotalPaise: 11_900,
    } as never);
    markPendingCashOrderConfirmed("ord_old4");

    const read = deferred<any>();
    service.getOrder.mockReset();
    service.getOrder.mockImplementationOnce(() => read.promise);
    const pendingRead = new OrderRepository(service as never).getOrder("ord_old4");

    // A newer same-ID receipt is recorded while the old reader is in flight.
    savePendingCashOrder("attempt_s4", "ord_new4", {
      orderId: "ord_new4",
      orderType: "takeaway",
      items: [{ productId: "p1", quantity: 1 }],
      expectedTotalPaise: 11_900,
    } as never);
    markPendingCashOrderConfirmed("ord_new4");

    read.resolve(ok(order("ord_old4")));
    await pendingRead;
    expect(readPendingCashOrder()?.orderId).toBe("ord_new4");
    expect(readPendingCashOrder()?.confirmed).toBe(true);
  });

  it("a sent then aged attempt is recoverable by explicit same-ID replay", async () => {
    savePendingCashOrder("attempt_age", "ord_age", {
      orderId: "ord_age",
      orderType: "takeaway",
      items: [{ productId: "p1", quantity: 1 }],
      expectedTotalPaise: 11_900,
    } as never);
    expect(
      beginCashSubmit({
        uid: "cust_r2",
        attemptId: "attempt_age",
        orderId: "ord_age",
        expectedTotalPaise: 11_900,
        sessionNonce: "nonce_age",
      }),
    ).not.toBeNull();
    const key = scopedStorageKey(PENDING_CASH_ORDER_BASE_KEY, "cust_r2");
    const aged = storedRecord();
    aged.createdAtMs = Date.now() - PENDING_CASH_ORDER_TTL_MS - 5_000;
    aged.basketHash = "a-different-basket";
    localStorage.setItem(key, JSON.stringify(aged));

    cash.createCashOrderOnServer.mockReset();
    cash.createCashOrderOnServer.mockResolvedValue(cashReceipt("ord_age") as never);
    service.getOrder.mockResolvedValue(ok(order("ord_age")));
    const result = await new OrderRepository(service as never).createCashOrder({
      attemptId: "attempt_age",
    });
    expect(result.success).toBe(true);
    expect(cash.createCashOrderOnServer).toHaveBeenCalledTimes(1);
    expect(cash.createCashOrderOnServer.mock.calls[0][0]).toMatchObject({
      attemptId: "attempt_age",
      orderId: "ord_age",
    });
  });
});

/** customer-price-confirm-c11 r5 slice A — an earlier unresolved send wins. */
describe("r5 — earlier unknown send dominates a later refusal", () => {
  const request = (orderId: string) =>
    ({
      orderId,
      storeId: "s1",
      orderType: "takeaway" as const,
      items: [{ productId: "p1", quantity: 1 }],
      expectedTotalPaise: 11_900,
    }) as never;

  it("a later PRICE_CHANGED cannot retire while an earlier same-ID send is unresolved", async () => {
    savePendingCashOrder("attempt_u1", "ord_u1", request("ord_u1"));
    const earlierPost = deferred<any>();
    const earlierSent = deferred<void>();
    cash.createCashOrderOnServer.mockReset();
    cash.createCashOrderOnServer.mockImplementationOnce(() => {
      earlierSent.resolve();
      return earlierPost.promise;
    });
    const earlier = new OrderRepository(service as never).createCashOrder();
    await earlierSent.promise;

    // Simulate a dead tab releasing its lock while the earlier POST is pending.
    lockState.held = false;
    const laterPost = deferred<any>();
    const laterSent = deferred<void>();
    cash.createCashOrderOnServer.mockImplementationOnce(() => {
      laterSent.resolve();
      return laterPost.promise;
    });
    const later = new OrderRepository(service as never).createCashOrder({
      attemptId: "attempt_u1",
    });
    await laterSent.promise;
    laterPost.resolve(cashDecline(60_000) as never);
    expect((await later).success).toBe(false);

    // The earlier send is still unresolved: no retirement is safe.
    expect(retirePriceChangedCashAttempt("attempt_u1", 60_000)).toBe(false);
    expect(readPendingCashOrder()?.orderId).toBe("ord_u1");

    // Only same-ID recovery with a matching positive receipt settles it.
    cash.createCashOrderOnServer.mockResolvedValueOnce(cashReceipt("ord_u1") as never);
    service.getOrder.mockResolvedValue(ok(order("ord_u1")));
    const recovered = await new OrderRepository(service as never).createCashOrder({
      attemptId: "attempt_u1",
    });
    expect(recovered.success).toBe(true);
    expect(service.getOrder).toHaveBeenCalledWith("ord_u1");
    // Verified hydrate clears the confirmed record by design.
    expect(readPendingCashOrder()).toBeNull();

    earlierPost.resolve(cashDecline(11_900) as never); // stale earlier refusal
    await earlier;
    expect(readPendingCashOrder()).toBeNull();
  });

  it("a later terminal no-write cannot retire while an earlier same-ID send is unresolved", async () => {
    savePendingCashOrder("attempt_u2", "ord_u2", request("ord_u2"));
    const earlierPost = deferred<any>();
    const earlierSent = deferred<void>();
    cash.createCashOrderOnServer.mockReset();
    cash.createCashOrderOnServer.mockImplementationOnce(() => {
      earlierSent.resolve();
      return earlierPost.promise;
    });
    const earlier = new OrderRepository(service as never).createCashOrder();
    await earlierSent.promise;

    lockState.held = false;
    cash.createCashOrderOnServer.mockImplementationOnce(() =>
      Promise.resolve({
        success: false,
        error: { code: "STORE_CLOSED", message: "closed", retryable: false },
      }),
    );
    const later = await new OrderRepository(service as never).createCashOrder({
      attemptId: "attempt_u2",
    });
    expect(later.success).toBe(false);

    expect(readPendingCashOrder()?.orderId).toBe("ord_u2");
    expect(retirePriceChangedCashAttempt("attempt_u2", 11_900)).toBe(false);

    cash.createCashOrderOnServer.mockResolvedValueOnce(cashReceipt("ord_u2") as never);
    service.getOrder.mockResolvedValue(ok(order("ord_u2")));
    expect(
      (await new OrderRepository(service as never).createCashOrder({ attemptId: "attempt_u2" }))
        .success,
    ).toBe(true);
    expect(service.getOrder).toHaveBeenCalledWith("ord_u2");
    expect(readPendingCashOrder()).toBeNull();

    earlierPost.resolve(cashDecline(11_900) as never);
    await earlier;
    expect(readPendingCashOrder()).toBeNull();
  });

  it("a fresh definitive PRICE_CHANGED still permits its normal reconfirm outcome", async () => {
    savePendingCashOrder("attempt_fresh", "ord_fresh", request("ord_fresh"));
    cash.createCashOrderOnServer.mockReset();
    cash.createCashOrderOnServer.mockResolvedValueOnce(cashDecline(60_000) as never);
    const result = await new OrderRepository(service as never).createCashOrder();
    expect(result.success).toBe(false);
    expect(readPendingCashOrder()?.priceChangeDeclined?.acceptedTotalPaise).toBe(60_000);
    expect(retirePriceChangedCashAttempt("attempt_fresh", 60_000)).toBe(true);
  });

  it("an old confirmed reader cannot clear a newer generation of the same receipt", async () => {
    savePendingCashOrder("attempt_gen", "ord_gen", request("ord_gen"));
    markPendingCashOrderConfirmed("ord_gen");
    const before = storedRecord().generation as number;

    const read = deferred<any>();
    service.getOrder.mockReset();
    service.getOrder.mockImplementationOnce(() => read.promise);
    const oldReader = new OrderRepository(service as never).getOrder("ord_gen");

    // Same uid/order/attempt, but a newer stored incarnation.
    markPendingCashOrderConfirmed("ord_gen");
    markPendingCashOrderConfirmed("ord_gen");
    const newer = storedRecord().generation as number;
    expect(newer).toBeGreaterThan(before);

    read.resolve(ok(order("ord_gen")));
    await oldReader;
    expect(readPendingCashOrder()?.generation).toBe(newer);
    expect(readPendingCashOrder()?.confirmed).toBe(true);
  });
});

/** customer-price-confirm-c11 r5 A2 — provenance and receipt validation. */
describe("r5 A2 — untrusted provenance and mismatched receipts", () => {
  const key = () => scopedStorageKey(PENDING_CASH_ORDER_BASE_KEY, "cust_r2");
  const request = (orderId: string) =>
    ({
      orderId,
      storeId: "s1",
      orderType: "takeaway" as const,
      items: [{ productId: "p1", quantity: 1 }],
      expectedTotalPaise: 11_900,
    }) as never;
  const receiptWith = (orderId: string, cashDuePaise: number) => ({
    success: true as const,
    data: {
      orderId,
      replayed: false,
      paymentMethod: "cod" as const,
      paymentChannel: "cash" as const,
      cashDuePaise,
      totals: {},
      status: { code: "PLACED", label: "Placed", kind: "upcoming", terminal: false },
    },
  });

  it("a later reprice cannot retire a record with absent sent provenance", async () => {
    savePendingCashOrder("attempt_abs", "ord_abs", request("ord_abs"));
    const legacy = JSON.parse(localStorage.getItem(key())!);
    delete legacy.sent;
    localStorage.setItem(key(), JSON.stringify(legacy));

    cash.createCashOrderOnServer.mockReset();
    cash.createCashOrderOnServer.mockResolvedValueOnce(cashDecline(60_000) as never);
    expect((await new OrderRepository(service as never).createCashOrder()).success).toBe(false);

    expect(readPendingCashOrder()?.attemptId).toBe("attempt_abs");
    expect(retirePriceChangedCashAttempt("attempt_abs", 60_000)).toBe(false);
  });

  it("a later terminal refusal cannot retire an absent-sent record", async () => {
    savePendingCashOrder("attempt_abs2", "ord_abs2", request("ord_abs2"));
    const legacy = JSON.parse(localStorage.getItem(key())!);
    delete legacy.sent;
    localStorage.setItem(key(), JSON.stringify(legacy));

    cash.createCashOrderOnServer.mockReset();
    cash.createCashOrderOnServer.mockResolvedValueOnce({
      success: false,
      error: { code: "STORE_CLOSED", message: "closed", retryable: false },
    } as never);
    expect((await new OrderRepository(service as never).createCashOrder()).success).toBe(false);
    expect(readPendingCashOrder()?.attemptId).toBe("attempt_abs2");
    expect(retirePriceChangedCashAttempt("attempt_abs2", 11_900)).toBe(false);
  });

  it("an old legacy decline marker is not trustworthy evidence for retirement", () => {
    savePendingCashOrder("attempt_old", "ord_old", request("ord_old"));
    const legacy = JSON.parse(localStorage.getItem(key())!);
    legacy.priceChangeDeclined = {
      attemptId: "attempt_old",
      acceptedTotalPaise: 50_000,
      generation: 1,
    };
    delete legacy.sent;
    delete legacy.unknownEarlierSend;
    localStorage.setItem(key(), JSON.stringify(legacy));
    expect(retirePriceChangedCashAttempt("attempt_old", 50_000)).toBe(false);
  });

  it("a receipt with the wrong order ID keeps the unresolved record", async () => {
    savePendingCashOrder("attempt_id", "ord_right", request("ord_right"));
    cash.createCashOrderOnServer.mockReset();
    cash.createCashOrderOnServer.mockResolvedValueOnce(receiptWith("ord_wrong", 11_900) as never);
    service.getOrder.mockResolvedValue(ok(order("ord_wrong")));

    const result = await new OrderRepository(service as never).createCashOrder();
    expect(result.success).toBe(false);
    expect(readPendingCashOrder()?.orderId).toBe("ord_right");
    expect(readPendingCashOrder()?.confirmed).not.toBe(true);
    expect(cash.createCashOrderOnServer).toHaveBeenCalledTimes(1);
  });

  it("a receipt with the wrong cashDuePaise keeps the unresolved record", async () => {
    savePendingCashOrder("attempt_paise", "ord_paise", request("ord_paise"));
    cash.createCashOrderOnServer.mockReset();
    cash.createCashOrderOnServer.mockResolvedValueOnce(receiptWith("ord_paise", 60_000) as never);
    service.getOrder.mockResolvedValue(ok(order("ord_paise")));

    const result = await new OrderRepository(service as never).createCashOrder();
    expect(result.success).toBe(false);
    expect(readPendingCashOrder()?.orderId).toBe("ord_paise");
    expect(readPendingCashOrder()?.confirmed).not.toBe(true);
    expect(cash.createCashOrderOnServer).toHaveBeenCalledTimes(1);
  });

  it("an old generation-less confirmed reader cannot clear a newer same-ID incarnation", async () => {
    savePendingCashOrder("attempt_g0", "ord_g0", request("ord_g0"));
    markPendingCashOrderConfirmed("ord_g0");
    // A legacy confirmed record whose generation is genuinely absent.
    const legacy = JSON.parse(localStorage.getItem(key())!);
    delete legacy.generation;
    localStorage.setItem(key(), JSON.stringify(legacy));

    const read = deferred<any>();
    service.getOrder.mockReset();
    service.getOrder.mockImplementationOnce(() => read.promise);
    const oldReader = new OrderRepository(service as never).getOrder("ord_g0");

    savePendingCashOrder("attempt_g0", "ord_g0", request("ord_g0"));
    markPendingCashOrderConfirmed("ord_g0");
    const newer = storedRecord().generation as number;

    read.resolve(ok(order("ord_g0")));
    await oldReader;
    expect(readPendingCashOrder()?.generation).toBe(newer);
    expect(readPendingCashOrder()?.confirmed).toBe(true);
  });
});

/** customer-price-confirm-c11 r5 A3 — serial provenance and in-memory draft. */
describe("r5 A3 — serial reconfirm provenance and draft retention", () => {
  const baseRequest = (orderId: string, paise = 11_900) =>
    ({
      orderId,
      storeId: "s1",
      orderType: "takeaway" as const,
      items: [{ productId: "p1", quantity: 1 }],
      expectedTotalPaise: paise,
    }) as never;
  const receipt = (orderId: string, cashDuePaise: number) => ({
    success: true as const,
    data: {
      orderId,
      replayed: false,
      paymentMethod: "cod" as const,
      paymentChannel: "cash" as const,
      cashDuePaise,
      totals: {},
      status: { code: "PLACED", label: "Placed", kind: "upcoming", terminal: false },
    },
  });
  const withDraft = () => {
    useCheckoutStore.setState({ orderNotes: "No onions", pickupInstructions: "Counter B" });
    expect(useCheckoutStore.getState().orderNotes).toBe("No onions");
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
          notes: "line note",
        },
      ],
      storeId: "s1",
      status: "ready",
    });
  };

  it("a genuine serial reconfirm keeps proven no-write and can retire again", async () => {
    savePendingCashOrder("attempt_serial", "ord_serial", baseRequest("ord_serial"));
    cash.createCashOrderOnServer.mockReset();
    cash.createCashOrderOnServer.mockResolvedValueOnce(cashDecline(60_000) as never);
    expect((await new OrderRepository(service as never).createCashOrder()).success).toBe(false);
    expect(readPendingCashOrder()?.priceChangeDeclined?.proven).toBe("fresh");

    cash.createCashOrderOnServer.mockResolvedValueOnce(cashDecline(60_000) as never);
    const second = await new OrderRepository(service as never).createCashOrder({
      attemptId: "attempt_serial",
      acceptedTotalPaise: 60_000,
    });
    expect(second.success).toBe(false);
    expect(cash.createCashOrderOnServer.mock.calls[1][0]).toMatchObject({
      attemptId: "attempt_serial",
      orderId: "ord_serial",
      expectedTotalPaise: 60_000,
    });
    expect(readPendingCashOrder()?.priceChangeDeclined?.acceptedTotalPaise).toBe(60_000);
    expect(retirePriceChangedCashAttempt("attempt_serial", 60_000)).toBe(true);
  });

  it("a distinct verified no-write after serial reconfirm follows the normal refusal path", async () => {
    savePendingCashOrder("attempt_serial2", "ord_serial2", baseRequest("ord_serial2"));
    cash.createCashOrderOnServer.mockReset();
    cash.createCashOrderOnServer.mockResolvedValueOnce(cashDecline(60_000) as never);
    await new OrderRepository(service as never).createCashOrder();

    cash.createCashOrderOnServer.mockResolvedValueOnce({
      success: false,
      error: { code: "STORE_CLOSED", message: "closed", retryable: false },
    } as never);
    const result = await new OrderRepository(service as never).createCashOrder({
      attemptId: "attempt_serial2",
      acceptedTotalPaise: 60_000,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("STORE_CLOSED");
    expect(readPendingCashOrder()).toBeNull();
  });

  it("a wrong-ID receipt keeps the in-memory draft for explicit same-ID retry", async () => {
    withDraft();
    cash.createCashOrderOnServer.mockReset();
    cash.createCashOrderOnServer
      .mockResolvedValueOnce(receipt("ord_other", 11_900) as never)
      .mockImplementationOnce(async (request: { orderId: string }) =>
        receipt(request.orderId, 11_900),
      );
    service.getOrder.mockImplementation(async (id: string) => ok(order(id)));
    const repo = new OrderRepository(service as never); // routes reuse ONE instance

    expect((await repo.createCashOrder()).success).toBe(false);
    const initial = cash.createCashOrderOnServer.mock.calls[0][0] as {
      notes?: string;
      items: Array<{ notes?: string }>;
    };
    expect(initial.notes).toBe("No onions");
    expect(initial.items[0].notes).toBe("line note");
    const attemptId = readPendingCashOrder()?.attemptId as string;
    expect(attemptId).toBeTruthy();
    expect((await repo.createCashOrder({ attemptId })).success).toBe(true);
    const retried = cash.createCashOrderOnServer.mock.calls[1][0] as {
      notes?: string;
      fulfillmentInstructions?: string;
      items: Array<{ notes?: string }>;
    };
    expect(retried.notes).toBe("No onions");
    expect(retried.fulfillmentInstructions).toBe("Counter B");
    expect(retried.items[0].notes).toBe("line note");
    const persisted = localStorage.getItem(
      scopedStorageKey(PENDING_CASH_ORDER_BASE_KEY, "cust_r2"),
    );
    expect(persisted === null || !/No onions|Counter B|line note/.test(persisted)).toBe(true);
  });

  it("a wrong-total receipt keeps the in-memory draft for explicit same-ID retry", async () => {
    withDraft();
    cash.createCashOrderOnServer.mockReset();
    let sendCount = 0;
    cash.createCashOrderOnServer.mockImplementation(async (request: { orderId: string }) => {
      sendCount += 1;
      return receipt(request.orderId, sendCount === 1 ? 60_000 : 11_900);
    });
    service.getOrder.mockImplementation(async (id: string) => ok(order(id)));
    const repo = new OrderRepository(service as never); // routes reuse ONE instance

    expect((await repo.createCashOrder()).success).toBe(false);
    const attemptId = readPendingCashOrder()?.attemptId as string;
    expect(attemptId).toBeTruthy();
    expect((await repo.createCashOrder({ attemptId })).success).toBe(true);
    const retried = cash.createCashOrderOnServer.mock.calls[1][0] as {
      notes?: string;
      items: Array<{ notes?: string }>;
    };
    expect(retried.notes).toBe("No onions");
    expect(retried.items[0].notes).toBe("line note");
  });

  it("an unproven prior still blocks retirement after a later refusal", () => {
    savePendingCashOrder("attempt_unproven", "ord_unproven", baseRequest("ord_unproven"));
    const key = scopedStorageKey(PENDING_CASH_ORDER_BASE_KEY, "cust_r2");
    const raw = JSON.parse(localStorage.getItem(key)!);
    raw.priceChangeDeclined = {
      attemptId: "attempt_unproven",
      acceptedTotalPaise: 50_000,
      generation: 1,
    };
    delete raw.sent;
    localStorage.setItem(key, JSON.stringify(raw));
    expect(retirePriceChangedCashAttempt("attempt_unproven", 50_000)).toBe(false);
  });
});

/** customer-price-confirm-c11 r5 A7 — outbound snapshot used by the repository. */
describe("r5 A7 — repository sends the validated snapshot", () => {
  const key = () => scopedStorageKey(PENDING_CASH_ORDER_BASE_KEY, "cust_r2");
  const req = (orderId: string) =>
    ({
      orderId,
      storeId: "s1",
      orderType: "takeaway" as const,
      items: [{ productId: "p1", quantity: 1 }],
      expectedTotalPaise: 11_900,
    }) as never;

  it("an inconsistent saved request rejects before any POST", async () => {
    savePendingCashOrder("attempt_bind", "ord_bind", req("wrong-order"));
    const before = localStorage.getItem(key());
    cash.createCashOrderOnServer.mockReset();
    const result = await new OrderRepository(service as never).createCashOrder({
      attemptId: "attempt_bind",
    });
    expect(result.success).toBe(false);
    expect(cash.createCashOrderOnServer).not.toHaveBeenCalled();
    expect(localStorage.getItem(key())).toBe(before);
  });

  it("the POST body is the sealed validated order id/attempt/amount", async () => {
    savePendingCashOrder("attempt_ok", "ord_ok", req("ord_ok"));
    cash.createCashOrderOnServer.mockReset();
    cash.createCashOrderOnServer.mockImplementation(async (request: { orderId: string }) => ({
      success: true,
      data: {
        orderId: request.orderId,
        replayed: false,
        paymentMethod: "cod",
        paymentChannel: "cash",
        cashDuePaise: 11_900,
        totals: {},
        status: { code: "PLACED", label: "Placed", kind: "upcoming", terminal: false },
      },
    }));
    service.getOrder.mockImplementation(async (id: string) => ok(order(id)));
    const result = await new OrderRepository(service as never).createCashOrder({
      attemptId: "attempt_ok",
    });
    expect(result.success).toBe(true);
    expect(cash.createCashOrderOnServer).toHaveBeenCalledTimes(1);
    expect(cash.createCashOrderOnServer.mock.calls[0][0]).toMatchObject({
      orderId: "ord_ok",
      attemptId: "attempt_ok",
      expectedTotalPaise: 11_900,
    });
  });
});

/** customer-price-confirm-c11 r5 A10 — hydration bound to captured incarnation. */
describe("r5 A10 — deferred receipt read binding", () => {
  const key = () => scopedStorageKey(PENDING_CASH_ORDER_BASE_KEY, "cust_r2");

  it("a deferred read cannot clear a newer same-ID confirmed incarnation", async () => {
    savePendingCashOrder("attempt_h", "ord_h", {
      orderId: "ord_h",
      storeId: "s1",
      orderType: "takeaway",
      items: [{ productId: "p1", quantity: 1 }],
      expectedTotalPaise: 11_900,
    } as never);
    const initial = JSON.parse(localStorage.getItem(key())!);
    initial.confirmed = true;
    initial.generation = 3;
    localStorage.setItem(key(), JSON.stringify(initial));

    const read = deferred<any>();
    service.getOrder.mockReset();
    service.getOrder.mockImplementationOnce(() => read.promise);
    const pending = new OrderRepository(service as never).createCashOrder({
      attemptId: "attempt_h",
    });

    const newer = JSON.parse(localStorage.getItem(key())!);
    newer.generation = 4;
    localStorage.setItem(key(), JSON.stringify(newer));

    read.resolve(ok(order("ord_h")));
    const result = await pending;
    expect(result.success).toBe(false);
    expect(readPendingCashOrder()?.generation).toBe(4);
    expect(readPendingCashOrder()?.confirmed).toBe(true);
  });
});

/** customer-price-confirm-c11 r5 A11 — exact clear is the publication gate. */
describe("r5 A11 — receipt publication gate", () => {
  const key = () => scopedStorageKey(PENDING_CASH_ORDER_BASE_KEY, "cust_r2");
  const seedConfirmed = (generation?: number) => {
    savePendingCashOrder("attempt_pub", "ord_pub", {
      orderId: "ord_pub",
      storeId: "s1",
      orderType: "takeaway",
      items: [{ productId: "p1", quantity: 1 }],
      expectedTotalPaise: 11_900,
    } as never);
    const raw = JSON.parse(localStorage.getItem(key())!);
    raw.confirmed = true;
    raw.sent = true;
    if (generation !== undefined) raw.generation = generation;
    else delete raw.generation;
    localStorage.setItem(key(), JSON.stringify(raw));
  };
  const replaceRevision = (value: number | null) => {
    const raw = JSON.parse(localStorage.getItem(key())!);
    if (value === null) raw.generation = null;
    else raw.generation = value;
    localStorage.setItem(key(), JSON.stringify(raw));
  };

  it("a newer incarnation during the deferred read fails without publication", async () => {
    seedConfirmed(3);
    const started = deferred<void>();
    const read = deferred<any>();
    service.getOrder.mockReset();
    service.getOrder.mockImplementationOnce(() => {
      started.resolve();
      return read.promise;
    });
    const upsert = vi.spyOn(useOrdersStore.getState(), "upsert");
    const setActive = vi.spyOn(useOrdersStore.getState(), "setActiveOrderId");
    try {
      const pending = new OrderRepository(service as never).createCashOrder({
        attemptId: "attempt_pub",
      });
      await started.promise; // the read is definitely in flight
      replaceRevision(4);
      const exact = localStorage.getItem(key());
      read.resolve(ok(order("ord_pub")));
      const result = await pending;
      expect(result.success).toBe(false);
      expect(localStorage.getItem(key())).toBe(exact);
      expect(upsert).not.toHaveBeenCalled();
      expect(setActive).not.toHaveBeenCalled();
    } finally {
      upsert.mockRestore();
      setActive.mockRestore();
    }
  });

  it("an absent legacy revision replaced by present null fails without publication", async () => {
    seedConfirmed(undefined);
    const started = deferred<void>();
    const read = deferred<any>();
    service.getOrder.mockReset();
    service.getOrder.mockImplementationOnce(() => {
      started.resolve();
      return read.promise;
    });
    const upsert = vi.spyOn(useOrdersStore.getState(), "upsert");
    const setActive = vi.spyOn(useOrdersStore.getState(), "setActiveOrderId");
    try {
      const pending = new OrderRepository(service as never).createCashOrder({
        attemptId: "attempt_pub",
      });
      await started.promise;
      replaceRevision(null);
      const exact = localStorage.getItem(key());
      read.resolve(ok(order("ord_pub")));
      const result = await pending;
      expect(result.success).toBe(false);
      expect(localStorage.getItem(key())).toBe(exact);
      expect(upsert).not.toHaveBeenCalled();
      expect(setActive).not.toHaveBeenCalled();
    } finally {
      upsert.mockRestore();
      setActive.mockRestore();
    }
  });

  it("a genuinely absent legacy revision still publishes and clears", async () => {
    seedConfirmed(undefined);
    service.getOrder.mockReset();
    service.getOrder.mockResolvedValue(ok(order("ord_pub")));
    const result = await new OrderRepository(service as never).createCashOrder({
      attemptId: "attempt_pub",
    });
    expect(result.success).toBe(true);
    expect(readPendingCashOrder()).toBeNull();
  });
});
