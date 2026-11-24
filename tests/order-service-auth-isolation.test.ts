import { describe, it, expect, vi, beforeEach } from "vitest";

/** R03: read/cancel caches remain per-account; order birth is server-only. */
const { mockSetDoc, mockGetDoc, mockGetDocs, mockQuery, mockWhere, authState, httpClientPost } =
  vi.hoisted(() => {
    const authState: { currentUser: { uid: string } | null } = { currentUser: null };
    return {
      authState,
      httpClientPost: vi.fn(async () => ({ data: {} })),
      mockSetDoc: vi.fn(),
      mockGetDoc: vi.fn(),
      mockGetDocs: vi.fn(),
      mockQuery: vi.fn((...args: unknown[]) => args),
      mockWhere: vi.fn((...args: unknown[]) => args),
    };
  });
vi.mock("firebase/firestore", () => ({
  collection: vi.fn((...args: unknown[]) => args),
  doc: vi.fn((...args: unknown[]) => args),
  getDoc: mockGetDoc,
  getDocs: mockGetDocs,
  query: mockQuery,
  where: mockWhere,
  orderBy: vi.fn(),
  limit: vi.fn(),
  setDoc: mockSetDoc,
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  onSnapshot: vi.fn(),
  Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
}));
vi.mock("firebase/app", () => ({ initializeApp: vi.fn(), getApps: vi.fn(() => []) }));
vi.mock("../src/core/config/firebase", () => ({
  auth: {
    get currentUser() {
      return authState.currentUser;
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
vi.mock("../src/core/network/httpClient", () => ({ httpClient: { post: httpClientPost } }));

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
      for (const doc of docs) cb({ data: () => doc });
    },
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mockSetDoc.mockReset().mockResolvedValue(undefined);
  mockGetDoc.mockReset();
  mockGetDocs.mockReset();
  authState.currentUser = { uid: "cust_a" };
});

describe("account switch drops the previous account's read caches", () => {
  it("listOrders never serves A's cached orders to B and refetches scoped to B", async () => {
    mockGetDocs.mockResolvedValueOnce(snapshotOf([fsOrder("ord_a1", "cust_a")]));
    const first = await ordersService.listOrders();
    expect(first.success).toBe(true);
    if (first.success) expect(first.data.items.map((o) => o.id)).toEqual(["ord_a1"]);
    expect(mockWhere).toHaveBeenLastCalledWith("userId", "==", "cust_a");

    authState.currentUser = { uid: "cust_b" };
    mockGetDocs.mockResolvedValueOnce(snapshotOf([fsOrder("ord_b1", "cust_b")]));
    const second = await ordersService.listOrders();
    expect(second.success).toBe(true);
    if (!second.success) return;
    expect(second.data.items.map((o) => o.id)).toEqual(["ord_b1"]);
    expect(mockGetDocs).toHaveBeenCalledTimes(2);
    expect(mockWhere).toHaveBeenLastCalledWith("userId", "==", "cust_b");
  });

  it("getOrder fails safe instead of serving A's cached order to B", async () => {
    mockGetDocs.mockResolvedValueOnce(snapshotOf([fsOrder("ord_a1", "cust_a")]));
    const seeded = await ordersService.listOrders();
    expect(seeded.success, "A's order cache must be seeded before switching accounts").toBe(true);
    expect(seeded).toMatchObject({ data: { items: [{ id: "ord_a1" }] } });
    authState.currentUser = { uid: "cust_b" };
    mockGetDoc.mockRejectedValueOnce(new Error("permission-denied"));
    const result = await ordersService.getOrder("ord_a1");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("ORDER_READ_FAILED");
  });

  it("getTracking fails safe for B on A's order id", async () => {
    mockGetDocs.mockResolvedValueOnce(
      snapshotOf([
        fsOrder("ord_a1", "cust_a", {
          estimatedAt: new Date(Date.now() + 35 * 60_000).toISOString(),
        }),
      ]),
    );
    const seeded = await ordersService.listOrders();
    expect(seeded.success, "A's tracking cache must be seeded before switching accounts").toBe(
      true,
    );
    expect(seeded).toMatchObject({ data: { items: [{ id: "ord_a1" }] } });
    authState.currentUser = { uid: "cust_b" };
    mockGetDoc.mockRejectedValue(new Error("permission-denied"));
    const result = await ordersService.getTracking("ord_a1");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBeNull();
  });
});

describe("late in-flight history fetch across an auth change", () => {
  it("discards A's snapshot that resolves after switching to B, then refetches for B", async () => {
    let resolveA!: (value: unknown) => void;
    mockGetDocs.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveA = resolve;
        }),
    );
    const pending = ordersService.listOrders();
    await vi.waitFor(() => expect(mockGetDocs).toHaveBeenCalledTimes(1));
    expect(mockWhere).toHaveBeenLastCalledWith("userId", "==", "cust_a");
    authState.currentUser = { uid: "cust_b" };
    resolveA(snapshotOf([fsOrder("ord_a1", "cust_a")]));
    const stale = await pending;
    expect(stale.success).toBe(true);
    if (stale.success) expect(stale.data.items).toHaveLength(0);
    mockGetDocs.mockResolvedValueOnce(snapshotOf([fsOrder("ord_b1", "cust_b")]));
    const fresh = await ordersService.listOrders();
    expect(fresh.success).toBe(true);
    if (fresh.success) expect(fresh.data.items.map((o) => o.id)).toEqual(["ord_b1"]);
    expect(mockWhere).toHaveBeenLastCalledWith("userId", "==", "cust_b");
  });
});

