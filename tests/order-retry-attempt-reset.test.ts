/**
 * CHECKOUT_CONTEXT_CHANGED must clear the payment ATTEMPT so the next tap
 * creates a fresh order.
 *
 * `PaymentRepository.createPaymentOrder` mints a pending `orders/{id}` before
 * the gateway opens and remembers that id in the payment store; retries pass
 * it back as `confirmedOrderId`. When `ordersService` refuses the retry
 * because the checkout context changed, keeping the id would make every
 * subsequent tap retry the SAME stale order (and keep failing). The order
 * repository therefore drops the internal order id + gateway binding on that
 * specific failure — and only on that failure.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

/* ── cart / store / address / checkout context (faked) ─────────────────── */
vi.mock("../src/features/cart/repositories/CartRepository", () => ({
  cartRepository: {
    calculateTotals: vi.fn(async () => ({
      success: true as const,
      data: {
        subtotal: 250,
        itemDiscount: 0,
        promoDiscount: 0,
        taxes: 0,
        cgst: 0,
        sgst: 0,
        gstRate: 0.05,
        deliveryFee: 0,
        packingFee: 0,
        grandTotal: 250,
        currency: "INR" as const,
      },
    })),
  },
}));
vi.mock("../src/features/cart/state/cartStore", () => ({
  useCartStore: {
    getState: () => ({ lines: [], storeId: "store-A", promo: null }),
  },
}));
vi.mock("../src/features/stores/state/storeStore", () => ({
  useStoreSelection: {
    getState: () => ({
      activeStore: { id: "store-A", name: "Surat Vesu", pricing: null },
      fulfillment: "delivery",
    }),
  },
}));
vi.mock("../src/features/addresses", () => ({
  useAddressStore: { getState: () => ({ items: [], selectedId: null }) },
  selectSelectedAddress: () => null,
}));
vi.mock("../src/features/checkout/state/checkoutStore", () => ({
  useCheckoutStore: {
    getState: () => ({
      orderNotes: "",
      deliveryInstructions: "",
      pickupInstructions: "",
      diningNotes: "",
      tipAmount: 0,
      loyaltyPointsToRedeem: 0,
      tableNumber: "",
    }),
  },
}));
vi.mock("../src/features/orders/state/ordersStore", () => ({
  useOrdersStore: {
    getState: () => ({ upsert: vi.fn(), setActiveOrderId: vi.fn() }),
  },
  selectAllOrders: () => [],
}));
vi.mock("../src/core/logging/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { OrderRepository } from "../src/features/orders/repositories/OrderRepository";
import { usePaymentStore } from "../src/features/payments/state/paymentStore";

const contextChanged = {
  success: false as const,
  error: {
    code: "CHECKOUT_CONTEXT_CHANGED",
    message:
      "Your order details changed since the last attempt, so the earlier order was not reused. Please review your details and place the order again.",
    retryable: true,
  },
};

const persistFailed = {
  success: false as const,
  error: {
    code: "PERSIST_FAILED",
    message: "We couldn't save your order.",
    retryable: true,
  },
};

beforeEach(() => {
  usePaymentStore.getState().reset();
});

describe("createFromCurrentContext — stale payment attempt", () => {
  it("clears internalOrderId + gatewayOrderId when the checkout context changed", async () => {
    const service = { createOrder: vi.fn(async () => contextChanged) };
    const repo = new OrderRepository(service as never);

    usePaymentStore.getState().setInternalOrderId("ord_stale");
    usePaymentStore.getState().setGatewayOrderId("order_rzp_stale");

    const res = await repo.createFromCurrentContext({ paymentMethod: "online" });

    expect(res.success).toBe(false);
    // The next tap must mint a fresh order, not retry the stale binding.
    expect(usePaymentStore.getState().internalOrderId).toBeNull();
    expect(usePaymentStore.getState().gatewayOrderId).toBeNull();
  });

  it("keeps the attempt id on an unrelated retryable failure (same order is still the right one)", async () => {
    const service = { createOrder: vi.fn(async () => persistFailed) };
    const repo = new OrderRepository(service as never);

    usePaymentStore.getState().setInternalOrderId("ord_pending");
    usePaymentStore.getState().setGatewayOrderId("order_rzp_pending");

    const res = await repo.createFromCurrentContext({ paymentMethod: "online" });

    expect(res.success).toBe(false);
    expect(usePaymentStore.getState().internalOrderId).toBe("ord_pending");
    expect(usePaymentStore.getState().gatewayOrderId).toBe("order_rzp_pending");
  });
});
