/**
 * CUS-16 — paying an abandoned order must bind the gateway to that SAME
 * `orders/{id}`, not mint a second order (firestore.rules allow create only,
 * so a rewrite is denied and a second doc would duplicate the customer's
 * history). The next live test pays ord_1793523404362_PKKeDF from tracking.
 *
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  createFromCurrentContext: vi.fn(),
  createOrder: vi.fn(),
  setInternalOrderId: vi.fn(),
}));

vi.mock("@/features/cart/repositories/CartRepository", () => ({
  cartRepository: {
    calculateTotals: vi.fn(async () => ({
      success: true,
      data: {
        subtotal: 10,
        taxes: 0.48,
        packingFee: 0,
        deliveryFee: 0,
        promoDiscount: 0,
        grandTotal: 10,
      },
    })),
    prepareCheckout: vi.fn(async () => ({ success: true, data: { checkoutToken: "ct" } })),
  },
}));

vi.mock("@/features/cart/state/cartStore", () => ({
  useCartStore: {
    getState: () => ({
      lines: [
        {
          lineId: "l1",
          productId: "prod_demo_30653",
          storeId: "demo",
          name: "Matar Mushroom Rice Bowl",
          unitPrice: 10,
          quantity: 1,
          modifiers: [],
        },
      ],
      promo: null,
    }),
  },
}));

vi.mock("@/features/stores/state/storeStore", () => ({
  useStoreSelection: {
    getState: () => ({
      activeStore: {
        id: "demo",
        name: "DEMO",
        partnerBranchId: "demo",
        supports: { delivery: true, takeaway: true, dineIn: false },
      },
      fulfillment: "takeaway",
    }),
  },
}));

vi.mock("@/features/stores/utils/serviceArea", () => ({
  DEFAULT_DELIVERY_RADIUS_KM: 5,
  getDeliveryDistanceKm: () => 0,
  isStoreInDeliveryArea: () => true,
}));

vi.mock("@/features/auth/state/authStore", () => ({
  useAuthStore: {
    getState: () => ({
      user: { id: "uid_qa", name: "QA", phone: "+919876543210" },
      isBootstrapped: true,
    }),
  },
  selectIsAuthenticated: () => true,
}));

vi.mock("@/features/addresses", () => ({
  useAddressStore: { getState: () => ({ selectedId: null }) },
  selectSelectedAddress: () => null,
}));

vi.mock("@/features/checkout/state/checkoutStore", () => ({
  useCheckoutStore: {
    getState: () => ({
      orderNotes: "",
      deliveryInstructions: "",
      pickupInstructions: "",
      diningNotes: "",
      tipAmount: 0,
      checkoutFees: { status: "idle" },
    }),
  },
}));

vi.mock("@/features/orders/repositories/OrderRepository", () => ({
  orderRepository: { createFromCurrentContext: fixture.createFromCurrentContext },
}));

vi.mock("@/features/payments/state/paymentStore", () => ({
  usePaymentStore: {
    getState: () => ({
      internalOrderId: null,
      setInternalOrderId: fixture.setInternalOrderId,
      setGatewayOrderId: vi.fn(),
      reconciliationPending: false,
    }),
  },
  loadPaymentReconciliation: () => null,
}));

import { PaymentRepository } from "@/features/payments/repositories/PaymentRepository";

beforeEach(() => {
  vi.clearAllMocks();
  fixture.createOrder.mockResolvedValue({
    success: true,
    data: {
      orderId: "order_rzp_resume",
      razorpayOrderId: "order_rzp_resume",
      amount: 10,
      currency: "INR",
      receipt: "rcpt_resume",
      keyId: "rzp_test_key",
    },
  });
});

describe("resuming an unpaid order", () => {
  it("binds the gateway order to the existing id and creates no second order", async () => {
    const repository = new PaymentRepository({ createOrder: fixture.createOrder } as never);

    const res = await repository.createPaymentOrder({
      resumeOrderId: "ord_1793523404362_PKKeDF",
    });

    expect(res.success).toBe(true);
    expect(fixture.createFromCurrentContext).not.toHaveBeenCalled();
    expect(fixture.createOrder).toHaveBeenCalledTimes(1);
    expect(fixture.createOrder.mock.calls[0][0]).toMatchObject({
      orderId: "ord_1793523404362_PKKeDF",
    });
    expect(fixture.setInternalOrderId).toHaveBeenCalledWith("ord_1793523404362_PKKeDF");
  });

  it("still creates the pending order when no resume id is given", async () => {
    fixture.createFromCurrentContext.mockResolvedValue({
      success: true,
      data: { id: "ord_new" },
    });
    const repository = new PaymentRepository({ createOrder: fixture.createOrder } as never);

    await repository.createPaymentOrder({});

    expect(fixture.createFromCurrentContext).toHaveBeenCalledTimes(1);
    expect(fixture.createOrder.mock.calls[0][0]).toMatchObject({ orderId: "ord_new" });
  });
});
