/** @vitest-environment jsdom */
/** A changed basket must not silently abandon an existing server draft. */
import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ calculateTotals: vi.fn(), createDraft: vi.fn() }));
vi.mock("../src/features/cart/repositories/CartRepository", () => ({
  cartRepository: { calculateTotals: h.calculateTotals },
}));
vi.mock("../src/features/payments/services/onlineDraftService", () => ({
  createOnlineDraftOnServer: h.createDraft,
}));
vi.mock("../src/features/auth/utils/scopedPersistence", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/features/auth/utils/scopedPersistence")>()),
  currentScopedUid: () => "cust_retry",
}));
const cartState = { lines: [{ productId: "p1", quantity: 1 }], promo: null };
vi.mock("../src/features/cart/state/cartStore", () => ({
  useCartStore: { getState: () => cartState },
}));
vi.mock("../src/features/stores/state/storeStore", () => ({
  useStoreSelection: {
    getState: () => ({
      activeStore: { id: "store-A", name: "Outlet", pricing: {} },
      fulfillment: "takeaway",
    }),
  },
}));
vi.mock("../src/features/addresses", () => ({
  useAddressStore: { getState: () => ({}) },
  selectSelectedAddress: () => undefined,
}));
vi.mock("../src/features/checkout/state/checkoutStore", () => ({
  useCheckoutStore: {
    getState: () => ({
      orderNotes: "",
      pickupInstructions: "",
      deliveryInstructions: "",
      diningNotes: "",
      tipAmount: 0,
      tableNumber: "",
      checkoutFees: { status: "idle" },
    }),
  },
}));
vi.mock("../src/features/payments/state/paymentStore", () => ({
  usePaymentStore: { getState: () => ({}) },
}));
vi.mock("../src/features/orders/services/ordersService", () => ({ ordersService: {} }));

import { OrderRepository } from "../src/features/orders/repositories/OrderRepository";
import { readPendingOnlineDraft } from "../src/features/payments/services/pendingOnlineDraft";

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: { request: async (_key: string, callback: () => unknown) => callback() },
  });
  cartState.lines = [{ productId: "p1", quantity: 1 }];
  h.calculateTotals
    .mockReset()
    .mockResolvedValue({ success: true, data: { subtotal: 100, grandTotal: 100 } });
  h.createDraft
    .mockReset()
    .mockImplementation(async (request: { orderId: string; attemptId: string }) => ({
      success: true,
      data: {
        orderId: request.orderId,
        id: request.orderId,
        attemptId: request.attemptId,
        replayed: false,
        amountPaise: 10000,
        totals: {},
        status: { code: "PLACED", label: "Placed", kind: "upcoming", terminal: false },
      },
    }));
});

describe("server draft retry identity", () => {
  it("keeps the original attempt and refuses a changed basket without a second server order", async () => {
    const repo = new OrderRepository();
    expect((await repo.createOnlineDraft()).success).toBe(true);
    const original = readPendingOnlineDraft();
    cartState.lines = [{ productId: "p1", quantity: 2 }];
    const changed = await repo.createOnlineDraft();
    expect(changed.success).toBe(false);
    if (!changed.success) expect(changed.error.code).toBe("CHECKOUT_CONTEXT_CHANGED");
    expect(h.createDraft).toHaveBeenCalledTimes(1);
    expect(readPendingOnlineDraft()?.orderId).toBe(original?.orderId);
    expect(readPendingOnlineDraft()?.attemptId).toBe(original?.attemptId);
  });
});
