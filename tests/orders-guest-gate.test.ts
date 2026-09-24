import { describe, it, expect, vi } from "vitest";

// Signed-out session: no currentUser.
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
}));

vi.mock("firebase/app", () => ({
  initializeApp: vi.fn(),
  getApps: vi.fn(() => []),
}));

vi.mock("../src/core/config/firebase", () => ({
  auth: { currentUser: null },
  db: {},
}));

import { ordersService } from "../src/features/orders/services/ordersService";

describe("Guest order gate (product decision: login required)", () => {
  it("rejects guest order creation with MISSING_AUTH instead of a memory-only order", async () => {
    const res = await ordersService.createOrder({
      store: { id: "branch_01", name: "Test Outlet" },
      fulfillment: "delivery",
      items: [],
      totals: { grandTotal: 500 },
      payment: { method: "cod", status: "pending" },
    } as any);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe("MISSING_AUTH");
      expect(res.error.retryable).toBe(false);
    }
  });
});
