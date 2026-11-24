/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  calculateTotals: vi.fn(),
  createCash: vi.fn(),
  createDraft: vi.fn(),
  upsert: vi.fn(),
  setActiveOrderId: vi.fn(),
}));
vi.mock("../src/features/cart/repositories/CartRepository", () => ({
  cartRepository: { calculateTotals: h.calculateTotals },
}));
vi.mock("../src/features/payments/services/cashOrderService", () => ({
  createCashOrderOnServer: h.createCash,
}));
vi.mock("../src/features/payments/services/onlineDraftService", () => ({
  createOnlineDraftOnServer: h.createDraft,
}));
vi.mock("../src/features/auth/utils/scopedPersistence", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/features/auth/utils/scopedPersistence")>()),
  currentScopedUid: () => "cust_min",
}));
const cartState = {
  lines: [{ productId: "p1", name: "Burger", quantity: 1, unitPrice: 99 }],
  promo: null,
};
vi.mock("../src/features/cart/state/cartStore", () => ({
  useCartStore: { getState: () => cartState },
}));
const storeState = {
  activeStore: {
    id: "store_1",
    name: "Test Store",
    address: "1 Test Street",
    area: "Area",
    city: "City",
    phone: "",
    pricing: {} as { minOrderAmount?: number },
  },
  fulfillment: "delivery" as "delivery" | "takeaway" | "dinein",
};
vi.mock("../src/features/stores/state/storeStore", () => ({
  useStoreSelection: { getState: () => storeState },
}));
vi.mock("../src/features/addresses", () => ({
  useAddressStore: { getState: () => ({}) },
  selectSelectedAddress: () => ({ id: "addr_1", lat: 21.2, lng: 72.8 }),
}));
const checkoutState = {
  loyaltyPointsToRedeem: 0,
  tipAmount: 0,
  orderNotes: "",
  deliveryInstructions: "",
  pickupInstructions: "",
  diningNotes: "",
  tableNumber: "",
  checkoutFees: { status: "ready" as const, deliveryQuoteId: "quote_12345" },
};
vi.mock("../src/features/checkout/state/checkoutStore", () => ({
  useCheckoutStore: { getState: () => checkoutState },
}));
vi.mock("../src/features/payments/state/paymentStore", () => ({
  usePaymentStore: { getState: () => ({}) },
}));
vi.mock("../src/features/orders/state/ordersStore", () => ({
  useOrdersStore: { getState: () => ({ upsert: h.upsert, setActiveOrderId: h.setActiveOrderId }) },
  selectAllOrders: () => [],
}));
vi.mock("../src/features/orders/services/ordersService", () => ({
  ordersService: {
    getOrder: async (id: string) => ({
      success: true,
      data: { id, status: { code: "PLACED", kind: "upcoming", terminal: false } },
    }),
  },
}));

import { OrderRepository } from "../src/features/orders/repositories/OrderRepository";

const totals = (subtotal: number) => ({
  success: true as const,
  data: { subtotal, grandTotal: subtotal + 30 },
});
const status = { code: "PLACED", label: "Placed", kind: "upcoming", terminal: false };
beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: { request: async (_key: string, callback: () => unknown) => callback() },
  });
  h.calculateTotals.mockReset();
  h.createCash.mockReset();
  h.createDraft.mockReset();
  h.upsert.mockReset();
  h.setActiveOrderId.mockReset();
  storeState.activeStore.pricing = {};
  storeState.fulfillment = "delivery";
  h.createCash.mockImplementation(async (request: { orderId: string }) => ({
    success: true,
    data: {
      orderId: request.orderId,
      replayed: false,
      paymentMethod: "cod",
      paymentChannel: "cash",
      cashDuePaise: 17900,
      totals: {},
      status,
    },
  }));
  h.createDraft.mockImplementation(async (request: { orderId: string; attemptId: string }) => ({
    success: true,
    data: {
      orderId: request.orderId,
      id: request.orderId,
      attemptId: request.attemptId,
      replayed: false,
      amountPaise: 17900,
      totals: {},
      status,
    },
  }));
});

describe("server order creators — shared delivery minimum", () => {
  it.each(["cash", "online"] as const)(
    "refuses a sub-minimum %s order before the server call",
    async (lane) => {
      h.calculateTotals.mockResolvedValue(totals(99));
      const res =
        lane === "cash"
          ? await new OrderRepository().createCashOrder()
          : await new OrderRepository().createOnlineDraft();
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.code).toBe("MIN_ORDER");
        expect(res.error.message).toContain("₹50");
        expect(res.error.message).toContain("₹149");
      }
      expect(h.createCash).not.toHaveBeenCalled();
      expect(h.createDraft).not.toHaveBeenCalled();
    },
  );

  it("prices the minimum on item subtotal, not the fees-inclusive total", async () => {
    h.calculateTotals.mockResolvedValue(totals(120));
    const res = await new OrderRepository().createOnlineDraft();
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.message).toContain("₹29");
    expect(h.createDraft).not.toHaveBeenCalled();
  });

  it("uses the store override for both server lanes", async () => {
    storeState.activeStore.pricing = { minOrderAmount: 300 };
    h.calculateTotals.mockResolvedValue(totals(250));
    for (const create of [
      () => new OrderRepository().createCashOrder(),
      () => new OrderRepository().createOnlineDraft(),
    ]) {
      const res = await create();
      expect(res.success).toBe(false);
      if (!res.success) expect(res.error.message).toContain("₹300");
    }
    expect(h.createCash).not.toHaveBeenCalled();
    expect(h.createDraft).not.toHaveBeenCalled();
  });

  it("accepts a delivery basket exactly at the default minimum", async () => {
    h.calculateTotals.mockResolvedValue(totals(149));
    expect((await new OrderRepository().createCashOrder()).success).toBe(true);
    expect((await new OrderRepository().createOnlineDraft()).success).toBe(true);
    expect(h.createCash).toHaveBeenCalledTimes(1);
    expect(h.createDraft).toHaveBeenCalledTimes(1);
  });
});
