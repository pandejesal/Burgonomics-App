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

import {
  PENDING_CASH_ORDER_BASE_KEY,
  PENDING_CASH_ORDER_TTL_MS,
  beginCashSubmit,
  clearPendingCashOrder,
  completeCashSubmit,
  markPendingCashOrderConfirmed,
  markPriceChangedDeclined,
  peekPendingCashOrder,
  prepareCashSend,
  readPendingCashOrder,
  retirePriceChangedCashAttempt,
  savePendingCashOrder,
  updatePendingCashOrderAcceptedTotal,
} from "@/features/payments/services/pendingCashOrder";
import { OrderRepository } from "@/features/orders/repositories/OrderRepository";
import { useCartStore } from "@/features/cart/state/cartStore";
import { useStoreSelection } from "@/features/stores/state/storeStore";
import { useCheckoutStore } from "@/features/checkout/state/checkoutStore";
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
  lockState.held = false;
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    // Web Lock API fidelity: both call forms; a returned async callback holds
    // the lock until it settles (ifAvailable yields null while it is held).
    value: {
      request: async (_key: string, optionsOrClaim: any, maybeClaim?: any) => {
        const options = maybeClaim ? optionsOrClaim : undefined;
        const claim = maybeClaim ?? optionsOrClaim;
        if (options?.ifAvailable && lockState.held) return null;
        lockState.held = true;
        try {
          return await claim();
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

/** customer-price-confirm-c11 r2: narrow compare-and-retire invariants. */
describe("PRICE_CHANGED attempt retirement", () => {
  const declinedAttempt = () => {
    savePendingCashOrder("attempt_pc", "ord_pc", { ...OLD_BASKET, orderId: "ord_pc" } as never);
    // A marker with positive provenance: created with no earlier unresolved send.
    const storageKey = scopedStorageKey(PENDING_CASH_ORDER_BASE_KEY, "cust_ttl");
    const raw = JSON.parse(localStorage.getItem(storageKey)!);
    raw.generation += 1;
    raw.sent = true;
    raw.priceChangeDeclined = {
      uid: "cust_ttl",
      attemptId: "attempt_pc",
      orderId: "ord_pc",
      acceptedTotalPaise: 60_000,
      generation: raw.generation,
      proven: "fresh",
    };
    localStorage.setItem(storageKey, JSON.stringify(raw));
  };
  const pendingStored = () =>
    Object.keys(localStorage).some((key) => key.includes("pendingCashOrder"));

  it("retires only the exact, definitively-declined attempt", () => {
    declinedAttempt();
    expect(retirePriceChangedCashAttempt("attempt_pc", 60_000)).toBe(true);
    expect(readPendingCashOrder()).toBeNull();
    expect(pendingStored()).toBe(false);
  });

  it("keeps an outcome-uncertain attempt with no PRICE_CHANGED evidence", () => {
    savePendingCashOrder("attempt_pc", "ord_pc", OLD_BASKET);
    expect(retirePriceChangedCashAttempt("attempt_pc", 60_000)).toBe(false);
    expect(readPendingCashOrder()?.orderId).toBe("ord_pc");
  });

  it("keeps a CONFIRMED attempt — its id is the proof of the write", () => {
    declinedAttempt();
    markPendingCashOrderConfirmed("ord_pc");
    expect(retirePriceChangedCashAttempt("attempt_pc", 60_000)).toBe(false);
    expect(readPendingCashOrder()?.confirmed).toBe(true);
  });

  it("keeps a newer same-id write (accepted total) rather than dropping its retry", () => {
    declinedAttempt();
    updatePendingCashOrderAcceptedTotal(60_000);
    expect(retirePriceChangedCashAttempt("attempt_pc", 60_000)).toBe(false);
    expect(readPendingCashOrder()?.request.expectedTotalPaise).toBe(60_000);
  });

  it("keeps unrelated attempt ids, unrelated totals and zero-due records", () => {
    declinedAttempt();
    expect(retirePriceChangedCashAttempt("attempt_other", 60_000)).toBe(false);
    expect(retirePriceChangedCashAttempt("attempt_pc", 50_000)).toBe(false);
    expect(readPendingCashOrder()?.attemptId).toBe("attempt_pc");

    savePendingCashOrder("attempt_zero", "ord_zero", { ...OLD_BASKET, zeroDueOnly: true });
    expect(markPriceChangedDeclined("attempt_zero", 0)).toBe(false);
    expect(retirePriceChangedCashAttempt("attempt_zero", 0)).toBe(false);
    expect(readPendingCashOrder()?.attemptId).toBe("attempt_zero");
  });

  it("never retires an attempt after the account changes", () => {
    declinedAttempt();
    configureAuthUidSource({ getUid: () => "cust_other", subscribe: () => () => {} });
    expect(retirePriceChangedCashAttempt("attempt_pc", 60_000)).toBe(false);
    // The storage module's uid-change listener already purged the old account's
    // scope; either way, the new account can never retire or replay that row.
    expect(pendingStored()).toBe(false);
  });
});

/** customer-price-confirm-c11 r3 — deterministic in-flight proof, no sleeps. */
describe("r3 — shared-storage in-flight proof", () => {
  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  it("a retry invalidates the old no-write proof until its matching POST resolves", async () => {
    savePendingCashOrder("attempt_pc", "ord_pc", { ...OLD_BASKET, orderId: "ord_pc" } as never);
    expect(markPriceChangedDeclined("attempt_pc", 5_000)).toBe(true);

    const post = deferred<any>();
    const posted = deferred<void>();
    cash.createCashOrderOnServer.mockReset();
    cash.createCashOrderOnServer.mockImplementationOnce(() => {
      posted.resolve();
      return post.promise;
    });
    const repo = new OrderRepository(service as never);
    const pending = repo.createCashOrder({ attemptId: "attempt_pc" });
    await posted.promise;

    // r2: the pre-send marker survives an overlapping retry and is still
    // retireable; r3 must invalidate it until THIS POST resolves.
    expect(retirePriceChangedCashAttempt("attempt_pc", 5_000)).toBe(false);

    service.getOrder.mockResolvedValue(
      ok({
        id: "ord_pc",
        status: { code: "PLACED", label: "Placed", kind: "upcoming", terminal: false },
      } as never),
    );
    post.resolve({
      success: true,
      data: {
        orderId: "ord_pc",
        replayed: false,
        paymentMethod: "cod",
        paymentChannel: "cash",
        cashDuePaise: 5_000,
        totals: {},
        status: { code: "PLACED", label: "Placed", kind: "upcoming", terminal: false },
      },
    } as never);
    const result = await pending;
    expect(result.success).toBe(true);
    expect(service.getOrder).toHaveBeenCalledWith("ord_pc");
    // A verified hydrate clears the confirmed record by design.
    expect(readPendingCashOrder()).toBeNull();
  });

  it("a genuine zero-due attempt is still submitted once and confirmed", async () => {
    liveCart("p1", 1);
    // Hydrate reads this exact id; the shared beforeEach stub returns ord_any.
    service.getOrder.mockImplementation(async (id: string) =>
      ok({ id, status: { code: "PLACED", label: "Placed", kind: "upcoming", terminal: false } }),
    );
    cash.createCashOrderOnServer.mockReset();
    cash.createCashOrderOnServer.mockImplementation(async (request: { orderId: string }) => ({
      success: true,
      data: {
        orderId: request.orderId,
        replayed: false,
        paymentMethod: "cod",
        paymentChannel: "cash",
        cashDuePaise: 0,
        totals: {},
        status: { code: "PLACED", label: "Placed", kind: "upcoming", terminal: false },
      },
    }));
    const result = await new OrderRepository(service as never).createCashOrder({
      zeroDueOnly: true,
    });
    expect(result.success).toBe(true);
    const body = cash.createCashOrderOnServer.mock.calls[0][0] as {
      expectedTotalPaise: number;
      zeroDueOnly?: boolean;
    };
    expect(body.expectedTotalPaise).toBe(0);
    expect(body.zeroDueOnly).toBe(true);
    expect(cash.createCashOrderOnServer).toHaveBeenCalledTimes(1);
    // A verified hydrate clears the confirmed record by design.
    expect(readPendingCashOrder()).toBeNull();
  });
});

/** customer-price-confirm-c11 r4 — uncertain records must stay recoverable. */
describe("r4 — proof-bearing records survive TTL and basket pruning", () => {
  const key = () => scopedStorageKey(PENDING_CASH_ORDER_BASE_KEY, "cust_ttl");
  const ageAndReplaceBasket = () => {
    const raw = JSON.parse(localStorage.getItem(key())!);
    raw.createdAtMs = Date.now() - PENDING_CASH_ORDER_TTL_MS - 5_000;
    raw.basketHash = "a-different-basket";
    localStorage.setItem(key(), JSON.stringify(raw));
  };

  it("a SENT aged attempt is not pruned by a storage read", () => {
    savePendingCashOrder("attempt_sent", "ord_sent", {
      ...OLD_BASKET,
      orderId: "ord_sent",
    } as never);
    expect(
      beginCashSubmit({
        uid: "cust_ttl",
        attemptId: "attempt_sent",
        orderId: "ord_sent",
        expectedTotalPaise: 5_000,
        sessionNonce: "nonce_sent",
      }),
    ).not.toBeNull();
    ageAndReplaceBasket();

    expect(readPendingCashOrder(Date.now(), "a-different-basket")?.attemptId).toBe("attempt_sent");
    expect(readPendingCashOrder()?.orderId).toBe("ord_sent");
  });

  it("an UNSET abandoned attempt still ages out as before", () => {
    savePendingCashOrder("attempt_unsent", "ord_unsent", OLD_BASKET);
    expect(readPendingCashOrder(Date.now() + PENDING_CASH_ORDER_TTL_MS + 1)).toBeNull();
    expect(localStorage.getItem(key())).toBeNull();
  });

  it("a confirmed receipt still survives age and basket changes", () => {
    savePendingCashOrder("attempt_conf", "ord_conf", OLD_BASKET);
    markPendingCashOrderConfirmed("ord_conf");
    ageAndReplaceBasket();
    const record = readPendingCashOrder(Date.now(), "a-different-basket");
    expect(record?.orderId).toBe("ord_conf");
    expect(record?.confirmed).toBe(true);
  });
});

/** customer-price-confirm-c11 r5 slice A — legacy unknown vs explicit unsent. */
describe("r5 — legacy unknown evidence and read-only observation", () => {
  const key = () => scopedStorageKey(PENDING_CASH_ORDER_BASE_KEY, "cust_ttl");
  const ageAndChangeBasket = () => {
    const raw = JSON.parse(localStorage.getItem(key())!);
    raw.createdAtMs = Date.now() - PENDING_CASH_ORDER_TTL_MS - 5_000;
    raw.basketHash = "a-different-basket";
    localStorage.setItem(key(), JSON.stringify(raw));
  };

  it("legacy stored state without reliable sent survives TTL and basket mismatch", () => {
    savePendingCashOrder("attempt_legacy", "ord_legacy", OLD_BASKET);
    const legacy = JSON.parse(localStorage.getItem(key())!);
    delete legacy.sent; // legacy shape: no reliable send knowledge
    localStorage.setItem(key(), JSON.stringify(legacy));
    ageAndChangeBasket();

    expect(readPendingCashOrder(Date.now(), "a-different-basket")?.attemptId).toBe(
      "attempt_legacy",
    );
  });

  it("an explicitly never-sent attempt still ages out", () => {
    savePendingCashOrder("attempt_never", "ord_never", OLD_BASKET);
    const never = JSON.parse(localStorage.getItem(key())!);
    never.sent = false;
    localStorage.setItem(key(), JSON.stringify(never));
    ageAndChangeBasket();
    expect(readPendingCashOrder(Date.now(), "a-different-basket")).toBeNull();
    expect(localStorage.getItem(key())).toBeNull();
  });

  it("confirmed-id observation leaves stored bytes and the legacy key untouched", () => {
    savePendingCashOrder("attempt_obs", "ord_obs", OLD_BASKET);
    markPendingCashOrderConfirmed("ord_obs");
    const legacyKey = scopedStorageKey(["burg", "pendingCashOrder", "v1"].join("."), "cust_ttl");
    localStorage.setItem(legacyKey, JSON.stringify({ orderId: "ord_legacy_only" }));

    const currentBefore = localStorage.getItem(key());
    const legacyBefore = localStorage.getItem(legacyKey);
    expect(peekPendingCashOrder()?.orderId).toBe("ord_obs");
    expect(new OrderRepository(service as never).pendingCashOrderId()).toBe("ord_obs");
    expect(localStorage.getItem(key())).toBe(currentBefore);
    expect(localStorage.getItem(legacyKey)).toBe(legacyBefore);
  });

  it("privacy purge still removes the account's scoped key", () => {
    savePendingCashOrder("attempt_privacy", "ord_privacy", OLD_BASKET);
    expect(localStorage.getItem(key())).not.toBeNull();
    purgeScopedLocalCaches("cust_ttl");
    expect(localStorage.getItem(key())).toBeNull();
    expect(readPendingCashOrder()).toBeNull();
  });
});

/** customer-price-confirm-c11 r5 A4 — defensive stored-attempt binding only. */
describe("r5 A4 — storage-owned prepare", () => {
  const key = () => scopedStorageKey(PENDING_CASH_ORDER_BASE_KEY, "cust_ttl");
  const req = (orderId: string, paise: number) =>
    ({
      orderId,
      storeId: "s1",
      orderType: "takeaway" as const,
      items: [{ productId: "p1", quantity: 1 }],
      expectedTotalPaise: paise,
    }) as never;
  const claim = (paise: number, accepted?: number) => ({
    uid: "cust_ttl",
    attemptId: "a1",
    orderId: "o1",
    expectedTotalPaise: paise,
    ...(accepted !== undefined ? { acceptedTotalPaise: accepted } : {}),
    sessionNonce: "s1",
  });
  const write = (mutate: (raw: Record<string, any>) => void) => {
    const raw = JSON.parse(localStorage.getItem(key())!);
    mutate(raw);
    localStorage.setItem(key(), JSON.stringify(raw));
    return raw;
  };

  it("prepares an accepted total from a genuine matching marker", () => {
    savePendingCashOrder("a1", "o1", req("o1", 11_900));
    const before = write((raw) => {
      raw.sent = true;
      raw.priceChangeDeclined = {
        uid: "cust_ttl",
        attemptId: "a1",
        orderId: "o1",
        acceptedTotalPaise: 60_000,
        generation: raw.generation,
        proven: "fresh",
      };
    });

    const prepared = prepareCashSend(claim(11_900, 60_000));
    expect(prepared?.expectedTotalPaise).toBe(60_000);
    expect(prepared?.unresolved).toBe(false);
    const after = readPendingCashOrder();
    expect(after?.request.expectedTotalPaise).toBe(60_000);
    expect(after?.generation).toBe(before.generation + 1);
    expect(after?.priceChangeDeclined).toBeUndefined();
    expect(after?.activeProof?.expectedTotalPaise).toBe(60_000);
  });

  it("legacy or unproven markers keep the pre-update paise and unresolved", () => {
    savePendingCashOrder("a1", "o1", req("o1", 11_900));
    write((raw) => {
      raw.sent = true;
      raw.priceChangeDeclined = {
        attemptId: "a1",
        acceptedTotalPaise: 60_000,
        generation: raw.generation,
      };
    });
    const prepared = prepareCashSend(claim(11_900, 60_000));
    expect(prepared?.expectedTotalPaise).toBe(11_900);
    expect(prepared?.unresolved).toBe(true);
    expect(readPendingCashOrder()?.request.expectedTotalPaise).toBe(11_900);
  });

  it("another attempt's marker or a stale generation cannot settle the send", () => {
    savePendingCashOrder("a1", "o1", req("o1", 11_900));
    write((raw) => {
      raw.sent = true;
      raw.priceChangeDeclined = {
        attemptId: "other",
        acceptedTotalPaise: 60_000,
        generation: raw.generation,
        proven: "fresh",
      };
    });
    expect(prepareCashSend(claim(11_900, 60_000))?.unresolved).toBe(true);

    write((raw) => {
      raw.priceChangeDeclined = {
        attemptId: "a1",
        acceptedTotalPaise: 60_000,
        generation: raw.generation - 3,
        proven: "fresh",
      };
    });
    expect(prepareCashSend(claim(11_900, 60_000))?.unresolved).toBe(true);
    expect(readPendingCashOrder()?.request.expectedTotalPaise).toBe(11_900);
  });

  it("a missing record or mismatched claimed identity yields no preparation", () => {
    expect(prepareCashSend(claim(11_900))).toBeNull();
    savePendingCashOrder("a1", "o1", req("o1", 11_900));
    expect(prepareCashSend({ ...claim(11_900), attemptId: "other" })).toBeNull();
    expect(prepareCashSend({ ...claim(11_900), orderId: "other" })).toBeNull();
  });

  it("an active earlier proof keeps the new send unresolved", () => {
    savePendingCashOrder("a1", "o1", req("o1", 11_900));
    write((raw) => {
      raw.sent = true;
      raw.activeProof = {
        uid: "cust_ttl",
        attemptId: "a1",
        orderId: "o1",
        expectedTotalPaise: 11_900,
        generation: raw.generation,
        sessionNonce: "earlier",
      };
    });
    expect(prepareCashSend(claim(11_900))?.unresolved).toBe(true);
  });
});

/** customer-price-confirm-c11 r5 A6 — benign saved-record validation only. */
describe("r5 A6 — saved-record validation for trusted no-write", () => {
  const key = () => scopedStorageKey(PENDING_CASH_ORDER_BASE_KEY, "cust_ttl");
  const req = (orderId: string, paise = 11_900) =>
    ({
      orderId,
      storeId: "s1",
      orderType: "takeaway" as const,
      items: [{ productId: "p1", quantity: 1 }],
      expectedTotalPaise: paise,
    }) as never;
  const claim = (accepted?: number) => ({
    uid: "cust_ttl",
    attemptId: "a6",
    orderId: "o6",
    expectedTotalPaise: 11_900,
    ...(accepted !== undefined ? { acceptedTotalPaise: accepted } : {}),
    sessionNonce: "s6",
  });
  const write = (mutate: (raw: Record<string, any>) => void) => {
    const raw = JSON.parse(localStorage.getItem(key())!);
    mutate(raw);
    localStorage.setItem(key(), JSON.stringify(raw));
  };
  const genuineMarker = (raw: Record<string, any>) => {
    raw.sent = true;
    delete raw.activeProof;
    delete raw.unknownEarlierSend;
    raw.priceChangeDeclined = {
      uid: "cust_ttl",
      attemptId: "a6",
      orderId: "o6",
      acceptedTotalPaise: 60_000,
      generation: raw.generation,
      proven: "fresh",
    };
  };

  it("a valid saved record with a genuine marker still supports serial reconfirm", () => {
    savePendingCashOrder("a6", "o6", req("o6"));
    write(genuineMarker);
    const prepared = prepareCashSend(claim(60_000));
    expect(prepared?.expectedTotalPaise).toBe(60_000);
    expect(prepared?.unresolved).toBe(false);
    expect(retirePriceChangedCashAttempt("a6", 60_000)).toBe(false);
    write(genuineMarker);
    expect(retirePriceChangedCashAttempt("a6", 60_000)).toBe(true);
  });

  it("empty identity fields remain unresolved and cannot be retired", () => {
    savePendingCashOrder("a6", "o6", req("o6"));
    write((raw) => {
      genuineMarker(raw);
      raw.uid = "";
    });
    expect(prepareCashSend({ ...claim(60_000), uid: "" })).toBeNull();
    expect(retirePriceChangedCashAttempt("a6", 60_000)).toBe(false);

    write((raw) => {
      raw.uid = "cust_ttl";
      raw.attemptId = "";
    });
    expect(retirePriceChangedCashAttempt("", 60_000)).toBe(false);
  });

  it("malformed generation or amount stays unresolved", () => {
    savePendingCashOrder("a6", "o6", req("o6"));
    write((raw) => {
      genuineMarker(raw);
      raw.generation = "not-a-number";
    });
    expect(prepareCashSend(claim(60_000))).toBeNull();
    expect(retirePriceChangedCashAttempt("a6", 60_000)).toBe(false);

    write((raw) => {
      raw.generation = 1;
      raw.request.expectedTotalPaise = -1;
      raw.priceChangeDeclined.generation = 1;
    });
    const prepared = prepareCashSend({ ...claim(60_000), expectedTotalPaise: -1 });
    expect(prepared === null || prepared.unresolved === true).toBe(true);
    expect(retirePriceChangedCashAttempt("a6", 60_000)).toBe(false);
  });

  it("a zero-due-only saved record cannot carry a trusted marker", () => {
    savePendingCashOrder("a6", "o6", {
      orderId: "o6",
      storeId: "s1",
      orderType: "takeaway",
      items: [{ productId: "p1", quantity: 1 }],
      expectedTotalPaise: 11_900,
      zeroDueOnly: true,
    } as never);
    write(genuineMarker);
    expect(retirePriceChangedCashAttempt("a6", 60_000)).toBe(false);
  });

  it("a request bound to another order is not trusted", () => {
    savePendingCashOrder("a6", "o6", req("different-order"));
    write(genuineMarker);
    expect(retirePriceChangedCashAttempt("a6", 60_000)).toBe(false);
  });

  it("a generation-less legacy record keeps effective 0 but is not trusted proof", () => {
    savePendingCashOrder("a6", "o6", req("o6"));
    write((raw) => {
      genuineMarker(raw);
      delete raw.generation;
    });
    expect(readPendingCashOrder()?.orderId).toBe("o6"); // legacy recovery still works
    expect(retirePriceChangedCashAttempt("a6", 60_000)).toBe(false);
  });
});

/** customer-price-confirm-c11 r5 A7 — benign outbound binding checks. */
describe("r5 A7 — outbound request binding", () => {
  const key = () => scopedStorageKey(PENDING_CASH_ORDER_BASE_KEY, "cust_ttl");
  const req = (orderId: string) =>
    ({
      orderId,
      storeId: "s1",
      orderType: "takeaway" as const,
      items: [{ productId: "p1", quantity: 1 }],
      expectedTotalPaise: 11_900,
    }) as never;
  const claim = () => ({
    uid: "cust_ttl",
    attemptId: "a7",
    orderId: "o7",
    expectedTotalPaise: 11_900,
    sessionNonce: "s7",
  });
  const mutate = (fn: (raw: Record<string, any>) => void) => {
    const raw = JSON.parse(localStorage.getItem(key())!);
    fn(raw);
    localStorage.setItem(key(), JSON.stringify(raw));
  };

  it("rejects an inconsistent saved request before any preparation", () => {
    savePendingCashOrder("a7", "o7", req("another-order"));
    const before = localStorage.getItem(key());
    expect(prepareCashSend(claim())).toBeNull();
    expect(localStorage.getItem(key())).toBe(before);
  });

  it("rejects a present malformed generation without normalising it", () => {
    savePendingCashOrder("a7", "o7", req("o7"));
    mutate((raw) => {
      raw.generation = "malformed";
    });
    const before = localStorage.getItem(key());
    expect(prepareCashSend(claim())).toBeNull();
    expect(localStorage.getItem(key())).toBe(before);
  });

  it("an absent legacy generation stays recoverable but unresolved", () => {
    savePendingCashOrder("a7", "o7", req("o7"));
    mutate((raw) => {
      delete raw.generation;
    });
    const prepared = prepareCashSend(claim());
    expect(prepared?.unresolved).toBe(true);
    expect(prepared?.request).toMatchObject({
      orderId: "o7",
      expectedTotalPaise: 11_900,
    });
    expect(prepared?.proof.expectedTotalPaise).toBe(11_900);
  });

  it("zero-due-only preparation stays at zero", () => {
    savePendingCashOrder("a7", "o7", {
      orderId: "o7",
      storeId: "s1",
      orderType: "takeaway",
      items: [{ productId: "p1", quantity: 1 }],
      expectedTotalPaise: 0,
      zeroDueOnly: true,
    } as never);
    const prepared = prepareCashSend({ ...claim(), expectedTotalPaise: 0 });
    expect(prepared?.request.expectedTotalPaise).toBe(0);
    expect(prepared?.proof.expectedTotalPaise).toBe(0);
  });
});

/** customer-price-confirm-c11 r5 A8 — positive revision domain only. */
describe("r5 A8 — persisted revision domain", () => {
  const key = () => scopedStorageKey(PENDING_CASH_ORDER_BASE_KEY, "cust_ttl");
  const req = (orderId: string, paise = 11_900) =>
    ({
      orderId,
      storeId: "s1",
      orderType: "takeaway" as const,
      items: [{ productId: "p1", quantity: 1 }],
      expectedTotalPaise: paise,
    }) as never;
  const claim = (paise = 11_900) => ({
    uid: "cust_ttl",
    attemptId: "a8",
    orderId: "o8",
    expectedTotalPaise: paise,
    sessionNonce: "s8",
  });
  const mutate = (fn: (raw: Record<string, any>) => void) => {
    const raw = JSON.parse(localStorage.getItem(key())!);
    fn(raw);
    localStorage.setItem(key(), JSON.stringify(raw));
  };

  it("a present zero generation rejects preparation without mutating state", () => {
    savePendingCashOrder("a8", "o8", req("o8"));
    mutate((raw) => {
      raw.generation = 0;
    });
    const before = localStorage.getItem(key());
    expect(prepareCashSend(claim())).toBeNull();
    expect(localStorage.getItem(key())).toBe(before);
  });

  it("a present zero marker generation cannot be trusted for retirement", () => {
    savePendingCashOrder("a8", "o8", req("o8"));
    mutate((raw) => {
      raw.sent = true;
      raw.priceChangeDeclined = {
        uid: "cust_ttl",
        attemptId: "a8",
        orderId: "o8",
        acceptedTotalPaise: 20_000,
        generation: 0,
        proven: "fresh",
      };
    });
    expect(retirePriceChangedCashAttempt("a8", 20_000)).toBe(false);
    expect(readPendingCashOrder()?.orderId).toBe("o8");
  });

  it("a genuinely absent legacy generation is unresolved but recoverable", () => {
    savePendingCashOrder("a8", "o8", req("o8"));
    mutate((raw) => {
      delete raw.generation;
    });
    const prepared = prepareCashSend(claim());
    expect(prepared?.unresolved).toBe(true);
    expect(prepared?.request).toMatchObject({ orderId: "o8", expectedTotalPaise: 11_900 });
    expect(readPendingCashOrder()?.orderId).toBe("o8");
  });

  it("a valid positive revision and true zero paise still prepare", () => {
    savePendingCashOrder("a8", "o8", req("o8"));
    const prepared = prepareCashSend(claim());
    expect(prepared?.unresolved).toBe(false);
    expect(prepared?.proof.generation).toBeGreaterThanOrEqual(2);

    clearPendingCashOrder();
    savePendingCashOrder("a8", "o8", {
      orderId: "o8",
      storeId: "s1",
      orderType: "takeaway",
      items: [{ productId: "p1", quantity: 1 }],
      expectedTotalPaise: 0,
      zeroDueOnly: true,
    } as never);
    const zero = prepareCashSend(claim(0));
    expect(zero?.request.expectedTotalPaise).toBe(0);
    expect(zero?.proof.expectedTotalPaise).toBe(0);
  });
});

/** customer-price-confirm-c11 r5 A9 — completion revision domain only. */
describe("r5 A9 — completion writes", () => {
  const key = () => scopedStorageKey(PENDING_CASH_ORDER_BASE_KEY, "cust_ttl");
  const req = (orderId: string, paise = 11_900) =>
    ({
      orderId,
      storeId: "s1",
      orderType: "takeaway" as const,
      items: [{ productId: "p1", quantity: 1 }],
      expectedTotalPaise: paise,
    }) as never;
  const claim = (paise = 11_900) => ({
    uid: "cust_ttl",
    attemptId: "a9",
    orderId: "o9",
    expectedTotalPaise: paise,
    sessionNonce: "s9",
  });
  const prepare = () => {
    savePendingCashOrder("a9", "o9", req("o9"));
    const prepared = prepareCashSend(claim());
    expect(prepared).not.toBeNull();
    return prepared!;
  };

  it("a present zero stored revision rejects completion without touching bytes", () => {
    const prepared = prepare();
    const raw = JSON.parse(localStorage.getItem(key())!);
    raw.generation = 0;
    localStorage.setItem(key(), JSON.stringify(raw));
    const before = localStorage.getItem(key());
    expect(completeCashSubmit(prepared.proof, { kind: "ambiguous" })).toBe(false);
    expect(localStorage.getItem(key())).toBe(before);
  });

  it("a malformed or stale proof revision rejects completion without touching bytes", () => {
    const prepared = prepare();
    const beforeBad = localStorage.getItem(key());
    expect(
      completeCashSubmit({ ...prepared.proof, generation: "bad" as never }, { kind: "ambiguous" }),
    ).toBe(false);
    expect(localStorage.getItem(key())).toBe(beforeBad);

    const beforeStale = localStorage.getItem(key());
    expect(completeCashSubmit({ ...prepared.proof, generation: 1 }, { kind: "ambiguous" })).toBe(
      false,
    );
    expect(localStorage.getItem(key())).toBe(beforeStale);
  });

  it("a valid positive revision completes exactly", () => {
    const prepared = prepare();
    expect(completeCashSubmit(prepared.proof, { kind: "ambiguous" })).toBe(true);
    const after = readPendingCashOrder();
    expect(after?.generation).toBe(prepared.proof.generation + 1);
    expect(after?.activeProof).toBeUndefined();
  });

  it("an absent legacy revision completes only after unresolved preparation", () => {
    savePendingCashOrder("a9", "o9", req("o9"));
    const raw = JSON.parse(localStorage.getItem(key())!);
    delete raw.generation;
    raw.activeProof = {
      uid: "cust_ttl",
      attemptId: "a9",
      orderId: "o9",
      expectedTotalPaise: 11_900,
      generation: 0,
      sessionNonce: "s9",
    };
    localStorage.setItem(key(), JSON.stringify(raw));
    const legacyProof = {
      uid: "cust_ttl",
      attemptId: "a9",
      orderId: "o9",
      expectedTotalPaise: 11_900,
      generation: 0,
      sessionNonce: "s9",
    };
    const before = localStorage.getItem(key());
    expect(completeCashSubmit(legacyProof, { kind: "ambiguous" })).toBe(false);
    expect(localStorage.getItem(key())).toBe(before);

    const prepared = prepareCashSend(claim());
    expect(prepared?.unresolved).toBe(true);
    expect(completeCashSubmit(prepared!.proof, { kind: "ambiguous" })).toBe(true);
    expect(readPendingCashOrder()?.generation).toBe(prepared!.proof.generation + 1);
  });

  it("true zero paise still completes", () => {
    savePendingCashOrder("a9", "o9", {
      orderId: "o9",
      storeId: "s1",
      orderType: "takeaway",
      items: [{ productId: "p1", quantity: 1 }],
      expectedTotalPaise: 0,
      zeroDueOnly: true,
    } as never);
    const prepared = prepareCashSend(claim(0));
    expect(prepared?.proof.expectedTotalPaise).toBe(0);
    expect(completeCashSubmit(prepared!.proof, { kind: "ambiguous" })).toBe(true);
  });
});

/** customer-price-confirm-c11 r5 A10 — preparation next-revision guard. */
describe("r5 A10 — preparation revision overflow", () => {
  const key = () => scopedStorageKey(PENDING_CASH_ORDER_BASE_KEY, "cust_ttl");
  const claim = () => ({
    uid: "cust_ttl",
    attemptId: "a10",
    orderId: "o10",
    expectedTotalPaise: 11_900,
    sessionNonce: "s10",
  });

  it("a maximum safe stored revision rejects preparation with unchanged bytes", () => {
    savePendingCashOrder("a10", "o10", {
      orderId: "o10",
      storeId: "s1",
      orderType: "takeaway",
      items: [{ productId: "p1", quantity: 1 }],
      expectedTotalPaise: 11_900,
    } as never);
    const raw = JSON.parse(localStorage.getItem(key())!);
    raw.generation = Number.MAX_SAFE_INTEGER;
    localStorage.setItem(key(), JSON.stringify(raw));
    const before = localStorage.getItem(key());
    expect(prepareCashSend(claim())).toBeNull();
    expect(localStorage.getItem(key())).toBe(before);
  });
});
