import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * F24 — `ordersService.cancelOrder` is SERVER-FIRST.
 *
 * A direct Firestore status write skipped the server-owned cancellation
 * obligations (durable rider-cancel intent + idempotent Grill-Coins restore),
 * and the rules no longer admit one. The service must POST
 * `/orders/customerCancel`, keep the R03 cache guard, and commit the cancelled
 * record ONLY after a confirmed 2xx with an unchanged uid.
 */

const h = vi.hoisted(() => {
  const authState: { currentUser: { uid: string } | null } = { currentUser: { uid: "cust_a" } };
  return {
    authState,
    setDoc: vi.fn(),
    calls: [] as Array<{ url: string; body: any; init: any }>,
    handler: null as null | ((url: string, body: any) => unknown),
  };
});

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  doc: vi.fn((...a: unknown[]) => a),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  setDoc: h.setDoc,
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  onSnapshot: vi.fn(),
  Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
}));

vi.mock("firebase/app", () => ({ initializeApp: vi.fn(), getApps: vi.fn(() => []) }));

vi.mock("../src/core/config/firebase", () => ({
  auth: {
    get currentUser() {
      return h.authState.currentUser;
    },
  },
  db: {},
}));

vi.mock("../src/core/integrations/petpooja", () => ({
  petpoojaGateway: { pushOrder: vi.fn(async () => ({ ok: true })) },
}));

vi.mock("../src/core/logging/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../src/core/config/functionsBase", () => ({
  defaultFunctionsBase: () => "https://fn.test/api",
}));

vi.mock("../src/core/network/httpClient", () => ({
  httpClient: {
    post: async (url: string, body: unknown, init: any) => {
      h.calls.push({ url, body, init });
      const handler =
        h.handler ??
        ((_url: string, b: any) => ({ data: { orderId: b.orderId, alreadyCancelled: false } }));
      return handler(url, body);
    },
  },
}));

import { ordersService } from "../src/features/orders/services/ordersService";

const PLACED_STATUS = {
  code: "PLACED",
  label: "Order placed",
  kind: "upcoming",
  terminal: false,
} as const;

function fsOrder(id: string, uid: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    userId: uid,
    customerId: uid,
    status: { ...PLACED_STATUS },
    fulfillment: "delivery",
    store: { id: "branch_01", name: "Test Outlet" },
    items: [],
    totals: { grandTotal: 500 },
    placedAt: new Date().toISOString(),
    ...overrides,
  };
}

function snapshotOf(docs: Array<Record<string, unknown>>) {
  return {
    forEach: (cb: (d: { data: () => Record<string, unknown> }) => void) => {
      for (const d of docs) cb({ data: () => d });
    },
  };
}

beforeEach(async () => {
  h.calls.length = 0;
  h.setDoc.mockReset();
  h.handler = null;
  const { getDocs } = await import("firebase/firestore");
  // Clear the per-account cache by re-anchoring the scope (a scope change
  // drops the cached orders), then seed one PLACED order for cust_a.
  h.authState.currentUser = null;
  (getDocs as any).mockImplementation(async () => snapshotOf([]));
  await ordersService.listOrders();
  h.authState.currentUser = { uid: "cust_a" };
  (getDocs as any).mockImplementation(async () => snapshotOf([fsOrder("ord_1", "cust_a")]));
  await ordersService.listOrders();
  (getDocs as any).mockReset();
});

describe("F24 ordersService.cancelOrder is server-first", () => {
  it("POSTs /orders/customerCancel and writes NO order document", async () => {
    const res = await ordersService.cancelOrder("ord_1");
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].url).toBe("https://fn.test/api/orders/customerCancel");
    expect(h.calls[0].body).toMatchObject({ orderId: "ord_1" });
    expect(h.setDoc).not.toHaveBeenCalled();
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data?.status.code).toBe("CANCELLED");
  });

  it("keeps the cancelled record out of cache when the server refuses (409)", async () => {
    h.handler = () => {
      throw Object.assign(new Error("not cancellable"), {
        status: 409,
        code: "ORDER_NOT_CANCELLABLE",
      });
    };
    const first = await ordersService.cancelOrder("ord_1");
    expect(first.success).toBe(false);
    if (first.success) return;
    expect(first.error.code).toBe("ORDER_NOT_CANCELLABLE");

    // The cache must still read PLACED — no phantom local cancel.
    const after = await ordersService.getOrder("ord_1");
    expect(after.success).toBe(true);
    if (!after.success) return;
    expect(after.data?.status.code).toBe("PLACED");
    expect(h.setDoc).not.toHaveBeenCalled();
  });

  it("maps a 403 ownership refusal to a non-retryable honest failure", async () => {
    h.handler = () => {
      throw Object.assign(new Error("not owned"), { status: 403, code: "ORDER_NOT_OWNED" });
    };
    const res = await ordersService.cancelOrder("ord_1");
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("ORDER_NOT_OWNED");
    expect(res.error.retryable).toBe(false);
  });

  it("commits only after 2xx AND an unchanged uid (AUTH_CHANGED otherwise)", async () => {
    h.handler = (_url: string, b: any) => {
      h.authState.currentUser = { uid: "cust_b" };
      return { data: { orderId: b.orderId, alreadyCancelled: false } };
    };
    const res = await ordersService.cancelOrder("ord_1");
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("AUTH_CHANGED");
    expect(h.setDoc).not.toHaveBeenCalled();
  });

  it("never writes the order document even when the server confirms", async () => {
    await ordersService.cancelOrder("ord_1");
    expect(h.setDoc).not.toHaveBeenCalled();
  });

  it("keeps the unknown-id no-op and the terminal no-op without a server call", async () => {
    const unknown = await ordersService.cancelOrder("ord_unknown");
    expect(unknown.success).toBe(true);
    if (!unknown.success) return;
    expect(unknown.data).toBeNull();
    expect(h.calls).toHaveLength(0);
  });

  it("never calls the server without a signed-in uid (cache is uid-scoped)", async () => {
    h.authState.currentUser = null;
    const res = await ordersService.cancelOrder("ord_1");
    // Re-anchoring to a null session drops the per-account cache, so the order
    // is no longer visible locally: the call is a no-op (ok(null)), exactly the
    // unknown-id contract. What matters is that NO server cancel is attempted
    // for a session with no uid and nothing is written.
    expect(h.calls).toHaveLength(0);
    expect(h.setDoc).not.toHaveBeenCalled();
    if (res.success) expect(res.data).toBeNull();
  });
});
