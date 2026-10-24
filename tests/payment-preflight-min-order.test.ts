import { beforeEach, describe, expect, it, vi } from "vitest";

const calculateTotals = vi.hoisted(() => vi.fn());
const validateCart = vi.hoisted(() => vi.fn(async () => ({ success: true as const, data: { valid: true, issues: [] } })));
const prepareCheckout = vi.hoisted(() =>
  vi.fn(async () => ({ success: true as const, data: { checkoutToken: "tok_min_order" } })),
);
const createFromCurrentContext = vi.hoisted(() => vi.fn());
const createGatewayOrder = vi.hoisted(() => vi.fn());
const setInternalOrderId = vi.hoisted(() => vi.fn());

vi.mock("../src/features/cart/repositories/CartRepository", () => ({
  cartRepository: { calculateTotals, validateCart, prepareCheckout },
}));

vi.mock("../src/features/cart/state/cartStore", () => ({
  useCartStore: { getState: () => ({ lines: [{ productId: "p1", quantity: 1 }], promo: null }) },
}));

const storeState = {
  activeStore: { id: "store_1", pricing: {} as { minOrderAmount?: number }, isOpen: true },
  fulfillment: "delivery" as "delivery" | "takeaway" | "dinein",
};
vi.mock("../src/features/stores/state/storeStore", () => ({
  useStoreSelection: { getState: () => storeState },
}));

vi.mock("../src/features/auth/state/authStore", () => ({
  useAuthStore: { getState: () => ({ user: { id: "cust_1" } }) },
  selectIsAuthenticated: () => true,
}));

vi.mock("../src/features/addresses", () => ({
  useAddressStore: { getState: () => ({}) },
  selectSelectedAddress: () => ({ line1: "1 Test Street" }),
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
    }),
  },
}));

vi.mock("../src/features/orders/repositories/OrderRepository", () => ({
  orderRepository: { createFromCurrentContext },
}));

vi.mock("../src/features/payments/services/paymentsService", () => ({
  paymentsService: { createOrder: createGatewayOrder },
}));

vi.mock("../src/features/payments/state/paymentStore", () => ({
  usePaymentStore: {
    getState: () => ({
      reconciliationPending: false,
      internalOrderId: null,
      gatewayOrderId: null,
      setInternalOrderId,
      setGatewayOrderId: vi.fn(),
    }),
  },
  loadPaymentReconciliation: () => null,
}));

import { PaymentRepository } from "../src/features/payments/repositories/PaymentRepository";

beforeEach(() => {
  calculateTotals.mockReset();
  validateCart.mockClear();
  prepareCheckout.mockClear();
  createFromCurrentContext.mockReset();
  createGatewayOrder.mockReset();
  setInternalOrderId.mockClear();
  storeState.activeStore.pricing = {};
  storeState.fulfillment = "delivery";
});

describe("PaymentRepository.validateForPayment — resolved minimum order", () => {
  it("blocks a delivery basket under the default ₹149 minimum even when the store doc sets no override", async () => {
    calculateTotals.mockResolvedValue({ success: true, data: { subtotal: 100 } });

    const res = await new PaymentRepository().validateForPayment();

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.valid).toBe(false);
    const issue = res.data.issues.find((i) => i.code === "min_order");
    expect(issue?.message).toContain("₹49");
    // Blocked before the cart/gateway validation step.
    expect(validateCart).not.toHaveBeenCalled();
  });

  it("uses the store override instead of the default when one is configured", async () => {
    storeState.activeStore.pricing = { minOrderAmount: 300 };
    calculateTotals.mockResolvedValue({ success: true, data: { subtotal: 250 } });

    const res = await new PaymentRepository().validateForPayment();

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.issues.find((i) => i.code === "min_order")?.message).toContain("₹50");
  });

  it("does not impose a minimum on takeaway", async () => {
    storeState.fulfillment = "takeaway";
    calculateTotals.mockResolvedValue({ success: true, data: { subtotal: 10 } });

    const res = await new PaymentRepository().validateForPayment();

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.issues.some((i) => i.code === "min_order")).toBe(false);
  });

  it("accepts a delivery basket that meets the minimum", async () => {
    calculateTotals.mockResolvedValue({ success: true, data: { subtotal: 200 } });

    const res = await new PaymentRepository().validateForPayment();

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.valid).toBe(true);
  });
});

describe("PaymentRepository.createPaymentOrder — gateway boundary minimum order", () => {
  it("refuses a sub-minimum delivery basket before creating the pending order or the gateway order", async () => {
    calculateTotals.mockResolvedValue({ success: true, data: { subtotal: 100, grandTotal: 130 } });

    const res = await new PaymentRepository().createPaymentOrder();

    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("MIN_ORDER");
    expect(res.error.message).toContain("₹49");
    expect(res.error.message).toContain("₹149");
    expect(res.error.retryable).toBe(true);
    expect(createFromCurrentContext).not.toHaveBeenCalled();
    expect(prepareCheckout).not.toHaveBeenCalled();
    expect(createGatewayOrder).not.toHaveBeenCalled();
  });

  it("uses the store override at the gateway boundary", async () => {
    storeState.activeStore.pricing = { minOrderAmount: 300 };
    calculateTotals.mockResolvedValue({ success: true, data: { subtotal: 250, grandTotal: 280 } });

    const res = await new PaymentRepository().createPaymentOrder();

    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("MIN_ORDER");
    expect(res.error.message).toContain("₹50");
    expect(createGatewayOrder).not.toHaveBeenCalled();
  });

  it("does not gate takeaway and reaches the gateway", async () => {
    storeState.fulfillment = "takeaway";
    calculateTotals.mockResolvedValue({ success: true, data: { subtotal: 10, grandTotal: 40 } });
    createFromCurrentContext.mockResolvedValue({
      success: true,
      data: { id: "ord_min_order_takeaway" },
    });
    createGatewayOrder.mockResolvedValue({
      success: true,
      data: { orderId: "pay_min_order_takeaway", amount: 40, currency: "INR", receipt: "rcpt_1" },
    });

    const res = await new PaymentRepository().createPaymentOrder();

    expect(res.success).toBe(true);
    expect(createFromCurrentContext).toHaveBeenCalledTimes(1);
    expect(createGatewayOrder).toHaveBeenCalledTimes(1);
  });
});
