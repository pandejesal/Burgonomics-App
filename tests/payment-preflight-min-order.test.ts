import { beforeEach, describe, expect, it, vi } from "vitest";

const calculateTotals = vi.hoisted(() => vi.fn());
const validateCart = vi.hoisted(() => vi.fn(async () => ({ success: true as const, data: { valid: true, issues: [] } })));

vi.mock("../src/features/cart/repositories/CartRepository", () => ({
  cartRepository: { calculateTotals, validateCart },
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
  orderRepository: { createFromCurrentContext: vi.fn() },
}));

vi.mock("../src/features/payments/state/paymentStore", () => ({
  usePaymentStore: { getState: () => ({ reconciliationPending: false, internalOrderId: null }) },
  loadPaymentReconciliation: () => null,
}));

import { PaymentRepository } from "../src/features/payments/repositories/PaymentRepository";

beforeEach(() => {
  calculateTotals.mockReset();
  validateCart.mockClear();
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
