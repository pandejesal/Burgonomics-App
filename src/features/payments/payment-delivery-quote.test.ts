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

  it("binds a re-quoted fare to a NEW attempt: fresh key, fresh document, new gateway order", async () => {
    // D1 × server contract: `razorpay.service.ts` answers a KNOWN idempotency
    // key from its stored intent BEFORE it validates the new delivery quote, so
    // re-sending the old key after a re-quote returns the OLD gateway order and
    // OLD amount. A changed quote therefore needs a genuinely new attempt — a
    // new key and a new pending document (the previous doc still describes the
    // previous fare and `firestore.rules` allow create only). The old document
    // and gateway order are left untouched for the server to expire.
    const repo = new PaymentRepository();
    const first = await repo.createPaymentOrder();
    expect(first.success).toBe(true);
    expect(mocks.createOrder.mock.calls[0][0]).toMatchObject({
      orderId: "ord_quote_1",
      deliveryQuoteId: "q_del_1",
    });
    const firstKey = (mocks.createOrder.mock.calls[0][0] as { idempotencyKey: string })
      .idempotencyKey;

    useCheckoutStore.setState({
      checkoutFees: {
        status: "ready",
        orderType: "delivery",
        packagingFee: 15,
        deliveryFee: 63,
        deliveryQuoteId: "q_del_2",
        provider: "borzo",
        expiresAt: Date.now() + 60_000,
      },
    });
    mocks.createFromCurrentContext.mockResolvedValueOnce({
      success: true,
      data: { id: "ord_quote_2" },
    });
    mocks.createOrder.mockResolvedValueOnce({
      success: true,
      data: {
        orderId: "order_rzp_quote_2",
        razorpayOrderId: "order_rzp_quote_2",
        amount: 378,
        currency: "INR" as const,
        receipt: "rcpt_quote_2",
        keyId: "rzp_test_quote",
      },
    });

    const second = await repo.createPaymentOrder();

    expect(second.success).toBe(true);
    // A second pending document, and the stale id is NOT adopted.
    expect(mocks.createFromCurrentContext).toHaveBeenCalledTimes(2);
    expect(mocks.createFromCurrentContext.mock.calls[1][0]).toMatchObject({
      confirmedOrderId: undefined,
    });
    // The create carries the NEW quote, the NEW document and a NEW key — the
    // old key would resolve to the old intent server-side.
    const sent = mocks.createOrder.mock.calls[1][0] as {
      orderId: string;
      deliveryQuoteId?: string;
      idempotencyKey: string;
    };
    expect(sent.orderId).toBe("ord_quote_2");
    expect(sent.deliveryQuoteId).toBe("q_del_2");
    expect(sent.idempotencyKey).not.toBe(firstKey);
    expect(mocks.createOrder).toHaveBeenCalledTimes(2);
    if (second.success) expect(second.data.orderId).toBe("order_rzp_quote_2");
    expect(usePaymentStore.getState().internalOrderId).toBe("ord_quote_2");
    expect(usePaymentStore.getState().gatewayOrderId).toBe("order_rzp_quote_2");
  });

  it("keeps the SAME key and document when the re-quoted attempt then fails and is retried unchanged", async () => {
    // The retry bug this pins: the "fresh attempt" signal is transient. Once the
    // new-quote call FAILS nothing is recorded for it (`createdCheckout` keeps
    // gatewayOrder: null), so an unchanged retry no longer looks like a fresh
    // attempt. A key derived from that transient flag would roll back to the
    // FIRST attempt's key and re-mint a gateway order for the new document —
    // a duplicate payable order. The key must be derived from the identity the
    // attempt is actually bound to (checkout identity + document id), which is
    // stable across the failure.
    const repo = new PaymentRepository();
    const first = await repo.createPaymentOrder();
    expect(first.success).toBe(true);
    const firstKey = (mocks.createOrder.mock.calls[0][0] as { idempotencyKey: string })
      .idempotencyKey;

    useCheckoutStore.setState({
      checkoutFees: {
        status: "ready",
        orderType: "delivery",
        packagingFee: 15,
        deliveryFee: 63,
        deliveryQuoteId: "q_del_2",
        provider: "borzo",
        expiresAt: Date.now() + 60_000,
      },
    });
    mocks.createFromCurrentContext.mockResolvedValueOnce({
      success: true,
      data: { id: "ord_quote_2" },
    });
    // Ambiguous transport failure: the gateway may or may not have minted.
    mocks.createOrder.mockResolvedValueOnce({
      success: false,
      error: { code: "GATEWAY_ERROR", message: "upstream 5xx", retryable: true },
    });

    const second = await repo.createPaymentOrder();
    expect(second.success).toBe(false);
    expect(mocks.createFromCurrentContext).toHaveBeenCalledTimes(2);
    const failedKey = (mocks.createOrder.mock.calls[1][0] as { idempotencyKey: string })
      .idempotencyKey;
    expect(failedKey).not.toBe(firstKey);

    // Unchanged retry: same quote, same context. No new document, and the key
    // must be exactly the one the failed call used so the server can resolve it.
    mocks.createOrder.mockResolvedValueOnce({
      success: true,
      data: {
        orderId: "order_rzp_quote_2",
        razorpayOrderId: "order_rzp_quote_2",
        amount: 378,
        currency: "INR" as const,
        receipt: "rcpt_quote_2",
        keyId: "rzp_test_quote",
      },
    });

    const retry = await repo.createPaymentOrder();

    expect(retry.success).toBe(true);
    expect(mocks.createFromCurrentContext).toHaveBeenCalledTimes(2); // same doc
    expect(mocks.createOrder).toHaveBeenCalledTimes(3);
    const retrySent = mocks.createOrder.mock.calls[2][0] as {
      orderId: string;
      deliveryQuoteId?: string;
      idempotencyKey: string;
    };
    expect(retrySent.orderId).toBe("ord_quote_2");
    expect(retrySent.deliveryQuoteId).toBe("q_del_2");
    expect(retrySent.idempotencyKey).toBe(failedKey);
    expect(retrySent.idempotencyKey).not.toBe(firstKey);
    expect(usePaymentStore.getState().internalOrderId).toBe("ord_quote_2");
  });
});
