import { beforeEach, describe, expect, it, vi } from "vitest";

const calculateTotals = vi.hoisted(() => vi.fn());
const createOrder = vi.hoisted(() => vi.fn());
const upsert = vi.hoisted(() => vi.fn());
const setActiveOrderId = vi.hoisted(() => vi.fn());

vi.mock("../src/features/cart/repositories/CartRepository", () => ({
  cartRepository: { calculateTotals },
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
    phone: "9999999999",
    pricing: {} as { minOrderAmount?: number },
  },
  fulfillment: "delivery" as "delivery" | "takeaway" | "dinein",
};
vi.mock("../src/features/stores/state/storeStore", () => ({
  useStoreSelection: { getState: () => storeState },
}));

vi.mock("../src/features/addresses", () => ({
  useAddressStore: { getState: () => ({}) },
  selectSelectedAddress: () => undefined,
}));

vi.mock("../src/features/checkout/state/checkoutStore", () => ({
  useCheckoutStore: {
    getState: () => ({
      loyaltyPointsToRedeem: 0,
      tipAmount: 0,
      orderNotes: "",
      deliveryInstructions: "",
      pickupInstructions: "",
      diningNotes: "",
      tableNumber: undefined,
    }),
  },
}));

vi.mock("../src/features/payments/state/paymentStore", () => ({
  usePaymentStore: { getState: () => ({}) },
}));

vi.mock("../src/features/orders/state/ordersStore", () => ({
  useOrdersStore: { getState: () => ({ upsert, setActiveOrderId }) },
  selectAllOrders: () => [],
}));

vi.mock("../src/features/orders/services/ordersService", () => ({
  ordersService: { createOrder },
}));

import { OrderRepository } from "../src/features/orders/repositories/OrderRepository";

const totals = (subtotal: number) => ({
  success: true as const,
  data: { subtotal, grandTotal: subtotal + 30 },
});

beforeEach(() => {
  calculateTotals.mockReset();
  createOrder.mockReset();
  upsert.mockReset();
  setActiveOrderId.mockReset();
  storeState.activeStore.pricing = {};
  storeState.fulfillment = "delivery";
  createOrder.mockImplementation(async (input: { payment: { method: string } }) => ({
    success: true as const,
    data: { id: "ord_created", payment: input.payment },
  }));
});

describe("OrderRepository.createFromCurrentContext — shared delivery minimum", () => {
  it("refuses a sub-minimum cash-on-delivery order before it is persisted", async () => {
    calculateTotals.mockResolvedValue(totals(99));

    const res = await new OrderRepository().createFromCurrentContext({
      paymentMethod: "cash",
      paymentStatus: "CASH_PENDING",
      paymentLabel: "Cash on Delivery",
    });

    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("MIN_ORDER");
    expect(res.error.message).toContain("₹50");
    expect(res.error.message).toContain("₹149");
    expect(res.error.retryable).toBe(true);
    expect(createOrder).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("refuses a zero-payable free delivery order below the minimum", async () => {
    calculateTotals.mockResolvedValue(totals(100));

    const res = await new OrderRepository().createFromCurrentContext({
      paymentMethod: "online",
      paymentStatus: "pending",
      paymentLabel: "Free order — no payment due",
    });

    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("MIN_ORDER");
    expect(res.error.message).toContain("₹49");
    expect(createOrder).not.toHaveBeenCalled();
  });

  it("uses the store override for every payment method", async () => {
    storeState.activeStore.pricing = { minOrderAmount: 300 };
    calculateTotals.mockResolvedValue(totals(250));

    const res = await new OrderRepository().createFromCurrentContext({
      paymentMethod: "cash",
      paymentStatus: "CASH_PENDING",
    });

    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("MIN_ORDER");
    expect(res.error.message).toContain("₹50");
    expect(res.error.message).toContain("₹300");
    expect(createOrder).not.toHaveBeenCalled();
  });

  it("accepts a delivery basket exactly at the ₹149 minimum", async () => {
    calculateTotals.mockResolvedValue(totals(149));

    const res = await new OrderRepository().createFromCurrentContext({
      paymentMethod: "cash",
      paymentStatus: "CASH_PENDING",
    });

    expect(res.success).toBe(true);
    expect(createOrder).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("accepts a zero-payable free delivery basket at the minimum", async () => {
    calculateTotals.mockResolvedValue(totals(149));

    const res = await new OrderRepository().createFromCurrentContext({
      paymentMethod: "online",
      paymentStatus: "pending",
      paymentLabel: "Free order — no payment due",
    });

    expect(res.success).toBe(true);
    expect(createOrder).toHaveBeenCalledTimes(1);
  });

  it("accepts a delivery basket above the minimum", async () => {
    calculateTotals.mockResolvedValue(totals(200));

    const res = await new OrderRepository().createFromCurrentContext({
      paymentMethod: "cash",
      paymentStatus: "CASH_PENDING",
    });

    expect(res.success).toBe(true);
    expect(createOrder).toHaveBeenCalledTimes(1);
  });

  it("imposes no minimum on takeaway", async () => {
    storeState.fulfillment = "takeaway";
    calculateTotals.mockResolvedValue(totals(10));

    const res = await new OrderRepository().createFromCurrentContext({
      paymentMethod: "cash",
      paymentStatus: "PAY_AT_STORE",
    });

    expect(res.success).toBe(true);
    expect(createOrder).toHaveBeenCalledTimes(1);
  });
});
