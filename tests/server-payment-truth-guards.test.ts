// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

// C02 — server-payment-truth guards (read-only client, zero writes).
//
// A08 B2/B3: `markPaymentFailed` used to read the memory/`getOrder` cache and
// merge-write `{payment, updatedAt}` — a write `firestore.rules` denies for
// customers (only `{status,completedAt,updatedAt}` cancel or
// `{whatsappOptIn,updatedAt}` lanes) — yet the catch arm still flipped the
// LOCAL cache to failed. A captured order could render locally as failed and
// invite re-pay. `finalizePaidOrder` (R24) was amount-blind and derived
// `paidAt` from the client-writable `paidAt` field.
//
// These tests pin the C02 repair hermetically (all Firebase surfaces mocked,
// no network):
//
//   A. `markPaymentFailed` refuses every paid-path observation — completed /
//      captured markers, recorded `capturedAmountPaise`, `awaiting_capture`
//      parks, CONFIRMED-or-later rank, terminal/settled states — with a typed
//      refusal, ZERO writes and an untouched cache.
//   B. `markPaymentFailed` rehydrates the cache ONLY from a fresh server
//      `failed` observation (zero writes); a server-pending doc gets an
//      honest typed refusal (`PAYMENT_STILL_PENDING`), never a minted fail.
//   C. Scope/auth honesty is preserved: uid-switch, foreign owner, guest,
//      read failure, missing doc.
//   D. `finalizePaidOrder` amount/timestamp sanity: mismatched
//      pricing-vs-captured fails closed; `paidAt` derives from server
//      `verifiedAt` only (client `paidAt` alone → undefined).

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
import { useOrdersStore } from "../src/features/orders/state/ordersStore";

// -- Hermetic fixtures ------------------------------------------------

const VERIFIED_AT = "2026-10-14T10:00:00.000Z";
const PLACED_AT = "2026-10-14T09:55:00.000Z";

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

/** Server doc exactly as finishVerifiedPayment leaves it after verify. */
function paidServerDoc(id: string, uid: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    userId: uid,
    customerId: uid,
    status: { ...CONFIRMED_STATUS },
    paymentStatus: "completed",
    payment: {
      method: "online",
      label: "Pay Online",
      status: "completed",
      razorpayPaymentId: "pay_123",
      razorpayOrderId: "order_rzp_123",
      verifiedAt: VERIFIED_AT,
      capturedAmountPaise: 25000,
    },
    pricing: { grandTotal: 250 },
    fulfillment: "delivery",
    store: { id: "branch_01", name: "Test Outlet" },
    items: [{ productId: "p1", name: "Burger", quantity: 1, unitPrice: 250 }],
    totals: { grandTotal: 250 },
    placedAt: PLACED_AT,
    estimatedAt: "2026-10-14T10:30:00.000Z",
    createdAt: PLACED_AT,
    updatedAt: VERIFIED_AT,
    ...overrides,
  };
}

/** Server doc exactly as the `payment.failed` webhook leaves it. */
function failedServerDoc(id: string, uid: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    userId: uid,
    customerId: uid,
    status: { ...PLACED_STATUS },
    paymentStatus: "failed",
    payment: { method: "online", label: "Pay Online", status: "failed" },
    fulfillment: "delivery",
    store: { id: "branch_01", name: "Test Outlet" },
    items: [{ productId: "p1", name: "Burger", quantity: 1, unitPrice: 250 }],
    totals: { grandTotal: 250 },
    placedAt: PLACED_AT,
    createdAt: PLACED_AT,
    updatedAt: "2026-10-14T09:56:00.000Z",
    ...overrides,
  };
}

