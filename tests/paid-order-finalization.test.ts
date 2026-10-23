// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

// R24 — paid-order finalization (read-only server truth).
//
// After backend verify confirms the pending `orders/{id}` doc, the old
// post-payment path re-ran `createFromCurrentContext` → `createOrder` → a
// FULL `setDoc` over the SAME confirmed id. On an existing doc that is an
// UPDATE: firestore.rules lets a customer change only
// `status/completedAt/updatedAt` (cancel) or `whatsappOptIn/updatedAt`,
// so the write is denied on a captured payment — and wherever a rule
// allowed it, the client-built payload would overwrite server-owned
// payment/status/totals (possibly clobbering a server-set paid state with
// a client-minted one).
//
// These tests pin the NEW `finalizePaidOrder` surface (service +
// repository) hermetically — all Firebase surfaces mocked, no network:
//
//   A. A mocked server doc that is already paid/confirmed finalizes with
//      ZERO writes and hydrates cache/UI from server truth only.
//   B. Pending/unpaid, foreign-owner, UID-switch, terminal, shape-broken
//      and read-failure inputs all fail honestly — never a false order,
//      never a minted id, never a weakened rule.
//   C. A stale session cache is never accepted as paid proof, and a fresh
//      server read always wins over it.
//   D. The repository hydrates `useOrdersStore` ONLY from a successful
//      server-truth result.