describe("cancellation never reports false success or writes client state", () => {
  async function seedOrderFor(uid: string): Promise<string> {
    authState.currentUser = { uid };
    const id = `ord_cancel_${uid}`;
    mockGetDocs.mockResolvedValueOnce(snapshotOf([fsOrder(id, uid)]));
    const seeded = await ordersService.listOrders();
    expect(seeded.success).toBe(true);
    return id;
  }

  it("returns an honest failure and leaves the order uncancelled when the server refuses", async () => {
    const orderId = await seedOrderFor("cust_a");
    httpClientPost.mockRejectedValueOnce(
      Object.assign(new Error("not cancellable"), { status: 409, code: "ORDER_NOT_CANCELLABLE" }),
    );
    const cancelled = await ordersService.cancelOrder(orderId);
    expect(cancelled.success).toBe(false);
    if (!cancelled.success) expect(cancelled.error.code).toBe("ORDER_NOT_CANCELLABLE");
    const after = await ordersService.getOrder(orderId);
    expect(after.success).toBe(true);
    if (after.success) expect(after.data?.status.code).toBe("PLACED");
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it("commits the cancelled state only when the server confirms", async () => {
    const orderId = await seedOrderFor("cust_a");
    httpClientPost.mockResolvedValueOnce({ data: { orderId, alreadyCancelled: false } });
    const cancelled = await ordersService.cancelOrder(orderId);
    expect(cancelled.success).toBe(true);
    if (cancelled.success)
      expect(cancelled.data?.status).toMatchObject({ code: "CANCELLED", terminal: true });
    expect(httpClientPost).toHaveBeenLastCalledWith(
      "https://fn.test/api/orders/customerCancel",
      { orderId },
      expect.anything(),
    );
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it("keeps the terminal-order no-op without another request or write", async () => {
    const orderId = await seedOrderFor("cust_a");
    httpClientPost.mockResolvedValueOnce({ data: { orderId, alreadyCancelled: false } });
    await ordersService.cancelOrder(orderId);
    const requests = httpClientPost.mock.calls.length;
    const second = await ordersService.cancelOrder(orderId);
    expect(second.success).toBe(true);
    if (second.success) expect(second.data?.status.code).toBe("CANCELLED");
    expect(httpClientPost).toHaveBeenCalledTimes(requests);
    expect(mockSetDoc).not.toHaveBeenCalled();
  });
});
