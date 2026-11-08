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
import { useAddressStore, type Address } from "@/features/addresses";

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

describe("D1 — changed mode/drop pin never reuses the previous checkout", () => {
  const takeawayGateway = {
    orderId: "order_rzp_takeaway",
    razorpayOrderId: "order_rzp_takeaway",
    amount: 30,
    currency: "INR" as const,
    receipt: "rcpt_takeaway",
    keyId: "rzp_test_cus09",
  };
  const movedPinGateway = {
    orderId: "order_rzp_moved",
    razorpayOrderId: "order_rzp_moved",
    amount: 30,
    currency: "INR" as const,
    receipt: "rcpt_moved",
    keyId: "rzp_test_cus09",
  };

  const deliveryAddress = (overrides: Partial<Address> = {}): Address => ({
    id: "addr_cus09",
    label: "home",
    line1: "1 Test Street",
    city: "Surat",
    pincode: "395007",
    lat: 21.15,
    lng: 72.77,
    isDefault: true,
    ...overrides,
  });

  function seedDeliveryAddress(address: Address) {
    useAddressStore.setState({ addresses: [address], selectedId: address.id });
    useCheckoutStore.setState({
      checkoutFees: {
        status: "ready",
        orderType: "delivery",
        packagingFee: 20,
        deliveryFee: 0,
        deliveryQuoteId: "q_del_ctx",
        provider: "test",
        expiresAt: Date.now() + 60_000,
      },
    });
  }

  // Distinct returned document + gateway ids make a reuse detectable: the
  // defect this covers adopted `ord_created_1`/`order_rzp_1` for a checkout the
  // customer had already changed. The outer `vi.clearAllMocks()` clears call
  // history only, so an unconsumed `...Once` from a PREVIOUS case would leak
  // into the next one; reset the two mocks to their defaults here.
  beforeEach(() => {
    mocks.createFromCurrentContext.mockReset();
    mocks.createOrder.mockReset();
    mocks.createFromCurrentContext.mockResolvedValue({
      success: true,
      data: { id: "ord_created_1" },
    });
    mocks.createOrder.mockResolvedValue({ success: true, data: gatewayOrder });
    useAddressStore.setState({ addresses: [], selectedId: null });
  });

  it("delivery → takeaway mints a fresh pending document and gateway order", async () => {
    seedDeliveryAddress(deliveryAddress());
    useStoreSelection.setState({ activeStore: STORE, fulfillment: "delivery" });
    const repo = new PaymentRepository();

    const delivery = await repo.createPaymentOrder();
    expect(delivery.success).toBe(true);
    expect(mocks.createFromCurrentContext).toHaveBeenCalledTimes(1);
    expect(mocks.createOrder.mock.calls[0][0]).toMatchObject({ orderId: "ord_created_1" });
    expect(usePaymentStore.getState().internalOrderId).toBe("ord_created_1");
    expect(usePaymentStore.getState().gatewayOrderId).toBe("order_rzp_1");

    // The customer switches to takeaway on the same basket.
    mocks.createFromCurrentContext.mockResolvedValueOnce({
      success: true,
      data: { id: "ord_created_2" },
    });
    mocks.createOrder.mockResolvedValueOnce({ success: true, data: takeawayGateway });
    useStoreSelection.setState({ activeStore: STORE, fulfillment: "takeaway" });

    const takeaway = await repo.createPaymentOrder();

    expect(takeaway.success).toBe(true);
    // A new document is written — the delivery doc still carries the old mode.
    expect(mocks.createFromCurrentContext).toHaveBeenCalledTimes(2);
    // ...and the stale id is NOT adopted as its confirmed order.
    expect(mocks.createFromCurrentContext.mock.calls[1][0]).toMatchObject({
      confirmedOrderId: undefined,
    });
    expect(mocks.createOrder).toHaveBeenCalledTimes(2);
    expect(mocks.createOrder.mock.calls[1][0]).toMatchObject({
      orderId: "ord_created_2",
      orderType: "takeaway",
    });
    // The old gateway order is never handed back for the new checkout.
    expect(mocks.createOrder.mock.calls[1][0].orderId).not.toBe("ord_created_1");
    if (takeaway.success) {
      expect(takeaway.data.orderId).toBe("order_rzp_takeaway");
    }
    expect(usePaymentStore.getState().internalOrderId).toBe("ord_created_2");
    expect(usePaymentStore.getState().gatewayOrderId).toBe("order_rzp_takeaway");
  });

  it("a moved delivery drop pin is a new checkout, not a reuse", async () => {
    seedDeliveryAddress(deliveryAddress());
    useStoreSelection.setState({ activeStore: STORE, fulfillment: "delivery" });
    const repo = new PaymentRepository();

    const first = await repo.createPaymentOrder();
    expect(first.success).toBe(true);
    expect(usePaymentStore.getState().internalOrderId).toBe("ord_created_1");

    mocks.createFromCurrentContext.mockResolvedValueOnce({
      success: true,
      data: { id: "ord_created_3" },
    });
    mocks.createOrder.mockResolvedValueOnce({ success: true, data: movedPinGateway });
    // Same mode, same basket — only the drop pin moved.
    seedDeliveryAddress(deliveryAddress({ id: "addr_cus09_moved", lat: 21.19, lng: 72.79 }));

    const moved = await repo.createPaymentOrder();

    expect(moved.success).toBe(true);
    expect(mocks.createFromCurrentContext).toHaveBeenCalledTimes(2);
    expect(mocks.createFromCurrentContext.mock.calls[1][0]).toMatchObject({
      confirmedOrderId: undefined,
    });
    expect(mocks.createOrder).toHaveBeenCalledTimes(2);
    expect(mocks.createOrder.mock.calls[1][0]).toMatchObject({ orderId: "ord_created_3" });
    if (moved.success) expect(moved.data.orderId).toBe("order_rzp_moved");
    expect(usePaymentStore.getState().internalOrderId).toBe("ord_created_3");
    expect(usePaymentStore.getState().gatewayOrderId).toBe("order_rzp_moved");
  });

  it("a changed address detail at the SAME pin is a new checkout, not a reuse", async () => {
    seedDeliveryAddress(deliveryAddress({ line2: "Flat 2A", contactName: "Asha" }));
    useStoreSelection.setState({ activeStore: STORE, fulfillment: "delivery" });
    const repo = new PaymentRepository();

    const first = await repo.createPaymentOrder();
    expect(first.success).toBe(true);
    expect(usePaymentStore.getState().internalOrderId).toBe("ord_created_1");

    mocks.createFromCurrentContext.mockResolvedValueOnce({
      success: true,
      data: { id: "ord_created_4" },
    });
    mocks.createOrder.mockResolvedValueOnce({ success: true, data: movedPinGateway });
    // Same id, same line1, same coordinates — only the flat/contact changed, so
    // a pin-only recipe would have adopted the old pending document.
    seedDeliveryAddress(
      deliveryAddress({ line2: "Flat 9B", contactName: "Ravi", contactPhone: "+919000000009" }),
    );

    const changed = await repo.createPaymentOrder();

    expect(changed.success).toBe(true);
    expect(mocks.createFromCurrentContext).toHaveBeenCalledTimes(2);
    expect(mocks.createFromCurrentContext.mock.calls[1][0]).toMatchObject({
      confirmedOrderId: undefined,
    });
    expect(mocks.createOrder).toHaveBeenCalledTimes(2);
    expect(mocks.createOrder.mock.calls[1][0]).toMatchObject({ orderId: "ord_created_4" });
    if (changed.success) expect(changed.data.orderId).toBe("order_rzp_moved");
    expect(usePaymentStore.getState().internalOrderId).toBe("ord_created_4");
    expect(usePaymentStore.getState().gatewayOrderId).toBe("order_rzp_moved");
  });

  it("takeaway is unaffected by a changed, unused selected address", async () => {
    // Off-delivery the address is not part of the order, so editing it must not
    // invalidate the pending takeaway document (no duplicate order).
    seedDeliveryAddress(deliveryAddress());
    useStoreSelection.setState({ activeStore: STORE, fulfillment: "takeaway" });
    const repo = new PaymentRepository();

    const first = await repo.createPaymentOrder();
    expect(first.success).toBe(true);
    expect(mocks.createFromCurrentContext).toHaveBeenCalledTimes(1);

    seedDeliveryAddress(deliveryAddress({ id: "addr_other", line1: "2 Other Road", lat: 21.2 }));
    const again = await repo.createPaymentOrder();

    expect(again.success).toBe(true);
    expect(mocks.createFromCurrentContext).toHaveBeenCalledTimes(1);
    expect(mocks.createOrder).toHaveBeenCalledTimes(1);
    expect(usePaymentStore.getState().internalOrderId).toBe("ord_created_1");
    expect(usePaymentStore.getState().gatewayOrderId).toBe("order_rzp_1");
  });

  it("the same context still reuses its own document and gateway order", async () => {
    seedDeliveryAddress(deliveryAddress());
    useStoreSelection.setState({ activeStore: STORE, fulfillment: "delivery" });
    const repo = new PaymentRepository();

    await repo.createPaymentOrder();
    const again = await repo.createPaymentOrder();

    expect(again.success).toBe(true);
    expect(mocks.createFromCurrentContext).toHaveBeenCalledTimes(1);
    expect(mocks.createOrder).toHaveBeenCalledTimes(1);
    expect(usePaymentStore.getState().internalOrderId).toBe("ord_created_1");
    expect(usePaymentStore.getState().gatewayOrderId).toBe("order_rzp_1");
  });
});
