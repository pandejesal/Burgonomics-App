/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ok } from "@/core/network/http";

const h = vi.hoisted(() => ({
  calculateTotals: vi.fn(),
  createDraft: vi.fn(),
}));
vi.mock("@/features/cart/repositories/CartRepository", () => ({
  cartRepository: { calculateTotals: h.calculateTotals },
}));
vi.mock("@/features/payments/services/onlineDraftService", () => ({
  createOnlineDraftOnServer: h.createDraft,
}));
vi.mock("@/features/orders/services/ordersService", () => ({ ordersService: {} }));
vi.mock("@/features/auth/utils/scopedPersistence", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/auth/utils/scopedPersistence")>()),
  currentScopedUid: () => "uid_points",
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
  deliveryFee: 0,
  packingFee: 20,
  grandTotal: 319,
  currency: "INR",
};

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: { request: async (_key: string, callback: () => unknown) => callback() },
  });
  h.calculateTotals.mockReset().mockResolvedValue(ok(totals));
  h.createDraft
    .mockReset()
    .mockImplementation(async (request: { orderId: string; attemptId: string }) =>
      ok({
        orderId: request.orderId,
        id: request.orderId,
        attemptId: request.attemptId,
        replayed: false,
        amountPaise: 31900,
        totals: {},
        status: { code: "PLACED", label: "Placed", kind: "upcoming", terminal: false },
      }),
    );
  useCartStore.setState({
    lines: [
      {
        lineId: "line-1",
        productId: "prod-1",
        storeId: "store-A",
        name: "Burger",
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
      phone: "",
      lat: 23,
      lng: 72,
    } as never,
    fulfillment: "takeaway",
  });
  useCheckoutStore.getState().reset();
  useCheckoutStore.setState({ loyaltyPointsToRedeem: 480 });
});

describe("OrderRepository — D31–D33 points zero guard", () => {
  it("never forwards legacy redemption to the server draft", async () => {
    const repository = new OrderRepository();
    const result = await repository.createOnlineDraft();
    expect(result.success).toBe(true);
    expect(h.createDraft).toHaveBeenCalledTimes(1);
    expect(h.createDraft.mock.calls[0][0]).not.toHaveProperty("loyaltyPointsToRedeem");
  });
});
