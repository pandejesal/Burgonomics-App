/** @vitest-environment jsdom */
/**
 * R8 — the courier quote reaches the order document.
 *
 * A cash delivery order never calls `createPaymentOrder`, so nothing else would
 * record which server quote the fee came from. `createFromCurrentContext` reads
 * the ready quote from the checkout store and passes it to
 * `ordersService.createOrder` for delivery only; takeaway/dine-in stay clean.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ok } from "@/core/network/http";
import { orderRepository } from "@/features/orders/repositories/OrderRepository";
import { ordersService } from "@/features/orders/services/ordersService";
import { cartRepository } from "@/features/cart/repositories/CartRepository";
import { useCartStore } from "@/features/cart/state/cartStore";
import { useStoreSelection } from "@/features/stores/state/storeStore";
import { useAuthStore } from "@/features/auth/state/authStore";
import { useCheckoutStore } from "@/features/checkout/state/checkoutStore";
import type { CreateOrderInput, Order } from "@/features/orders/models";
import type { Store } from "@/features/stores/models/Store";
import type { CheckoutFeesState } from "@/features/checkout/state/checkoutFeesTypes";

const STORE = {
  id: "demo",
  name: "Burgonomics DEMO",
  address: "Vesu, Surat",
  area: "Vesu",
  city: "Surat",
  phone: "000",
  lat: 23.0225,
  lng: 72.5714,
  isOpen: true,
  partnerBranchId: "br_1",
  pricing: { minOrderAmount: 0 },
} as unknown as Store;

const READY_QUOTE: CheckoutFeesState = {
  status: "ready",
  orderType: "delivery",
  packagingFee: 15,
  deliveryFee: 57,
  deliveryQuoteId: "q_cash_1",
  provider: "borzo",
  expiresAt: Date.now() + 60_000,
};

let createOrder: ReturnType<typeof vi.spyOn>;

const ORDER_STUB = {
  id: "ord_quote_1",
  status: { code: "PLACED", label: "Order placed", kind: "upcoming", terminal: false },
  fulfillment: "delivery",
  payment: { method: "cod", label: "Cash on Delivery", status: "CASH_PENDING" },
  totals: { subtotal: 300, taxes: 14.29, deliveryFee: 57, grandTotal: 372 },
} as unknown as Order;

beforeEach(() => {
  createOrder = vi
    .spyOn(ordersService, "createOrder")
    .mockResolvedValue(ok(ORDER_STUB));
  vi.spyOn(cartRepository, "calculateTotals").mockResolvedValue(
    ok({
      subtotal: 300,
      itemDiscount: 0,
      promoDiscount: 0,
      taxes: 14.29,
      cgst: 7.15,
      sgst: 7.14,
      gstRate: 0.05,
      deliveryFee: 57,
      packingFee: 15,
      grandTotal: 372,
      currency: "INR",
    }),
  );

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
    promo: null,
    status: "ready",
  });
  useStoreSelection.setState({ activeStore: STORE, fulfillment: "delivery" });
  useAuthStore.setState({
    status: "authenticated",
    user: { id: "usr_quote", phone: "+910000000000", name: "Test" },
    accessToken: "access",
    refreshToken: "refresh",
  });
  useCheckoutStore.setState({
    orderNotes: "",
    tipAmount: 0,
    loyaltyPointsToRedeem: 0,
    checkoutFees: READY_QUOTE,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function lastInput(): CreateOrderInput {
  return (createOrder.mock.calls.at(-1) as unknown[])[0] as CreateOrderInput;
}

describe("R8 — delivery quote on the order create payload", () => {
  it("cash delivery writes the quote id and the quoted fee", async () => {
    const res = await orderRepository.createFromCurrentContext({
      paymentMethod: "cash",
      paymentStatus: "CASH_PENDING",
      paymentLabel: "Cash on Delivery",
    });
    expect(res.success).toBe(true);

    const input = lastInput();
    expect(input.fulfillment).toBe("delivery");
    expect(input.deliveryQuoteId).toBe("q_cash_1");
    // What the customer is charged for delivery, stored on the order.
    expect(input.totals.deliveryFee).toBe(57);
    expect(input.totals.grandTotal).toBe(372);
  });

  it("takeaway never carries a delivery quote id", async () => {
    useStoreSelection.setState({ fulfillment: "takeaway" });
    await orderRepository.createFromCurrentContext({
      paymentMethod: "cash",
      paymentStatus: "PAY_AT_STORE",
      paymentLabel: "Pay at Pickup Counter",
    });

    expect(lastInput().deliveryQuoteId).toBeUndefined();
  });
});