const {
  mockSetDoc,
  mockGetDoc,
  mockGetDocs,
  mockDoc,
  mockCollection,
  mockQuery,
  mockWhere,
  mockUpdateDoc,
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
    mockUpdateDoc: vi.fn(),
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
  updateDoc: mockUpdateDoc,
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
import { orderRepository } from "../src/features/orders/repositories/OrderRepository";
import { useOrdersStore } from "../src/features/orders/state/ordersStore";

// -- Hermetic fixtures ------------------------------------------------

const CONFIRMED_STATUS = {
  code: "CONFIRMED",
  label: "Order confirmed",
  kind: "upcoming",
  terminal: false,
} as const;

const PLACED_STATUS = {
  code: "PLACED",
  label: "Order placed",
  kind: "upcoming",
  terminal: false,
} as const;

/** A server doc exactly as finishVerifiedPayment leaves it after verify. */
function paidServerDoc(id: string, uid: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    userId: uid,
    customerId: uid,
    status: { ...CONFIRMED_STATUS },
    // Top-level paid marker: only the SERVER writes this (core createOrder
    // never writes a top-level paymentStatus — firestore.rules comment).
    paymentStatus: "completed",
    payment: {
      method: "online",
      label: "Pay Online",
      status: "completed",
      razorpayPaymentId: "pay_123",
      verifiedAt: new Date().toISOString(),
    },
    fulfillment: "delivery",
    store: { id: "branch_01", name: "Test Outlet" },
    items: [{ productId: "p1", name: "Burger", quantity: 1, unitPrice: 250 }],
    totals: { grandTotal: 250 },
    placedAt: new Date().toISOString(),
    estimatedAt: new Date(Date.now() + 35 * 60_000).toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

/** getDoc()-shaped snapshot over a plain doc (null = doc missing). */
function snapOf(data: Record<string, unknown> | null) {
  return {
    exists: () => data !== null,
    data: () => data,
  };
}

/** Create-order input with a caller-chosen id (pending, unpaid). */
function pendingOrderInput(id: string) {
  return {
    confirmedOrderId: id,
    store: { id: "branch_01", name: "Test Outlet" },
    fulfillment: "delivery",
    items: [{ productId: "p1", name: "Burger", quantity: 1, unitPrice: 250 }],
    totals: { grandTotal: 250 },
    payment: { method: "online", label: "Pay Online", status: "pending" },
  } as any;
}

const currentUid = () => authState.currentUser?.uid ?? "";

let testSeq = 0;
beforeEach(() => {
  vi.clearAllMocks();
  mockSetDoc.mockReset().mockResolvedValue(undefined);
  mockGetDoc.mockReset();
  mockGetDocs.mockReset();
  // A fresh uid per test = a fresh cache scope: the module-level caches
  // (`orders`, `progression`, …) are per-account (R03) and never carry
  // state across tests.
  authState.currentUser = { uid: `cust_it_${++testSeq}` };
  useOrdersStore.getState().clearAll();
});

// -- A. server-confirmed paid order finalizes with ZERO writes --------

describe("A. server-confirmed paid order finalizes with zero writes", () => {
  it("returns the canonical paid order from server truth without writing anything", async () => {
    const uid = currentUid();
    mockGetDoc.mockResolvedValueOnce(snapOf(paidServerDoc("ord_paid_1", uid)));

    const res = await ordersService.finalizePaidOrder({
      confirmedOrderId: "ord_paid_1",
      expectedTransactionId: "pay_123",
    });

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.id).toBe("ord_paid_1"); // doc-ref id, never a minted id
    expect(res.data.status.code).toBe("CONFIRMED");
    expect(res.data.payment.status).toBe("paid");
    expect(res.data.payment.transactionId).toBe("pay_123"); // server's payment id
    expect(res.data.payment.paidAt).toBeTruthy(); // server verifiedAt, not client now()

    // The read targeted orders/ord_paid_1 exactly once…
    expect(mockDoc).toHaveBeenCalledWith({}, "orders", "ord_paid_1");
    expect(mockGetDoc).toHaveBeenCalledTimes(1);
    // …and NO write of any kind happened (the bug this repair replaces).
    expect(mockSetDoc).not.toHaveBeenCalled();
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  it("hydrates the session cache from that server result (no second fetch needed)", async () => {
    const uid = currentUid();
    mockGetDoc.mockResolvedValueOnce(snapOf(paidServerDoc("ord_paid_2", uid)));

    const res = await ordersService.finalizePaidOrder({ confirmedOrderId: "ord_paid_2" });
    expect(res.success).toBe(true);

    // getOrder serves the cached canonical — payment proof came from the
    // one server read above, not from a refetch or a client field.
    const cached = await ordersService.getOrder("ord_paid_2");
    expect(cached.success).toBe(true);
    if (!cached.success) return;
    expect(cached.data?.payment.status).toBe("paid");
    expect(mockGetDoc).toHaveBeenCalledTimes(1);
    expect(mockSetDoc).not.toHaveBeenCalled();
  });
});

// -- B. honest failures -----------------------------------------------

describe("B. honest failures — never a false order, never a minted id", () => {
  it("rejects a pending/unpaid doc (PAYMENT_NOT_CONFIRMED) and caches nothing", async () => {
    const uid = currentUid();
    const unpaid = paidServerDoc("ord_pending_1", uid, {
      status: { ...PLACED_STATUS },
      paymentStatus: "pending",
      payment: { method: "online", label: "Pay Online", status: "pending" },
    });
    mockGetDoc.mockResolvedValueOnce(snapOf(unpaid));

    const res = await ordersService.finalizePaidOrder({ confirmedOrderId: "ord_pending_1" });
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("PAYMENT_NOT_CONFIRMED");
    expect(mockSetDoc).not.toHaveBeenCalled();

    // No false order landed in the cache: a raw read (denied) reads null.
    mockGetDoc.mockRejectedValueOnce(new Error("permission-denied"));
    const after = await ordersService.getOrder("ord_pending_1");
    expect(after.success).toBe(true);
    if (!after.success) return;
    expect(after.data).toBeNull();
  });

  it("flags a client-written 'paid' literal instead of trusting it (SERVER_DOC_SHAPE_INVALID)", async () => {
    const uid = currentUid();
    // The old full-setDoc path wrote nested payment.status = "paid" — a
    // CLIENT display literal with no server paymentStatus behind it.
    const clientPaid = paidServerDoc("ord_client_paid", uid, {
      paymentStatus: undefined,
      payment: { method: "online", label: "Pay Online", status: "paid" },
    });
    mockGetDoc.mockResolvedValueOnce(snapOf(clientPaid));

    const res = await ordersService.finalizePaidOrder({
      confirmedOrderId: "ord_client_paid",
      expectedTransactionId: "pay_123",
    });
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("SERVER_DOC_SHAPE_INVALID");
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it("flags disagreeing server paid markers instead of picking the flattering one", async () => {
    const uid = currentUid();
    const split = paidServerDoc("ord_split", uid, {
      paymentStatus: "completed",
      payment: { method: "online", label: "Pay Online", status: "pending" },
    });
    mockGetDoc.mockResolvedValueOnce(snapOf(split));

    const res = await ordersService.finalizePaidOrder({ confirmedOrderId: "ord_split" });
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("SERVER_DOC_SHAPE_INVALID");
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it("rejects a doc owned by another account (NOT_OWNER) without caching it", async () => {
    mockGetDoc.mockResolvedValueOnce(snapOf(paidServerDoc("ord_foreign", "cust_someone_else")));

    const res = await ordersService.finalizePaidOrder({ confirmedOrderId: "ord_foreign" });
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("NOT_OWNER");

    mockGetDoc.mockRejectedValueOnce(new Error("permission-denied"));
    const after = await ordersService.getOrder("ord_foreign");
    expect(after.success).toBe(true);
    if (!after.success) return;
    expect(after.data).toBeNull();
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it("fails AUTH_CHANGED when the uid switches mid-read (R03) — never hydrates the new account", async () => {
    const uid = currentUid();
    mockGetDoc.mockImplementationOnce(async () => {
      // The account changes while the read is in flight.
      authState.currentUser = { uid: `cust_switched_${uid}` };
      return snapOf(paidServerDoc("ord_mid_switch", uid));
    });

    const res = await ordersService.finalizePaidOrder({ confirmedOrderId: "ord_mid_switch" });
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("AUTH_CHANGED");

    // The NEW session's cache never received the previous session's read.
    mockGetDoc.mockRejectedValueOnce(new Error("permission-denied"));
    const forNew = await ordersService.getOrder("ord_mid_switch");
    expect(forNew.success).toBe(true);
    if (!forNew.success) return;
    expect(forNew.data).toBeNull();
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it("server read failure → SERVER_READ_FAILED, no false order, no new id, no write", async () => {
    mockGetDoc.mockRejectedValueOnce(new Error("unavailable"));

    const res = await ordersService.finalizePaidOrder({ confirmedOrderId: "ord_read_fail" });
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("SERVER_READ_FAILED");
    expect(res.error.retryable).toBe(true);
    expect("data" in res).toBe(false); // nothing to hydrate
    expect(mockSetDoc).not.toHaveBeenCalled();

    // Nothing was cached: the raw read (still failing) reads not-found.
    mockGetDoc.mockRejectedValueOnce(new Error("unavailable"));
    const after = await ordersService.getOrder("ord_read_fail");
    expect(after.success).toBe(true);
    if (!after.success) return;
    expect(after.data).toBeNull();
  });

  it("missing doc → NOT_FOUND (does not mint the confirmed id)", async () => {
    mockGetDoc.mockResolvedValueOnce(snapOf(null));

    const res = await ordersService.finalizePaidOrder({ confirmedOrderId: "ord_never_written" });
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("NOT_FOUND");
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it("terminal orders (cancelled / delivered) → ORDER_TERMINAL, no writes", async () => {
    const uid = currentUid();
    mockGetDoc.mockResolvedValueOnce(
      snapOf(
        paidServerDoc("ord_cancelled", uid, {
          status: { code: "CANCELLED", label: "Cancelled", kind: "cancelled", terminal: true },
        }),
      ),
    );
    const cancelled = await ordersService.finalizePaidOrder({ confirmedOrderId: "ord_cancelled" });
    expect(cancelled.success).toBe(false);
    if (!cancelled.success) expect(cancelled.error.code).toBe("ORDER_TERMINAL");

    mockGetDoc.mockResolvedValueOnce(
      snapOf(
        paidServerDoc("ord_delivered", uid, {
          status: { code: "DELIVERED", label: "Delivered", kind: "completed", terminal: true },
        }),
      ),
    );
    const delivered = await ordersService.finalizePaidOrder({ confirmedOrderId: "ord_delivered" });
    expect(delivered.success).toBe(false);
    if (!delivered.success) expect(delivered.error.code).toBe("ORDER_TERMINAL");

    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it("expected transaction id mismatch → TRANSACTION_MISMATCH", async () => {
    const uid = currentUid();
    mockGetDoc.mockResolvedValueOnce(snapOf(paidServerDoc("ord_tx_mismatch", uid)));

    const res = await ordersService.finalizePaidOrder({
      confirmedOrderId: "ord_tx_mismatch",
      expectedTransactionId: "pay_OTHER",
    });
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("TRANSACTION_MISMATCH");
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it("paid doc with NO server payment id → flagged, never bound to the client's transaction id", async () => {
    const uid = currentUid();
    const noTx = paidServerDoc("ord_no_tx", uid, {
      payment: { method: "online", label: "Pay Online", status: "completed" },
    });
    mockGetDoc.mockResolvedValueOnce(snapOf(noTx));

    const res = await ordersService.finalizePaidOrder({
      confirmedOrderId: "ord_no_tx",
      expectedTransactionId: "pay_client_says_so",
    });
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("SERVER_DOC_SHAPE_INVALID");
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it("guest session → MISSING_AUTH, without even reading", async () => {
    authState.currentUser = null;

    const res = await ordersService.finalizePaidOrder({ confirmedOrderId: "ord_guest" });
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("MISSING_AUTH");
    expect(mockGetDoc).not.toHaveBeenCalled();
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it("blank confirmedOrderId → MISSING_CONTEXT, without reading or minting", async () => {
    const res = await ordersService.finalizePaidOrder({ confirmedOrderId: "   " });
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("MISSING_CONTEXT");
    expect(mockGetDoc).not.toHaveBeenCalled();
    expect(mockSetDoc).not.toHaveBeenCalled();
  });
});

// -- C. cache can never prove payment ---------------------------------

describe("C. cache can never prove payment", () => {
  it("a stale client-paid cache entry is not paid proof when the server read fails", async () => {
    // Seed the session cache with an order whose paid flag is CLIENT-written
    // (the old post-verify path's shape).
    const seeded = await ordersService.createOrder({
      ...pendingOrderInput("ord_stale_paid"),
      payment: { method: "online", label: "Pay Online", status: "paid" },
    });
    expect(seeded.success).toBe(true);
    const writesSoFar = mockSetDoc.mock.calls.length;

    // The server read — the ONLY paid proof — fails.
    mockGetDoc.mockRejectedValueOnce(new Error("unavailable"));
    const res = await ordersService.finalizePaidOrder({ confirmedOrderId: "ord_stale_paid" });
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("SERVER_READ_FAILED");
    // The failure produced no additional write of any kind.
    expect(mockSetDoc.mock.calls.length).toBe(writesSoFar);
  });

  it("a fresh server read wins over a stale unpaid cache entry", async () => {
    // Pending (unpaid) order created pre-gateway — cached as unpaid.
    const seeded = await ordersService.createOrder(pendingOrderInput("ord_flip"));
    expect(seeded.success).toBe(true);
    if (!seeded.success) return;
    expect(seeded.data.payment.status).toBe("pending");

    // Server says: paid + confirmed (finishVerifiedPayment landed).
    mockGetDoc.mockResolvedValueOnce(snapOf(paidServerDoc("ord_flip", currentUid())));
    const res = await ordersService.finalizePaidOrder({ confirmedOrderId: "ord_flip" });
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.payment.status).toBe("paid");

    // The cache now serves the SERVER-truth paid order (no refetch).
    const cached = await ordersService.getOrder("ord_flip");
    expect(cached.success).toBe(true);
    if (!cached.success) return;
    expect(cached.data?.payment.status).toBe("paid");
    expect(mockGetDoc).toHaveBeenCalledTimes(1);
  });
});

// -- D. repository: UI store hydrated only on success -----------------

describe("D. repository hydrates useOrdersStore only from server truth", () => {
  it("success → store gets the canonical paid order + active id, with zero writes", async () => {
    const uid = currentUid();
    mockGetDoc.mockResolvedValueOnce(snapOf(paidServerDoc("ord_ui_ok", uid)));

    const res = await orderRepository.finalizePaidOrder({
      confirmedOrderId: "ord_ui_ok",
      transactionId: "pay_123",
    });
    expect(res.success).toBe(true);
    if (!res.success) return;

    const st = useOrdersStore.getState();
    expect(st.byId["ord_ui_ok"]?.payment.status).toBe("paid");
    expect(st.byId["ord_ui_ok"]?.payment.transactionId).toBe("pay_123");
    expect(st.activeOrderId).toBe("ord_ui_ok");
    expect(st.ids).toEqual(["ord_ui_ok"]);
    expect(mockSetDoc).not.toHaveBeenCalled();
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  it("pending/unpaid → failure leaves the store EMPTY (no false order, no new id)", async () => {
    const uid = currentUid();
    const unpaid = paidServerDoc("ord_ui_unpaid", uid, {
      status: { ...PLACED_STATUS },
      paymentStatus: "pending",
      payment: { method: "online", label: "Pay Online", status: "pending" },
    });
    mockGetDoc.mockResolvedValueOnce(snapOf(unpaid));

    const res = await orderRepository.finalizePaidOrder({ confirmedOrderId: "ord_ui_unpaid" });
    expect(res.success).toBe(false);

    const st = useOrdersStore.getState();
    expect(st.ids).toHaveLength(0);
    expect(st.byId["ord_ui_unpaid"]).toBeUndefined();
    expect(st.activeOrderId).toBeNull();
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it("server read failure → failure leaves the store EMPTY (no false order, no new id)", async () => {
    mockGetDoc.mockRejectedValueOnce(new Error("unavailable"));

    const res = await orderRepository.finalizePaidOrder({ confirmedOrderId: "ord_ui_fail" });
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("SERVER_READ_FAILED");

    const st = useOrdersStore.getState();
    expect(st.ids).toHaveLength(0);
    expect(st.activeOrderId).toBeNull();
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it("other owner → failure leaves the store EMPTY", async () => {
    mockGetDoc.mockResolvedValueOnce(snapOf(paidServerDoc("ord_ui_foreign", "cust_someone_else")));

    const res = await orderRepository.finalizePaidOrder({ confirmedOrderId: "ord_ui_foreign" });
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("NOT_OWNER");

    const st = useOrdersStore.getState();
    expect(st.ids).toHaveLength(0);
    expect(st.activeOrderId).toBeNull();
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it("missing confirmedOrderId → MISSING_CONTEXT without reading or writing", async () => {
    const res = await orderRepository.finalizePaidOrder({});
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("MISSING_CONTEXT");
    expect(mockGetDoc).not.toHaveBeenCalled();
    expect(mockSetDoc).not.toHaveBeenCalled();
    expect(useOrdersStore.getState().ids).toHaveLength(0);
  });
});
