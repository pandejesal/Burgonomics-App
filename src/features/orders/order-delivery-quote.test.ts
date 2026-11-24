/** @vitest-environment jsdom */
/** R8: cash and online server-create payloads carry the delivery quote reference. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ok } from "@/core/network/http";

const h = vi.hoisted(() => ({ cashCreate: vi.fn(), onlineCreate: vi.fn() }));
vi.mock("@/features/payments/services/cashOrderService", () => ({
  createCashOrderOnServer: h.cashCreate,
}));
vi.mock("@/features/payments/services/onlineDraftService", () => ({
  createOnlineDraftOnServer: h.onlineCreate,
}));
vi.mock("@/features/orders/services/ordersService", () => ({
  ordersService: {
    getOrder: async (id: string) => ({
      success: true,
      data: { id, status: { code: "PLACED", kind: "upcoming", terminal: false } },
    }),
  },
}));
vi.mock("@/features/auth/utils/scopedPersistence", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/auth/utils/scopedPersistence")>()),
  currentScopedUid: () => "usr_quote",
}));
vi.mock("@/features/addresses", () => ({
  useAddressStore: Object.assign(
    (select: (state: unknown) => unknown) => select({ selectedId: "addr_1" }),
    { getState: () => ({ selectedId: "addr_1" }) },
  ),
  selectSelectedAddress: () => ({
    id: "addr_1",
    label: "home",
    line1: "1 Main",
    city: "Surat",
    lat: 21.2,
    lng: 72.8,
  }),
}));

import { orderRepository } from "@/features/orders/repositories/OrderRepository";
import { cartRepository } from "@/features/cart/repositories/CartRepository";
import { useCartStore } from "@/features/cart/state/cartStore";
import { useStoreSelection } from "@/features/stores/state/storeStore";
import { useCheckoutStore } from "@/features/checkout/state/checkoutStore";
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
const status = { code: "PLACED", label: "Order placed", kind: "upcoming", terminal: false };

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: { request: async (_key: string, callback: () => unknown) => callback() },
  });
  h.cashCreate.mockReset().mockImplementation(async (request: { orderId: string }) =>
    ok({
      orderId: request.orderId,
      replayed: false,
      paymentMethod: "cod",
      paymentChannel: "cash",
      cashDuePaise: 37200,
      totals: {},
      status,
    }),
  );
  h.onlineCreate
    .mockReset()
    .mockImplementation(async (request: { orderId: string; attemptId: string }) =>
      ok({
        orderId: request.orderId,
        id: request.orderId,
        attemptId: request.attemptId,
        replayed: false,
        amountPaise: 37200,
        totals: {},
        status,
      }),
    );
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
  useCheckoutStore.getState().reset();
  useCheckoutStore.setState({ checkoutFees: READY_QUOTE });
});
afterEach(() => vi.restoreAllMocks());

describe("R8 — delivery quote on server order-create payloads", () => {
  it("cash delivery sends the quote and saved address references, never client money", async () => {
    const result = await orderRepository.createCashOrder();
    expect(result.success).toBe(true);
    const body = h.cashCreate.mock.calls[0][0];
    expect(body).toMatchObject({
      orderType: "delivery",
      deliveryQuoteId: "q_cash_1",
      addressId: "addr_1",
    });
    expect(body).not.toHaveProperty("total");
    expect(body).not.toHaveProperty("pricing");
  });

  it("online draft sends the same quote/address references", async () => {
    const result = await orderRepository.createOnlineDraft();
    expect(result.success).toBe(true);
    expect(h.onlineCreate.mock.calls[0][0]).toMatchObject({
      orderType: "delivery",
      deliveryQuoteId: "q_cash_1",
      addressId: "addr_1",
    });
  });

  it("takeaway never carries a delivery quote or address", async () => {
    useStoreSelection.setState({ fulfillment: "takeaway" });
    await orderRepository.createCashOrder();
    await orderRepository.clearPendingOnlineOrder();
    expect(h.cashCreate.mock.calls[0][0]).not.toHaveProperty("deliveryQuoteId");
    expect(h.cashCreate.mock.calls[0][0]).not.toHaveProperty("addressId");
  });
});