/** Server-pending doc (pre-gateway / verify-not-yet-landed). */
function pendingServerDoc(id: string, uid: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    userId: uid,
    customerId: uid,
    status: { ...PLACED_STATUS },
    paymentStatus: "pending",
    payment: { method: "online", label: "Pay Online", status: "pending" },
    fulfillment: "delivery",
    store: { id: "branch_01", name: "Test Outlet" },
    items: [{ productId: "p1", name: "Burger", quantity: 1, unitPrice: 250 }],
    totals: { grandTotal: 250 },
    placedAt: PLACED_AT,
    createdAt: PLACED_AT,
    updatedAt: PLACED_AT,
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

/** Pending create-order input pinned to a caller-chosen id. */
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

/** Assert the refusal left no false failure in the session cache. */
async function expectCacheUntouched(id: string) {
  mockGetDoc.mockRejectedValueOnce(new Error("permission-denied"));
  const after = await ordersService.getOrder(id);
  expect(after.success).toBe(true);
  if (!after.success) return;
  expect(after.data).toBeNull();
}

let testSeq = 0;
beforeEach(() => {
  vi.clearAllMocks();
  mockSetDoc.mockReset().mockResolvedValue(undefined);
  mockGetDoc.mockReset();
  mockGetDocs.mockReset();
  // A fresh uid per test = a fresh cache scope: the module-level caches are
  // per-account (R03) and never carry state across tests.
  authState.currentUser = { uid: `cust_c02_${++testSeq}` };
  useOrdersStore.getState().clearAll();
});

// -- A. paid-path observations refuse the failed downgrade -------------

describe("A. markPaymentFailed refuses paid-path server truth (no write, no cache mutation)", () => {
  it("completed markers → ORDER_ALREADY_PAID, zero writes, cache untouched", async () => {
    const uid = currentUid();
    mockGetDoc.mockResolvedValueOnce(snapOf(paidServerDoc("ord_c02_paid", uid)));

    const res = await ordersService.markPaymentFailed("ord_c02_paid");
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("ORDER_ALREADY_PAID");
    expect(res.error.retryable).toBe(false);
    expect(mockSetDoc).not.toHaveBeenCalled();
    expect(mockUpdateDoc).not.toHaveBeenCalled();
    await expectCacheUntouched("ord_c02_paid");
  });

  it("awaiting_capture park → ORDER_ALREADY_PAID (hold, not failure)", async () => {
    const uid = currentUid();
    mockGetDoc.mockResolvedValueOnce(
      snapOf(
        pendingServerDoc("ord_c02_hold", uid, {
          paymentStatus: "awaiting_capture",
          payment: { method: "online", label: "Pay Online", status: "awaiting_capture" },
        }),
      ),
    );

    const res = await ordersService.markPaymentFailed("ord_c02_hold");
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("ORDER_ALREADY_PAID");
    expect(mockSetDoc).not.toHaveBeenCalled();
    await expectCacheUntouched("ord_c02_hold");
  });

  it("recorded capturedAmountPaise with pending markers → ORDER_ALREADY_PAID (money moved)", async () => {
    const uid = currentUid();
    mockGetDoc.mockResolvedValueOnce(
      snapOf(
        pendingServerDoc("ord_c02_captured", uid, {
          payment: {
            method: "online",
            label: "Pay Online",
            status: "pending",
            capturedAmountPaise: 25000,
          },
        }),
      ),
    );

    const res = await ordersService.markPaymentFailed("ord_c02_captured");
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("ORDER_ALREADY_PAID");
    expect(mockSetDoc).not.toHaveBeenCalled();
    await expectCacheUntouched("ord_c02_captured");
  });

  it("CONFIRMED status without completed markers → ORDER_TERMINAL (paid-path rank, never downgraded)", async () => {
    const uid = currentUid();
    mockGetDoc.mockResolvedValueOnce(
      snapOf(
        pendingServerDoc("ord_c02_conf", uid, {
          status: { ...CONFIRMED_STATUS },
        }),
      ),
    );

    const res = await ordersService.markPaymentFailed("ord_c02_conf");
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("ORDER_TERMINAL");
    expect(mockSetDoc).not.toHaveBeenCalled();
    await expectCacheUntouched("ord_c02_conf");
  });

  it("settled CANCELLED doc → ORDER_TERMINAL, zero writes", async () => {
    const uid = currentUid();
    mockGetDoc.mockResolvedValueOnce(
      snapOf(
        pendingServerDoc("ord_c02_cancel", uid, {
          status: { code: "CANCELLED", label: "Cancelled", kind: "cancelled", terminal: true },
        }),
      ),
    );

    const res = await ordersService.markPaymentFailed("ord_c02_cancel");
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("ORDER_TERMINAL");
    expect(mockSetDoc).not.toHaveBeenCalled();
    await expectCacheUntouched("ord_c02_cancel");
  });
});

// -- B. failed rehydrate only / pending honest refusal -----------------

describe("B. markPaymentFailed rehydrates server-failed only; pending is an honest refusal", () => {
  it("fresh server failed rehydrates the cached pending order with ZERO writes", async () => {
    const seeded = await ordersService.createOrder(pendingOrderInput("ord_c02_fail"));
    expect(seeded.success).toBe(true);
    const writesSoFar = mockSetDoc.mock.calls.length;
    expect(writesSoFar).toBe(1); // the pre-gateway pending create only

    mockGetDoc.mockResolvedValueOnce(snapOf(failedServerDoc("ord_c02_fail", currentUid())));
    const res = await ordersService.markPaymentFailed("ord_c02_fail");
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.payment.status).toBe("failed");
    expect(res.data.payment.paidAt).toBeUndefined();
    // No additional write of any kind — the observation is read-only.
    expect(mockSetDoc.mock.calls.length).toBe(writesSoFar);
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  it("fresh server failed with NO cache entry hydrates a canonical failed record, zero writes", async () => {
    const uid = currentUid();
    mockGetDoc.mockResolvedValueOnce(snapOf(failedServerDoc("ord_c02_fail_fresh", uid)));

    const res = await ordersService.markPaymentFailed("ord_c02_fail_fresh");
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.id).toBe("ord_c02_fail_fresh");
    expect(res.data.payment.status).toBe("failed");
    expect(res.data.status.code).toBe("PLACED");
    expect(mockSetDoc).not.toHaveBeenCalled();
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  it("server-pending doc → PAYMENT_STILL_PENDING (retryable), cache untouched, zero writes", async () => {
    const uid = currentUid();
    mockGetDoc.mockResolvedValueOnce(snapOf(pendingServerDoc("ord_c02_pending", uid)));

    const res = await ordersService.markPaymentFailed("ord_c02_pending");
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("PAYMENT_STILL_PENDING");
    expect(res.error.retryable).toBe(true);
    expect(mockSetDoc).not.toHaveBeenCalled();
    expect(mockUpdateDoc).not.toHaveBeenCalled();
    await expectCacheUntouched("ord_c02_pending");
  });
});

// -- C. scope/auth honesty preserved -----------------------------------

describe("C. markPaymentFailed scope and auth honesty (R03 preserved)", () => {
  it("uid switch mid-read → AUTH_CHANGED, new session cache empty, zero writes", async () => {
    const uid = currentUid();
    mockGetDoc.mockImplementationOnce(async () => {
      authState.currentUser = { uid: `cust_c02_switched_${uid}` };
      return snapOf(failedServerDoc("ord_c02_switch", uid));
    });

    const res = await ordersService.markPaymentFailed("ord_c02_switch");
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("AUTH_CHANGED");
    expect(mockSetDoc).not.toHaveBeenCalled();

    mockGetDoc.mockRejectedValueOnce(new Error("permission-denied"));
    const forNew = await ordersService.getOrder("ord_c02_switch");
    expect(forNew.success).toBe(true);
    if (!forNew.success) return;
    expect(forNew.data).toBeNull();
  });

  it("foreign-owner doc → NOT_OWNER without caching it, zero writes", async () => {
    mockGetDoc.mockResolvedValueOnce(
      snapOf(failedServerDoc("ord_c02_foreign", "cust_someone_else")),
    );

    const res = await ordersService.markPaymentFailed("ord_c02_foreign");
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("NOT_OWNER");
    expect(mockSetDoc).not.toHaveBeenCalled();
    await expectCacheUntouched("ord_c02_foreign");
  });

  it("guest session → MISSING_AUTH without even reading", async () => {
    authState.currentUser = null;

    const res = await ordersService.markPaymentFailed("ord_c02_guest");
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("MISSING_AUTH");
    expect(mockGetDoc).not.toHaveBeenCalled();
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it("server read failure → SERVER_READ_FAILED (retryable), no false failure, no write", async () => {
    mockGetDoc.mockRejectedValueOnce(new Error("unavailable"));

    const res = await ordersService.markPaymentFailed("ord_c02_readfail");
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("SERVER_READ_FAILED");
    expect(res.error.retryable).toBe(true);
    expect(mockSetDoc).not.toHaveBeenCalled();
    await expectCacheUntouched("ord_c02_readfail");
  });

  it("missing doc → NOT_FOUND, zero writes", async () => {
    mockGetDoc.mockResolvedValueOnce(snapOf(null));

    const res = await ordersService.markPaymentFailed("ord_c02_ghost");
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("NOT_FOUND");
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it("blank id → MISSING_CONTEXT without reading or writing", async () => {
    const res = await ordersService.markPaymentFailed("   ");
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("MISSING_CONTEXT");
    expect(mockGetDoc).not.toHaveBeenCalled();
    expect(mockSetDoc).not.toHaveBeenCalled();
  });
});

// -- D. finalize amount/timestamp sanity (B3) ---------------------------

describe("D. finalizePaidOrder amount binding and server-only paidAt", () => {
  it("pricing-vs-captured mismatch → SERVER_DOC_SHAPE_INVALID, cache empty, zero writes", async () => {
    const uid = currentUid();
    mockGetDoc.mockResolvedValueOnce(
      snapOf(
        paidServerDoc("ord_c02_amt", uid, {
          pricing: { grandTotal: 250 },
          payment: {
            method: "online",
            label: "Pay Online",
            status: "completed",
            razorpayPaymentId: "pay_123",
            verifiedAt: VERIFIED_AT,
            capturedAmountPaise: 19900, // a different total's capture
          },
        }),
      ),
    );

    const res = await ordersService.finalizePaidOrder({ confirmedOrderId: "ord_c02_amt" });
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("SERVER_DOC_SHAPE_INVALID");
    expect(mockSetDoc).not.toHaveBeenCalled();
    await expectCacheUntouched("ord_c02_amt");
  });

  it("matching pricing and captured amount finalizes (zero writes)", async () => {
    const uid = currentUid();
    mockGetDoc.mockResolvedValueOnce(snapOf(paidServerDoc("ord_c02_amt_ok", uid)));

    const res = await ordersService.finalizePaidOrder({ confirmedOrderId: "ord_c02_amt_ok" });
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.payment.status).toBe("paid");
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it("legacy doc without capturedAmountPaise still finalizes (single-side skip, server owns amount)", async () => {
    const uid = currentUid();
    const legacy = paidServerDoc("ord_c02_legacy", uid, {
      pricing: { grandTotal: 250 },
      payment: {
        method: "online",
        label: "Pay Online",
        status: "completed",
        razorpayPaymentId: "pay_123",
        verifiedAt: VERIFIED_AT,
      },
    });
    mockGetDoc.mockResolvedValueOnce(snapOf(legacy));

    const res = await ordersService.finalizePaidOrder({ confirmedOrderId: "ord_c02_legacy" });
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.payment.status).toBe("paid");
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it("paidAt derives from server verifiedAt, never the client paidAt fallback", async () => {
    const uid = currentUid();
    // Client-written paidAt only (legacy full-setDoc shape), no verifiedAt.
    mockGetDoc.mockResolvedValueOnce(
      snapOf(
        paidServerDoc("ord_c02_novrf", uid, {
          payment: {
            method: "online",
            label: "Pay Online",
            status: "completed",
            razorpayPaymentId: "pay_123",
            paidAt: "2020-01-01T00:00:00.000Z",
          },
        }),
      ),
    );
    const noVrf = await ordersService.finalizePaidOrder({ confirmedOrderId: "ord_c02_novrf" });
    expect(noVrf.success).toBe(true);
    if (!noVrf.success) return;
    expect(noVrf.data.payment.paidAt).toBeUndefined();

    // Server verifiedAt present → paidAt equals it exactly.
    mockGetDoc.mockResolvedValueOnce(snapOf(paidServerDoc("ord_c02_vrf", currentUid())));
    const withVrf = await ordersService.finalizePaidOrder({ confirmedOrderId: "ord_c02_vrf" });
    expect(withVrf.success).toBe(true);
    if (!withVrf.success) return;
    expect(withVrf.data.payment.paidAt).toBe(VERIFIED_AT);
    expect(mockSetDoc).not.toHaveBeenCalled();
  });
});
