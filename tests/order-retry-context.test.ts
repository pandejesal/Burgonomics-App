/**
 * Retry reuses an existing order id — it must NOT reuse it for a DIFFERENT
 * checkout.
 *
 * `ordersService.createOrder` reuses `input.confirmedOrderId` (the payment-
 * pending order minted before the gateway opened) so a retry does not create
 * a second order for one checkout. When the doc already exists it used to
 * skip the write based on OWNERSHIP alone and still return `ok(order)` built
 * from the NEW input — so a customer who went back, changed the address /
 * notes / basket and tapped again got a success screen for a basket that was
 * never persisted: Firestore kept the OLD doc while the UI claimed the NEW
 * context was ordered.
 *
 * The order now carries a canonical `checkoutFingerprint` at create, and a
 * retry may only skip the write when the owner AND that fingerprint match.
 * Missing (legacy) or different → CHECKOUT_CONTEXT_CHANGED (retryable).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSetDoc, mockGetDoc, authState } = vi.hoisted(() => {
  const authState: { currentUser: { uid: string } | null } = { currentUser: null };
  return { authState, mockSetDoc: vi.fn(), mockGetDoc: vi.fn() };
});

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((...args: unknown[]) => args),
  doc: vi.fn((...args: unknown[]) => args),
  getDoc: mockGetDoc,
  getDocs: vi.fn(),
  query: vi.fn((...args: unknown[]) => args),
  where: vi.fn((...args: unknown[]) => args),
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

// Live auth state so the pinned uid stays stable across the create + retry.
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

/** One checkout context. Same items/totals unless a test overrides them. */
const checkoutContext = (overrides: Record<string, unknown> = {}) =>
  ({
    store: { id: "branch_01", name: "Test Outlet" },
    fulfillment: "delivery",
    items: [{ productId: "p1", name: "Burger", quantity: 1, unitPrice: 250 }],
    totals: { grandTotal: 250 },
    payment: { method: "online", label: "Pay Online", status: "pending" },
    notes: "no onions",
    address: {
      label: "Home",
      contactName: "Test Customer",
      contactPhone: "+910000000000",
      line1: "1 Main Street",
      city: "Surat",
      state: "Gujarat",
      pincode: "395007",
    },
    ...overrides,
  }) as any;

/** getDoc()-shaped snapshot for the already-existing order doc. */
const existingDoc = (data: Record<string, unknown>) => ({
  exists: () => true,
  data: () => data,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockSetDoc.mockReset().mockResolvedValue(undefined);
  mockGetDoc.mockReset();
  authState.currentUser = { uid: "cust_a" };
});

describe("createOrder retry — canonical checkout fingerprint", () => {
  it("persists a checkout fingerprint on the created order doc", async () => {
    const created = await ordersService.createOrder(checkoutContext());
    expect(created.success).toBe(true);
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const payload = mockSetDoc.mock.calls[0][1] as Record<string, unknown>;
    expect(typeof payload.checkoutFingerprint).toBe("string");
    expect((payload.checkoutFingerprint as string).length).toBeGreaterThan(0);
  });

  it("refuses a retry whose DELIVERY ADDRESS changed instead of returning success for the new context", async () => {
    const created = await ordersService.createOrder(checkoutContext());
    expect(created.success).toBe(true);
    if (!created.success) return;
    const stored = mockSetDoc.mock.calls[0][1] as Record<string, unknown>;

    mockGetDoc.mockResolvedValueOnce(existingDoc(stored));
    const retry = await ordersService.createOrder(
      checkoutContext({
        confirmedOrderId: created.data.id,
        address: {
          label: "Work",
          contactName: "Test Customer",
          contactPhone: "+910000000000",
          line1: "99 Elsewhere Road",
          city: "Surat",
          state: "Gujarat",
          pincode: "395007",
        },
      }),
    );

    expect(retry.success).toBe(false);
    if (retry.success) return;
    expect(retry.error.code).toBe("CHECKOUT_CONTEXT_CHANGED");
    expect(retry.error.retryable).toBe(true);
    expect(retry.error.message).toMatch(/details|changed/i);
    // Nothing was overwritten: the stale doc is the one on the server.
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
  });

  it("refuses a retry whose BASKET changed", async () => {
    const created = await ordersService.createOrder(checkoutContext());
    expect(created.success).toBe(true);
    if (!created.success) return;
    const stored = mockSetDoc.mock.calls[0][1] as Record<string, unknown>;

    mockGetDoc.mockResolvedValueOnce(existingDoc(stored));
    const retry = await ordersService.createOrder(
      checkoutContext({
        confirmedOrderId: created.data.id,
        items: [{ productId: "p1", name: "Burger", quantity: 2, unitPrice: 250 }],
        totals: { grandTotal: 500 },
      }),
    );

    expect(retry.success).toBe(false);
    if (retry.success) return;
    expect(retry.error.code).toBe("CHECKOUT_CONTEXT_CHANGED");
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the existing doc has no fingerprint (pre-upgrade doc)", async () => {
    const created = await ordersService.createOrder(checkoutContext());
    expect(created.success).toBe(true);
    if (!created.success) return;
    const stored = { ...(mockSetDoc.mock.calls[0][1] as Record<string, unknown>) };
    delete stored.checkoutFingerprint;

    mockGetDoc.mockResolvedValueOnce(existingDoc(stored));
    const retry = await ordersService.createOrder(
      checkoutContext({ confirmedOrderId: created.data.id }),
    );

    expect(retry.success).toBe(false);
    if (retry.success) return;
    expect(retry.error.code).toBe("CHECKOUT_CONTEXT_CHANGED");
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
  });

  it("still succeeds (and skips the denied write) when the context is identical", async () => {
    const created = await ordersService.createOrder(checkoutContext());
    expect(created.success).toBe(true);
    if (!created.success) return;
    const stored = mockSetDoc.mock.calls[0][1] as Record<string, unknown>;

    mockGetDoc.mockResolvedValueOnce(existingDoc(stored));
    const retry = await ordersService.createOrder(
      checkoutContext({ confirmedOrderId: created.data.id }),
    );

    expect(retry.success).toBe(true);
    if (!retry.success) return;
    expect(retry.data.id).toBe(created.data.id);
    // The customer rule denies updates, so no second write may be attempted.
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
  });
});
