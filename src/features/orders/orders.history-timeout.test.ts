/**
 * A6-c11 item 4 (Medium): a fixed 1.5 s cap on the WHOLE order history reported
 * "we couldn't load your orders".
 *
 * One unbounded `getDocs` was raced against `setTimeout(1500)`. On 3G / a cold
 * cache / 30+ past orders the query legitimately takes 2–4 s, the timer won, and
 * the screen showed a hard error with a Retry that failed the same way — while
 * the rest of the app worked.
 *
 * The fix: a bound with room for a real slow read, and a failed/timed-out read
 * DEGRADES to this account's session cache (a non-blocking "couldn't refresh")
 * instead of presenting an empty-error state.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const fixture = vi.hoisted(() => ({
  currentUser: null as null | { uid: string },
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  queryCalls: [] as any[],
}));

vi.mock("@/core/config/firebase", () => ({
  auth: {
    get currentUser() {
      return fixture.currentUser;
    },
    authStateReady: () => Promise.resolve(),
  },
  db: { kind: "db" },
}));

vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  doc: (_db: unknown, path: string, id: string) => ({ path, id }),
  query: (ref: unknown, ...constraints: unknown[]) => {
    fixture.queryCalls.push(constraints);
    return { ref, constraints };
  },
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  getDocs: (q: unknown) => fixture.getDocs(q),
  getDoc: (ref: unknown) => fixture.getDoc(ref),
}));

vi.mock("@/core/logging/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/core/integrations/petpooja", () => ({
  petpoojaGateway: { pushOrder: vi.fn(async () => ({ ok: true })) },
}));
vi.mock("@/core/config/functionsBase", () => ({
  defaultFunctionsBase: () => "https://fn.test/api",
}));
vi.mock("@/core/network/httpClient", () => ({
  httpClient: { post: vi.fn(async () => ({ data: {} })) },
}));

import { ordersService, HISTORY_READ_TIMEOUT_MS } from "@/features/orders/services/ordersService";

const order = (id: string, uid: string) => ({
  id,
  userId: uid,
  customerId: uid,
  shortCode: id.toUpperCase(),
  status: { code: "PLACED", label: "Order placed", kind: "upcoming", terminal: false },
  fulfillment: "takeaway",
  store: { id: "s1", name: "Outlet", address: "", area: "", city: "", phone: "" },
  items: [],
  totals: {
    subtotal: 100,
    taxes: 5,
    packingFee: 0,
    deliveryFee: 0,
    promoDiscount: 0,
    grandTotal: 105,
  },
  placedAt: "2026-11-01T09:42:57.472Z",
  payment: { method: "online", label: "Pay Online", status: "pending" },
});

const snapshot = (docs: Array<Record<string, unknown>>) => ({
  size: docs.length,
  empty: docs.length === 0,
  docs: docs.map((d) => ({ id: String(d.id), data: () => d })),
  forEach: (cb: (d: { id: string; data: () => unknown }) => void) =>
    docs.forEach((d) => cb({ id: String(d.id), data: () => d })),
});

beforeEach(() => {
  fixture.currentUser = null;
  fixture.queryCalls = [];
  fixture.getDocs.mockReset();
  fixture.getDoc.mockReset();
});

describe("order history read bound (A6-c11 item 4)", () => {
  it("allows a legitimately slow history read (well beyond 1.5 s)", async () => {
    // 4 s is a realistic cold-cache read on the network this app ships to.
    expect(HISTORY_READ_TIMEOUT_MS).toBeGreaterThanOrEqual(8_000);
  });

  it("serves the cached rows with a degradation flag when the read fails", async () => {
    // Real spine: the customer JUST placed an order (it is in the session map),
    // then opens Orders on 3G and the history read times out. Pre-fix that was a
    // hard "couldn't load your orders" with the fresh order nowhere in sight.
    fixture.currentUser = { uid: "uid_degrade" };
    fixture.getDoc.mockResolvedValue({
      exists: () => true,
      id: "ord_just_placed",
      data: () => order("ord_just_placed", "uid_degrade"),
    });
    const seeded = await ordersService.getOrder("ord_just_placed");
    expect(seeded.success).toBe(true);

    fixture.getDocs.mockRejectedValueOnce(new Error("Firestore timeout"));
    const res = await ordersService.listOrders({});

    expect(res.success).toBe(true);
    if (res.success) {
      // Still the rows the customer can see — never an empty-error screen.
      expect(res.data.items.map((o) => o.id)).toEqual(["ord_just_placed"]);
      // …but the screen must say it could not refresh.
      expect(res.data.degraded).toBe(true);
    }
  });

  it("still reports a real failure when there is nothing cached to show", async () => {
    fixture.currentUser = { uid: "uid_cold_failure" };
    fixture.getDocs.mockRejectedValue(
      Object.assign(new Error("Missing or insufficient permissions."), {
        code: "permission-denied",
      }),
    );

    const res = await ordersService.listOrders({ bucket: "ongoing" });

    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe("ORDERS_READ_FAILED");
  });
});
