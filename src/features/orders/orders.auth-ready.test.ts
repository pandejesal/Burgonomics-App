/**
 * Live incident (build 75cf5f4): a signed-in customer opening /orders (or a
 * tracking deep link) on a fresh page saw "No Orders Found" / "Order not found"
 * because the read ran before Firebase Auth finished restoring the persisted
 * session. The same query, run moments later from the page, returned 12 orders.
 *
 * A read that failed or never ran must never be presented as "you have no
 * orders" / "this order does not exist".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const fixture = vi.hoisted(() => ({
  currentUser: null as null | { uid: string },
  ready: null as null | Promise<void>,
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  queryCalls: [] as any[],
}));

vi.mock("@/core/config/firebase", () => ({
  auth: {
    get currentUser() {
      return fixture.currentUser;
    },
    authStateReady: () => (fixture.ready ?? Promise.resolve()),
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

import { ordersService } from "@/features/orders/services/ordersService";

const ORDER = {
  id: "ord_live_1",
  shortCode: "BG-LIVE1",
  status: { code: "PLACED", label: "Order placed", kind: "upcoming", terminal: false },
  fulfillment: "takeaway",
  store: { id: "demo", name: "DEMO", address: "", area: "", city: "", phone: "" },
  items: [],
  totals: { subtotal: 10, taxes: 0.48, packingFee: 0, deliveryFee: 0, promoDiscount: 0, grandTotal: 10 },
  placedAt: "2026-11-01T09:42:57.472Z",
  userId: "uid_live",
  customerId: "uid_live",
  payment: { method: "online", label: "Pay Online", status: "pending" },
};

function snapshot(docs: Array<Record<string, unknown>>) {
  return {
    size: docs.length,
    empty: docs.length === 0,
    docs: docs.map((data) => ({ id: String(data.id), data: () => data })),
    forEach: (cb: (d: { id: string; data: () => unknown }) => void) =>
      docs.forEach((data) => cb({ id: String(data.id), data: () => data })),
  };
}

beforeEach(() => {
  fixture.currentUser = null;
  fixture.ready = null;
  fixture.queryCalls = [];
  fixture.getDocs.mockReset();
  fixture.getDoc.mockReset();
});

describe("ordersService waits for the persisted auth session before reading", () => {
  it("listOrders fetches the signed-in customer's orders once auth is ready", async () => {
    let releaseAuth!: () => void;
    fixture.ready = new Promise<void>((resolve) => {
      releaseAuth = () => {
        fixture.currentUser = { uid: "uid_live" };
        resolve();
      };
    });
    fixture.getDocs.mockResolvedValue(snapshot([ORDER]));

    let settled = false;
    const pending = ordersService.listOrders({ bucket: "ongoing" }).then((r) => {
      settled = true;
      return r;
    });
    // Auth has not restored yet: the read must WAIT, not answer "empty".
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settled).toBe(false);
    expect(fixture.getDocs).not.toHaveBeenCalled();
    releaseAuth();
    const res = await pending;

    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.items.map((o) => o.id)).toContain("ord_live_1");
    }
    expect(fixture.getDocs).toHaveBeenCalledTimes(1);
    const constraint = fixture.queryCalls[0][0] as any;
    expect(constraint).toMatchObject({ field: "userId", value: "uid_live" });
  });

  it("getOrder waits for auth too, so a deep link is not reported as missing", async () => {
    let releaseAuth!: () => void;
    fixture.ready = new Promise<void>((resolve) => {
      releaseAuth = () => {
        fixture.currentUser = { uid: "uid_live" };
        resolve();
      };
    });
    fixture.getDoc.mockResolvedValue({
      exists: () => true,
      id: ORDER.id,
      data: () => ORDER,
    });

    let settled = false;
    const pending = ordersService.getOrder("ord_live_1").then((r) => {
      settled = true;
      return r;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settled).toBe(false);
    expect(fixture.getDoc).not.toHaveBeenCalled();
    releaseAuth();
    const res = await pending;

    expect(res.success).toBe(true);
    if (res.success) expect(res.data?.id).toBe("ord_live_1");
  });

  it("listOrders reports a failed read instead of pretending there are no orders", async () => {
    // Distinct uid: the service caches a successful history fetch per account.
    fixture.currentUser = { uid: "uid_read_failure" };
    fixture.getDocs.mockRejectedValue(
      Object.assign(new Error("Missing or insufficient permissions."), {
        code: "permission-denied",
      })
    );

    const res = await ordersService.listOrders({ bucket: "ongoing" });

    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe("ORDERS_READ_FAILED");
  });

  it("getOrder reports a failed read instead of 'order not found'", async () => {
    fixture.currentUser = { uid: "uid_live" };
    fixture.getDoc.mockRejectedValue(
      Object.assign(new Error("Missing or insufficient permissions."), {
        code: "permission-denied",
      })
    );

    const res = await ordersService.getOrder("ord_missing");

    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe("ORDER_READ_FAILED");
  });
});
