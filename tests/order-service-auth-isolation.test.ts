import { describe, it, expect, vi, beforeEach } from "vitest";

// R03 — ordersService auth isolation.
//
// The module-level caches (`orders`, `progression`, `historyFetchedFor`,
// `failedPersist`) are a PER-ACCOUNT session cache. These tests pin three
// repair behaviours hermetically (all Firebase surfaces mocked, no network):
//
//   A. Logout / account switch: B never sees A's cached orders, timeline or
//      failed-persist retry id; cached reads fail safe and refetch scoped
//      to the new uid.
//   B. A history fetch that resolves AFTER the account changed is discarded
//      — never merged into the new account's cache.
//   C. A failed cancellation persist returns an honest failure and does NOT
//      commit the cancelled record into the cache.
//
// Plus the R19 F-R19-3 follow-up: an auth switch in createOrder's remaining
// post-write yield must fail AUTH_CHANGED, never return ok() to the session
// that replaced the placing account.

const {
  mockSetDoc,
  mockGetDoc,
  mockGetDocs,
  mockDoc,
  mockCollection,
  mockQuery,
  mockWhere,
  authState,
} = vi.hoisted(() => {
  const authState: { currentUser: { uid: string } | null } = { currentUser: null };
  return {
    authState,
    mockSetDoc: vi.fn(),
    mockGetDoc: vi.fn(),
    mockGetDocs: vi.fn(),
    mockDoc: vi.fn((...args: unknown[]) => args),
    mockCollection: vi.fn((...args: unknown[]) => args),
    mockQuery: vi.fn((...args: unknown[]) => args),
    mockWhere: vi.fn((...args: unknown[]) => args),
  };
});

