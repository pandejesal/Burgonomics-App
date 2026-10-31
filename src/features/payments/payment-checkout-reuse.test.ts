/** @vitest-environment jsdom */
/**
 * CUS-09 — "already persisted" at the repository boundary.
 *
 * `firestore.rules` allow CREATE on `orders/{id}` only; a client update is
 * denied. `ordersService.createOrder` therefore cannot be re-run for a
 * checkout whose document was already written — the second `setDoc` fails with
 * "Missing or insufficient permissions", surfaces as PERSIST_FAILED, and the
 * customer never reaches Razorpay (live run 3: reprice acceptance; run 2: a
 * gateway 500 followed by a retry).
 *
 * The repository now records the checkout it created and reuses it: one
 * `orders/{id}` document and one Razorpay order per attempt. A genuine
 * first-attempt persist failure still returns PERSIST_FAILED and records
 * nothing, so a real retry is still allowed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Store } from "@/features/stores/models/Store";

const mocks = vi.hoisted(() => ({
  createFromCurrentContext: vi.fn(),
  markPaymentFailed: vi.fn(),
  createOrder: vi.fn(),
  calculateTotals: vi.fn(),
  prepareCheckout: vi.fn(),
}));

vi.mock("@/features/orders/repositories/OrderRepository", () => ({
  orderRepository: {
    createFromCurrentContext: mocks.createFromCurrentContext,
    markPaymentFailed: mocks.markPaymentFailed,
  },
}));
vi.mock("@/features/payments/services/paymentsService", () => ({
  paymentsService: { createOrder: mocks.createOrder },
}));
vi.mock("@/features/cart/repositories/CartRepository", () => ({
  cartRepository: {
    calculateTotals: mocks.calculateTotals,
    prepareCheckout: mocks.prepareCheckout,
  },
}));

import { PaymentRepository } from "@/features/payments/repositories/PaymentRepository";
import { useCartStore } from "@/features/cart/state/cartStore";
import { useStoreSelection } from "@/features/stores/state/storeStore";
import { useAuthStore } from "@/features/auth/state/authStore";
import { usePaymentStore } from "@/features/payments/state/paymentStore";
import { useCheckoutStore } from "@/features/checkout/state/checkoutStore";

const STORE = {
  id: "demo",
  name: "Burgonomics DEMO",
  lat: 21.15,
  lng: 72.77,
  isOpen: true,
  pricing: { minOrderAmount: 0 },
} as unknown as Store;

const gatewayOrder = {
  orderId: "order_rzp_1",
  razorpayOrderId: "order_rzp_1",
  amount: 26,
  currency: "INR" as const,
  receipt: "rcpt_cus09",
  keyId: "rzp_test_cus09",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.calculateTotals.mockResolvedValue({
    success: true,
    data: {
      subtotal: 10,
      taxes: 0.5,
      packingFee: 20,
      deliveryFee: 0,
      promoDiscount: 0,
      loyaltyDiscount: 0,
      grandTotal: 30,
    },
  });
  mocks.prepareCheckout.mockResolvedValue({
    success: true,
    data: { checkoutToken: "chk_token_1" },
  });
  mocks.createFromCurrentContext.mockResolvedValue({ success: true, data: { id: "ord_created_1" } });
  mocks.markPaymentFailed.mockResolvedValue({ success: true, data: null });
  mocks.createOrder.mockResolvedValue({ success: true, data: gatewayOrder });

  useCartStore.setState({
    lines: [
      {
        lineId: "l1",
        productId: "prod_demo_30653",
        name: "Matar Mushroom Rice Bowl",
        storeId: STORE.id,
        quantity: 1,
        unitPrice: 10,
        price: 10,
        availability: "available",
        modifiers: [],
      },
    ],
    storeId: STORE.id,
    status: "ready",
  });
  useStoreSelection.setState({ activeStore: STORE, fulfillment: "takeaway" });
  useAuthStore.setState({
    status: "authenticated",
    user: { id: "usr_cus09", phone: "+919106515036", name: "Test" },
    accessToken: "access",
    refreshToken: "refresh",
  });
  useCheckoutStore.setState({ tipAmount: 0, loyaltyPointsToRedeem: 0, orderNotes: "qa_e2e3" });
  usePaymentStore.getState().reset();
});

describe("CUS-09 — one orders/{id} and one Razorpay order per checkout", () => {
  it("reuses the checkout it already created instead of writing the order again", async () => {
    const repo = new PaymentRepository();

    const first = await repo.createPaymentOrder();
    expect(first.success).toBe(true);
    expect(mocks.createFromCurrentContext).toHaveBeenCalledTimes(1);
    expect(mocks.createOrder).toHaveBeenCalledTimes(1);
    if (first.success) expect(first.data.amount).toBe(26);

    // Re-entry from the same checkout (reprice acceptance / retry): no second
    // order document write, no second gateway order.
    const second = await repo.createPaymentOrder();

    expect(second.success).toBe(true);
    expect(mocks.createFromCurrentContext).toHaveBeenCalledTimes(1);
    expect(mocks.createOrder).toHaveBeenCalledTimes(1);
    if (second.success) {
      expect(second.data.orderId).toBe("order_rzp_1");
      expect(second.data.amount).toBe(26);
    }
    expect(usePaymentStore.getState().internalOrderId).toBe("ord_created_1");
    expect(usePaymentStore.getState().gatewayOrderId).toBe("order_rzp_1");
  });

  it("retries the gateway for the SAME persisted order when the first create call failed", async () => {
    // Live run 2: the order document was written, then createPaymentOrder
    // answered 500. The retry must not rewrite the document.
    mocks.createOrder.mockResolvedValueOnce({
      success: false,
      error: { code: "GATEWAY_ERROR", message: "upstream 500", retryable: true },
    });
    const repo = new PaymentRepository();

    const first = await repo.createPaymentOrder();
    expect(first.success).toBe(false);
    expect(mocks.createFromCurrentContext).toHaveBeenCalledTimes(1);

    const retry = await repo.createPaymentOrder();

    expect(retry.success).toBe(true);
    expect(mocks.createFromCurrentContext).toHaveBeenCalledTimes(1); // no rewrite
    expect(mocks.createOrder).toHaveBeenCalledTimes(2); // gateway retried
    // The gateway order is bound to the order document that already exists.
    expect(mocks.createOrder.mock.calls[1][0]).toMatchObject({ orderId: "ord_created_1" });
  });

  it("a genuine first-attempt persist failure still surfaces PERSIST_FAILED and records nothing", async () => {
    mocks.createFromCurrentContext.mockResolvedValueOnce({
      success: false,
      error: {
        code: "PERSIST_FAILED",
        message: "We couldn't save your order, so the kitchen never received it.",
        retryable: true,
      },
    });
    const repo = new PaymentRepository();

    const failed = await repo.createPaymentOrder();

    expect(failed.success).toBe(false);
    if (!failed.success) expect(failed.error.code).toBe("PERSIST_FAILED");
    expect(mocks.createOrder).not.toHaveBeenCalled();
    expect(usePaymentStore.getState().internalOrderId).toBeNull();

    // Nothing was recorded, so the retry is a genuine create — not a silent ok.
    const retry = await repo.createPaymentOrder();
    expect(retry.success).toBe(true);
    expect(mocks.createFromCurrentContext).toHaveBeenCalledTimes(2);
    expect(mocks.createOrder).toHaveBeenCalledTimes(1);
  });
});
