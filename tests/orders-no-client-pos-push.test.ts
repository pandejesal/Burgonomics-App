/**
 * Item 1 (api-contract-audit): the customer app must never POST
 * /petpooja/pushOrder. That route is staff-only (requireRole brand_owner /
 * developer / branch_owner / branch_staff), so every customer attempt was a
 * 403 that the old code swallowed into a localStorage outbox while the order
 * still said "Pending".
 *
 * Contract pinned here:
 *   - createOrder performs ZERO Petpooja network calls.
 *   - nothing is written to the local outbox (no order is queued for a retry
 *     that can never succeed from this client).
 *   - the in-memory order still displays an honest POS status of "Pending"
 *     (the server/webhook owns the real one; firestore.rules denies the field
 *     at create, so the persisted document is unchanged either way).
 *   - a POS failure can never fail the order itself.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateOrderInput } from "../src/features/orders/models";
import { toStoreSnapshot } from "../src/features/orders/models";
import type { Store } from "../src/features/stores/models/Store";

const { setDoc, pushOrder, setItem } = vi.hoisted(() => ({
  setDoc: vi.fn().mockResolvedValue(undefined),
  pushOrder: vi.fn(async () => ({ acknowledged: true })),
  setItem: vi.fn(),
}));

vi.mock("../src/core/config/firebase", () => ({
  auth: {
    get currentUser() {
      return { uid: "cust_item_1" };
    },
  },
  db: {},
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn((...args: unknown[]) => args),
  setDoc,
  getDoc: vi.fn(),
}));

vi.mock("../src/core/integrations/petpooja", () => ({
  petpoojaGateway: {
    pushOrder,
    implementation: "live",
  },
}));

vi.mock("../src/core/logging/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { ordersService } from "../src/features/orders/services/ordersService";

const store: Store = {
  id: "str_item_1",
  name: "Surat Vesu",
  address: "Street",
  area: "Vesu",
  city: "Surat",
  phone: "+919876543210",
  lat: 21.15,
  lng: 72.77,
  imageUrl: null,
  hours: null,
  isOpen: true,
  isBusy: false,
  isRecentlyOpened: false,
  supports: { delivery: true, takeaway: true, dineIn: true },
  etaMinutes: 30,
  pickupEtaMinutes: 15,
};

function input(): CreateOrderInput {
  return {
    store: toStoreSnapshot(store),
    fulfillment: "delivery",
    items: [],
    totals: {
      subtotal: 100,
      itemDiscount: 0,
      promoDiscount: 0,
      taxes: 0,
      cgst: 0,
      sgst: 0,
      gstRate: 0,
      deliveryFee: 0,
      packingFee: 0,
      grandTotal: 100,
      currency: "INR",
    },
    payment: { method: "cod", label: "Cash", status: "pending" },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  setDoc.mockResolvedValue(undefined);
  // Simulate a browser with localStorage so an outbox write would be visible.
  vi.stubGlobal("localStorage", {
    getItem: vi.fn(() => null),
    setItem,
    removeItem: vi.fn(),
  });
});

describe("createOrder never pushes a KOT from the customer client", () => {
  it("makes no Petpooja push and leaves the POS status honestly Pending", async () => {
    const result = await ordersService.createOrder(input());

    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error.code);

    expect(pushOrder).not.toHaveBeenCalled();
    expect(result.data.petpoojaStatus).toBe("Pending");

    // No outbox entry: the write would carry the orders outbox key.
    const outboxWrites = setItem.mock.calls.filter(
      ([key]) => typeof key === "string" && key.toLowerCase().includes("outbox"),
    );
    expect(outboxWrites).toEqual([]);

    // The persisted document must not carry a client-asserted POS status or a
    // fabricated POS error (firestore.rules denies petpoojaStatus at create).
    const persisted = setDoc.mock.lastCall?.[1] as Record<string, unknown>;
    expect(persisted).not.toHaveProperty("petpoojaStatus");
    expect(persisted).not.toHaveProperty("petpoojaError");
  });
});
