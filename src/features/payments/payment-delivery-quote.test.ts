/** @vitest-environment jsdom */
/**
 * R8 × CUS-09 — the payment create is bound to the server's delivery quote.
 *
 *  - The amount sent is the displayed bill, which includes the quoted fee, so
 *    when the server agrees no price-change dialog appears and the customer is
 *    charged exactly what they saw.
 *  - The quote id travels with the create.
 *  - A 409 DELIVERY_QUOTE_EXPIRED retry re-quotes at the screen and re-sends
 *    the SAME internal order id — one order, one Razorpay order, no duplicate.
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
import { needsRepriceAcceptance } from "@/features/checkout/utils/repriceAcceptance";

const STORE = {
  id: "demo",
  name: "Burgonomics DEMO",
  lat: 23.0225,
  lng: 72.5714,
  isOpen: true,
  pricing: { minOrderAmount: 0 },
} as unknown as Store;

const gatewayOrder = (amount: number) => ({
  orderId: "order_rzp_quote",
  razorpayOrderId: "order_rzp_quote",
  amount,
  currency: "INR" as const,
  receipt: "rcpt_quote",
  keyId: "rzp_test_quote",
});

beforeEach(() => {
  vi.clearAllMocks();
  // 300 food + 15 packaging + 57 courier quote.
  mocks.calculateTotals.mockResolvedValue({
    success: true,
    data: {
      subtotal: 300,
      taxes: 14.29,
      packingFee: 15,
      deliveryFee: 57,
      promoDiscount: 0,
      loyaltyDiscount: 0,
      grandTotal: 372,
    },
  });
  mocks.prepareCheckout.mockResolvedValue({
    success: true,
    data: { checkoutToken: "chk_token_quote" },
  });
  mocks.createFromCurrentContext.mockResolvedValue({ success: true, data: { id: "ord_quote_1" } });
  mocks.markPaymentFailed.mockResolvedValue({ success: true, data: null });
  mocks.createOrder.mockResolvedValue({ success: true, data: gatewayOrder(372) });

  useCartStore.setState({
    lines: [
      {
        lineId: "l1",
        productId: "p1",
        name: "Burger",
        storeId: STORE.id,
        quantity: 1,
        unitPrice: 300,
        price: 300,
        availability: "available",
        modifiers: [],
      },
    ],
    storeId: STORE.id,
    status: "ready",
  });
  useStoreSelection.setState({ activeStore: STORE, fulfillment: "delivery" });
  useAuthStore.setState({
    status: "authenticated",
    user: { id: "usr_quote", phone: "+919106515036", name: "Test" },
    accessToken: "access",
    refreshToken: "refresh",
  });
  useCheckoutStore.setState({
    tipAmount: 0,
    loyaltyPointsToRedeem: 0,
    checkoutFees: {
      status: "ready",
      orderType: "delivery",
      packagingFee: 15,
      deliveryFee: 57,
      deliveryQuoteId: "q_del_1",
      provider: "borzo",
      expiresAt: Date.now() + 60_000,
    },
    feesRequestSeq: 1,
    feesKey: "demo||delivery|23|72.5",
  });
  usePaymentStore.getState().reset();
});

describe("R8 payment create is bound to the live delivery quote", () => {
  it("charges exactly the displayed bill and sends the quote id", async () => {
    const repo = new PaymentRepository();
    const res = await repo.createPaymentOrder();

    expect(res.success).toBe(true);
    const sent = mocks.createOrder.mock.calls[0][0];
    expect(sent.amount).toBe(372);
    expect(sent.deliveryQuoteId).toBe("q_del_1");

    // Server agreed: no dialog, and the amount the customer saw is the amount
    // that will be charged.
    expect(needsRepriceAcceptance(372, res.success ? res.data.amount : undefined, null)).toBe(
      false,
    );
  });

  it("re-sends the same internal order with the NEW quote after a 409", async () => {
    mocks.createOrder.mockResolvedValueOnce({
      success: false,
      error: {
        code: "DELIVERY_QUOTE_EXPIRED",
        message: "Delivery quote expired.",
        retryable: true,
      },
    });
    const repo = new PaymentRepository();

    const first = await repo.createPaymentOrder({ deliveryQuoteId: "q_old" });
    expect(first.success).toBe(false);
    if (!first.success) expect(first.error.code).toBe("DELIVERY_QUOTE_EXPIRED");

    // The screen re-quoted; the retry must bind the new quote without writing a
    // second order document.
    useCheckoutStore.setState({
      checkoutFees: {
        status: "ready",
        orderType: "delivery",
        packagingFee: 15,
        deliveryFee: 63,
        deliveryQuoteId: "q_new",
        provider: "borzo",
        expiresAt: Date.now() + 60_000,
      },
    });
    const retry = await repo.createPaymentOrder({ deliveryQuoteId: "q_new" });

    expect(retry.success).toBe(true);
    expect(mocks.createFromCurrentContext).toHaveBeenCalledTimes(1);
    expect(mocks.createOrder).toHaveBeenCalledTimes(2);
    expect(mocks.createOrder.mock.calls[1][0].deliveryQuoteId).toBe("q_new");
    expect(mocks.createOrder.mock.calls[1][0].orderId).toBe("ord_quote_1");
  });
});
