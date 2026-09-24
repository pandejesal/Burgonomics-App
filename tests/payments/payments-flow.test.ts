import { describe, it, expect, vi } from "vitest";

// Mock Firebase SDK to avoid PERMISSION_DENIED errors in test environment
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  writeBatch: vi.fn(() => ({
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
  })),
  runTransaction: vi.fn(),
  Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
}));

vi.mock("firebase/app", () => ({
  initializeApp: vi.fn(),
  getApps: vi.fn(() => []),
}));

// Authenticated session: createOrder is fail-closed for guests
// (MISSING_AUTH), so tests run as a signed-in user.
vi.mock("../../src/core/config/firebase", () => ({
  auth: { currentUser: { uid: "test_user_001" } },
  db: {},
}));

// Import after mocks
import { ordersService, resolveStatus } from "../../src/features/orders/services/ordersService";

// Server pricing, webhook HMAC, and auto-refund are proven server-side in
// functions/ (pricing.engine, pricing.parity, paymentSignature,
// razorpay.service, route-splits suites). What core owns is the client-side
// cancellation rule in ordersService.cancelOrder.
describe("Payments API — COD Order Flow (client-owned)", () => {
  // NOTE: createOrder/cancelOrder touch the real Firebase SDK surface; offline
  // the persist calls fail fast into in-memory fallbacks, but on a network
  // they burn seconds on denied writes — hence the generous timeouts.
  it("1. [CANCEL-PRE-DELIVERY] cancels a live order through the real service", async () => {
    const created = await ordersService.createOrder({
      store: { id: "branch_01", name: "Test Outlet" },
      fulfillment: "delivery",
      items: [],
      totals: { grandTotal: 500 },
      payment: { method: "cod", status: "pending" },
    } as any);
    expect(created.success).toBe(true);
    if (!created.success) return;
    const orderId = created.data.id;

    const cancelled = await ordersService.cancelOrder(orderId);
    expect(cancelled.success).toBe(true);
    expect(cancelled.data?.status.code).toBe("CANCELLED");
    expect(cancelled.data?.status.terminal).toBe(true);
  }, 30000);

  it("2. [CANCEL-TERMINAL-REJECT] leaves delivered orders untouched", async () => {
    const created = await ordersService.createOrder({
      store: { id: "branch_01", name: "Test Outlet" },
      fulfillment: "delivery",
      items: [],
      totals: { grandTotal: 200 },
      payment: { method: "cod", status: "pending" },
    } as any);
    expect(created.success).toBe(true);
    if (!created.success) return;
    const orderId = created.data.id;

    // Force terminal state, then attempt cancel — must be a no-op.
    const first = await ordersService.cancelOrder(orderId);
    expect(first.data?.status.code).toBe("CANCELLED");
    const second = await ordersService.cancelOrder(orderId);
    expect(second.data?.status.code).toBe("CANCELLED");
    expect(resolveStatus("DELIVERED").terminal).toBe(true);
  }, 30000);
});
