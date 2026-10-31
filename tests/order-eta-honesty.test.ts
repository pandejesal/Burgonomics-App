import { afterEach, describe, expect, it, vi } from "vitest";
import type { CreateOrderInput } from "../src/features/orders/models";
import { toStoreSnapshot } from "../src/features/orders/models";
import type { Store } from "../src/features/stores/models/Store";

const { setDoc } = vi.hoisted(() => ({ setDoc: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../src/core/config/firebase", () => ({ auth: { currentUser: { uid: "customer" } }, db: {} }));
vi.mock("firebase/firestore", () => ({ doc: vi.fn(), setDoc }));
vi.mock("../src/core/integrations/petpooja", () => ({
  petpoojaGateway: { pushOrder: vi.fn().mockResolvedValue(undefined) },
}));
import { ordersService } from "../src/features/orders/services/ordersService";

const store: Store = {
  id: "store", name: "Outlet", address: "Street", area: "Area", city: "City", phone: "",
  lat: 23, lng: 72, imageUrl: null, hours: null, isOpen: true, isBusy: false,
  isRecentlyOpened: false, supports: { delivery: true, takeaway: true, dineIn: true },
  etaMinutes: 45, pickupEtaMinutes: 17,
};
function input(fulfillment: CreateOrderInput["fulfillment"], selectedStore = store): CreateOrderInput {
  return {
    store: toStoreSnapshot(selectedStore), fulfillment, items: [],
    totals: {
      subtotal: 100, itemDiscount: 0, promoDiscount: 0, taxes: 0, cgst: 0, sgst: 0,
      gstRate: 0, deliveryFee: 0, packingFee: 0, grandTotal: 100, currency: "INR",
    },
    payment: { method: "cod", label: "Cash", status: "pending" },
  };
}
afterEach(() => vi.restoreAllMocks());

describe("store-supplied order ETA", () => {
  it.each([ ["delivery", 45], ["takeaway", 17], ["dinein", 17] ] as const)(
    "uses the real %s estimate in the result and persisted document", async (fulfillment, minutes) => {
      const now = Date.now();
      vi.spyOn(Date, "now").mockReturnValue(now);
      const result = await ordersService.createOrder(input(fulfillment));
      expect(result.success).toBe(true);
      if (!result.success) throw new Error(result.error.code);
      const estimatedAt = new Date(now + minutes * 60_000).toISOString();
      expect(result.data.estimatedAt).toBe(estimatedAt);
      expect(setDoc.mock.lastCall?.[1]).toHaveProperty("estimatedAt", estimatedAt);
    },
  );

  it.each([undefined, null, 0, -1, NaN, Infinity])("omits an unknown/invalid ETA (%s)", async (eta) => {
    const selectedStore = { ...store, etaMinutes: eta ?? null, pickupEtaMinutes: eta };
    for (const fulfillment of ["delivery", "takeaway", "dinein"] as const) {
      const result = await ordersService.createOrder(input(fulfillment, selectedStore));
      expect(result.success).toBe(true);
      if (!result.success) throw new Error(result.error.code);
      expect(result.data).not.toHaveProperty("estimatedAt");
      expect(setDoc.mock.lastCall?.[1]).not.toHaveProperty("estimatedAt");
    }
  });
});
