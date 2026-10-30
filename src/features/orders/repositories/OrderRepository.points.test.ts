/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ok } from "@/core/network/http";

const cartRepo = vi.hoisted(() => ({ calculateTotals: vi.fn() }));

vi.mock("@/features/cart/repositories/CartRepository", () => ({
  cartRepository: cartRepo,
  CartRepository: class {},
}));
vi.mock("@/features/orders/services/ordersService", () => ({
  ordersService: {},
}));

import { OrderRepository } from "./OrderRepository";
import { useCartStore } from "@/features/cart/state/cartStore";
import { useCheckoutStore } from "@/features/checkout/state/checkoutStore";
import { useStoreSelection } from "@/features/stores/state/storeStore";
import type { CartTotals } from "@/features/cart/models";

const totals: CartTotals = {
  subtotal: 299,
  itemDiscount: 0,
  promoDiscount: 0,
  taxes: 14.24,
  cgst: 7.12,
  sgst: 7.12,
  gstRate: 0.05,
  deliveryFee: 40,
  packingFee: 20,
  grandTotal: 359,
  currency: "INR",
};

beforeEach(() => {
  cartRepo.calculateTotals.mockReset();
  cartRepo.calculateTotals.mockResolvedValue(ok(totals));
  useCartStore.setState({
    lines: [
      {
        lineId: "line-1",
        productId: "prod-1",
        storeId: "store-A",
        name: "Big Bang Burger",
        unitPrice: 299,
        quantity: 1,
        modifiers: [],
        availability: "available",
      },
    ],
    storeId: "store-A",
    status: "ready",
  });
  useStoreSelection.setState({
    activeStore: {
      id: "store-A",
      name: "Outlet A",
      address: "Somewhere",
      area: "Area",
      city: "City",
      phone: "9999999999",
      lat: 23,
      lng: 72,
    } as never,
    fulfillment: "delivery",
  });
  useCheckoutStore.getState().reset();
});

describe("OrderRepository — D31–D33 points zero guard", () => {
  it("never forwards a legacy persisted redemption to the order payload", async () => {
    // Legacy state written by an older build / hand-edited storage.
    useCheckoutStore.setState({ loyaltyPointsToRedeem: 480 });

    const createOrder = vi.fn().mockResolvedValue(
      ok({
        id: "order-1",
        status: { code: "CONFIRMED", label: "Confirmed", kind: "upcoming", terminal: false },
        placedAt: Date.now(),
        totals,
        items: [],
        store: { id: "store-A", name: "Outlet A" },
        payment: { method: "cod", label: "Cash", status: "CASH_PENDING" },
      } as never),
    );
    const repository = new OrderRepository({ createOrder } as never);

    await repository.createFromCurrentContext({ paymentMethod: "cash" });

    expect(createOrder).toHaveBeenCalledTimes(1);
    expect(createOrder.mock.calls[0][0].loyaltyPointsRedeemed).toBe(0);
  });
});