vi.mock("firebase/firestore", () => ({
  collection: mockCollection,
  doc: mockDoc,
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

vi.mock("firebase/app", () => ({
  initializeApp: vi.fn(),
  getApps: vi.fn(() => []),
}));

// Live auth state: the getter reads the CURRENT value at call time so tests
// can switch accounts between service calls.
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

import { ordersService } from "../src/features/orders/services/ordersService";

// -- Hermetic fixtures ------------------------------------------------

const PLACED_STATUS = {
  code: "PLACED",
  label: "Order placed",
  kind: "upcoming",
  terminal: false,
} as const;

/** A Firestore-shaped order doc. placedAt ≈ now keeps the DEV ticker idle. */
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

/** getDocs()-shaped snapshot over plain docs. */
function snapshotOf(docs: Array<Record<string, unknown>>) {
  return {
    forEach: (cb: (d: { data: () => Record<string, unknown> }) => void) => {
      for (const d of docs) cb({ data: () => d });
    },
  };
}

/** Identical checkout fingerprint across accounts on purpose (R03 A3). */
const checkoutInput = () =>
  ({
    store: { id: "branch_01", name: "Test Outlet" },
    fulfillment: "delivery",
    items: [{ productId: "p1", name: "Burger", quantity: 1, unitPrice: 250 }],
    totals: { grandTotal: 250 },
    payment: { method: "online", label: "Pay Online", status: "pending" },
  }) as any;

beforeEach(() => {
  vi.clearAllMocks();
  mockSetDoc.mockReset().mockResolvedValue(undefined);
  mockGetDoc.mockReset();
  mockGetDocs.mockReset();
  authState.currentUser = { uid: "cust_a" };
});

// -- A. account switch -----------------------------------------------

describe("A. account switch drops the previous account's caches", () => {
  it("listOrders never serves A's cached orders to B and refetches scoped to B", async () => {
    mockGetDocs.mockResolvedValueOnce(snapshotOf([fsOrder("ord_a1", "cust_a")]));
    const first = await ordersService.listOrders();
    expect(first.success).toBe(true);
    if (!first.success) return;
    expect(first.data.items.map((o) => o.id)).toEqual(["ord_a1"]);
    expect(mockWhere).toHaveBeenLastCalledWith("userId", "==", "cust_a");

    // Logout A, login B — no page reload.
    authState.currentUser = { uid: "cust_b" };
    mockGetDocs.mockResolvedValueOnce(snapshotOf([fsOrder("ord_b1", "cust_b")]));
    const second = await ordersService.listOrders();
    expect(second.success).toBe(true);
    if (!second.success) return;

    const ids = second.data.items.map((o) => o.id);
    expect(ids).toContain("ord_b1");
    expect(ids).not.toContain("ord_a1");
    // B's history was actually fetched (the marker was not poisoned by A).
    expect(mockGetDocs).toHaveBeenCalledTimes(2);
    expect(mockWhere).toHaveBeenLastCalledWith("userId", "==", "cust_b");
  });

  it("getOrder fails safe: A's cached order reads as not-found for B", async () => {
    mockGetDocs.mockResolvedValueOnce(snapshotOf([fsOrder("ord_a1", "cust_a")]));
    const seeded = await ordersService.listOrders();
    expect(seeded.success).toBe(true);

    authState.currentUser = { uid: "cust_b" };
    // B's raw-id fetch for A's order is denied server-side.
    mockGetDoc.mockRejectedValueOnce(new Error("permission-denied"));

    const res = await ordersService.getOrder("ord_a1");
    expect(res.success).toBe(true);
    if (!res.success) return;
    // Old behaviour returned A's cached record here — the leak R03 closes.
    expect(res.data).toBeNull();
  });

  it("getTracking fails safe for B on A's order id (orders + progression dropped)", async () => {
    mockGetDocs.mockResolvedValueOnce(
      snapshotOf([
        fsOrder("ord_a1", "cust_a", {
          estimatedAt: new Date(Date.now() + 35 * 60_000).toISOString(),
        }),
      ]),
    );
    const seeded = await ordersService.listOrders();
    expect(seeded.success).toBe(true);

    authState.currentUser = { uid: "cust_b" };
    mockGetDoc.mockRejectedValue(new Error("permission-denied")); // both refresh + load attempts

    const res = await ordersService.getTracking("ord_a1");
    expect(res.success).toBe(true);
    if (!res.success) return;
    // Old behaviour built a tracking snapshot from A's cached order +
    // progression timeline and served it to B.
    expect(res.data).toBeNull();
  });

  it("a failed-persist retry id from A is not reused by B's identical checkout", async () => {
    mockSetDoc.mockRejectedValueOnce(new Error("offline"));
    const failedA = await ordersService.createOrder(checkoutInput());
    expect(failedA.success).toBe(false);
    if (failedA.success) return;
    expect(failedA.error.code).toBe("PERSIST_FAILED");
    const aDocId = mockDoc.mock.calls[0]?.[2] as string;
    expect(aDocId).toBeTruthy();

    authState.currentUser = { uid: "cust_b" };
    mockSetDoc.mockResolvedValue(undefined);
    const okB = await ordersService.createOrder(checkoutInput()); // same fingerprint
    expect(okB.success).toBe(true);
    if (!okB.success) return;

    // B must NOT inherit A's retry id (old code reused it across accounts).
    expect(okB.data.id).not.toBe(aDocId);
    // And B's doc carries B's ownership fields.
    const payload = mockSetDoc.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(payload.userId).toBe("cust_b");
    expect(payload.customerId).toBe("cust_b");
  });
});

// -- B. late in-flight fetch ------------------------------------------

describe("B. late in-flight history fetch across an auth change", () => {
  it("discards A's snapshot that resolves after switching to B, then refetches for B", async () => {
    let resolveA!: (v: unknown) => void;
    // Lazily constructed so `resolveA` is bound when the service CALLS
    // getDocs — i.e. when A's fetch is genuinely in flight.
    mockGetDocs.mockImplementationOnce(() => new Promise((r) => (resolveA = r)));

    const pending = ordersService.listOrders();
    // Let the call reach its in-flight Firestore fetch under A's uid.
    await vi.waitFor(() => expect(mockGetDocs).toHaveBeenCalledTimes(1));
    expect(mockWhere).toHaveBeenLastCalledWith("userId", "==", "cust_a");

    // Account switches while A's history fetch is still in flight.
    authState.currentUser = { uid: "cust_b" };

    // A's snapshot lands late.
    resolveA(snapshotOf([fsOrder("ord_a1", "cust_a")]));
    const resA = await pending;
    expect(resA.success).toBe(true);
    if (!resA.success) return;
    // The stale snapshot must be discarded, not served or cached for B.
    expect(resA.data.items).toHaveLength(0);

    // B's next call refetches under B's uid and sees only B's orders.
    mockGetDocs.mockResolvedValueOnce(snapshotOf([fsOrder("ord_b1", "cust_b")]));
    const resB = await ordersService.listOrders();
    expect(resB.success).toBe(true);
    if (!resB.success) return;
    expect(resB.data.items.map((o) => o.id)).toEqual(["ord_b1"]);
    expect(mockWhere).toHaveBeenLastCalledWith("userId", "==", "cust_b");
  });

  it("post-write auth switch: createOrder fails AUTH_CHANGED instead of returning ok to the new session (R19 F-R19-3)", async () => {
    authState.currentUser = { uid: "cust_a" };
    // The write completes for A, then the session switches to B before
    // createOrder's remaining post-write yield evaluates scopeStillOurs —
    // persistError is null, the exact window R19 flagged.
    mockSetDoc.mockImplementationOnce(async () => {
      authState.currentUser = { uid: "cust_b" };
      return undefined;
    });

    const res = await ordersService.createOrder(checkoutInput());
    // No ok(): the repository must never upsert A's order into B's store.
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("AUTH_CHANGED");

    // The landed doc is attributed to A — never re-attributed to B.
    const payload = mockSetDoc.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(payload.userId).toBe("cust_a");
    expect(payload.customerId).toBe("cust_a");
    const landedId = mockDoc.mock.calls.at(-1)?.[2] as string;

    // B's cache never received it: raw-id read fails safe as not-found.
    mockGetDoc.mockRejectedValueOnce(new Error("permission-denied"));
    const forB = await ordersService.getOrder(landedId);
    expect(forB.success).toBe(true);
    if (!forB.success) return;
    expect(forB.data).toBeNull();

    // And B's identical-fingerprint checkout mints a fresh id — no leak of
    // A's landed order id into B's create path.
    mockSetDoc.mockResolvedValue(undefined);
    const retryB = await ordersService.createOrder(checkoutInput());
    expect(retryB.success).toBe(true);
    if (!retryB.success) return;
    expect(retryB.data.id).not.toBe(landedId);
  });
});

// -- C. cancellation honesty ------------------------------------------

describe("C. cancellation never reports false success", () => {
  async function createOrderFor(uid: string): Promise<string> {
    authState.currentUser = { uid };
    mockSetDoc.mockResolvedValueOnce(undefined);
    const created = await ordersService.createOrder(checkoutInput());
    expect(created.success).toBe(true);
    if (!created.success) throw new Error("setup failed");
    return created.data.id;
  }

  it("returns CANCEL_PERSIST_FAILED and leaves the order uncancelled in cache when the write fails", async () => {
    const orderId = await createOrderFor("cust_a");

    mockSetDoc.mockRejectedValueOnce(new Error("permission-denied"));
    const cancelled = await ordersService.cancelOrder(orderId);
    expect(cancelled.success).toBe(false);
    if (cancelled.success) return;
    expect(cancelled.error.code).toBe("CANCEL_PERSIST_FAILED");
    expect(cancelled.error.retryable).toBe(true);

    // The cache must NOT hold the cancelled state: the server still says
    // PLACED, and the service must reflect that instead of a phantom
    // memory-only cancel (old code committed CANCELLED before the write).
    const after = await ordersService.getOrder(orderId);
    expect(after.success).toBe(true);
    if (!after.success) return;
    expect(after.data?.status.code).toBe("PLACED");
  });

  it("commits and returns the cancelled order when the server write lands", async () => {
    const orderId = await createOrderFor("cust_a");

    mockSetDoc.mockResolvedValueOnce(undefined);
    const cancelled = await ordersService.cancelOrder(orderId);
    expect(cancelled.success).toBe(true);
    if (!cancelled.success) return;
    expect(cancelled.data?.status.code).toBe("CANCELLED");
    expect(cancelled.data?.status.terminal).toBe(true);

    // The landed write carries the cancelled status to Partner/KDS.
    const payload = mockSetDoc.mock.calls.at(-1)?.[1] as Record<string, any>;
    expect(payload.status.code).toBe("CANCELLED");
  });

  it("keeps the terminal-order no-op without any extra write", async () => {
    const orderId = await createOrderFor("cust_a");
    mockSetDoc.mockResolvedValueOnce(undefined);
    const first = await ordersService.cancelOrder(orderId);
    expect(first.success).toBe(true);

    const writesBefore = mockSetDoc.mock.calls.length;
    const second = await ordersService.cancelOrder(orderId);
    expect(second.success).toBe(true);
    if (!second.success) return;
    expect(second.data?.status.code).toBe("CANCELLED");
    expect(mockSetDoc.mock.calls.length).toBe(writesBefore);
  });
});
