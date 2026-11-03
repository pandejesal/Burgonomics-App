/**
 * The tracking projection is the object the route merges into its order state
 * and the live subscription publishes. It must be a whitelist: historical
 * order docs can still carry `deliveryOtp` plaintext and `deliveryOtpHash`,
 * and neither may ever appear in the snapshot (or its JSON) — even when the
 * module cache was seeded by a full `getOrder` read of that raw doc.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  uid: "uid_proj_a" as string | null,
  getDoc: vi.fn(),
}));

vi.mock("@/core/config/firebase", () => ({
  auth: {
    get currentUser() {
      return fixture.uid ? { uid: fixture.uid } : null;
    },
    authStateReady: () => Promise.resolve(),
  },
  db: { kind: "db" },
}));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, path: string, id: string) => ({ path, id }),
  getDoc: (ref: unknown) => fixture.getDoc(ref),
  collection: (_db: unknown, path: string) => ({ path }),
  query: (ref: unknown, ...constraints: unknown[]) => ({ ref, constraints }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  getDocs: async () => ({ docs: [], forEach: () => {} }),
}));

import { ordersService } from "./ordersService";

const ORDER_ID = "ord_projection_1";

function rawOrder(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ORDER_ID,
    shortCode: "BG-P1",
    fulfillment: "delivery",
    status: { code: "OUT_FOR_DELIVERY", label: "On the way", kind: "in_progress", terminal: false },
    store: { id: "outlet_1", name: "Outlet", address: "", area: "", city: "", phone: "" },
    items: [],
    totals: { grandTotal: 420, subtotal: 420, taxes: 0, packingFee: 0, deliveryFee: 0, promoDiscount: 0 },
    placedAt: "2026-11-01T10:00:00.000Z",
    userId: "uid_proj_a",
    customerId: "uid_proj_a",
    payment: { method: "online", label: "Paid", status: "captured", transactionId: "pay_proj_1" },
    deliveryStatus: "dispatched",
    ...overrides,
  };
}

function keysIn(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const entry of value) keysIn(entry, keys);
    return keys;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      keys.add(key);
      keysIn(child, keys);
    }
  }
  return keys;
}

function docFor(raw: Record<string, unknown>) {
  fixture.getDoc.mockResolvedValue({ exists: () => true, id: ORDER_ID, data: () => raw });
}

let scope = 0;
beforeEach(() => {
  vi.clearAllMocks();
  // A fresh uid per test clears the module's per-account order cache.
  scope += 1;
  fixture.uid = `uid_proj_${scope}`;
  docFor(rawOrder({ userId: fixture.uid, customerId: fixture.uid }));
});

describe("tracking projection never publishes delivery secrets", () => {
  it("drops top-level legacy plaintext and hash from the whole snapshot", async () => {
    const raw = rawOrder({
      userId: fixture.uid,
      customerId: fixture.uid,
      deliveryOtp: "4826",
      deliveryOtpHash: "sha256:legacy-plaintext-hash",
    });
    docFor(raw);

    const result = await ordersService.getTracking(ORDER_ID);

    expect(result.success).toBe(true);
    if (!result.success) return;
    const snapshot = result.data;
    expect(snapshot).not.toBeNull();

    const keys = keysIn(snapshot);
    expect(keys.has("deliveryOtp")).toBe(false);
    expect(keys.has("deliveryOtpHash")).toBe(false);

    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain("4826");
    expect(serialized).not.toContain("sha256:legacy-plaintext-hash");
    // The projection still carries the display facts the route needs.
    expect(snapshot).toMatchObject({
      orderId: ORDER_ID,
      order: { id: ORDER_ID, fulfillment: "delivery", payment: { status: "paid" } },
    });
  });

  it("drops plaintext hidden inside the payment block or an unknown meta bag", async () => {
    const raw = rawOrder({
      userId: fixture.uid,
      customerId: fixture.uid,
      payment: {
        method: "online",
        label: "Paid",
        status: "completed",
        transactionId: "pay_proj_2",
        deliveryOtp: "4826",
        deliveryOtpHash: "hash-in-payment",
      },
      meta: { deliveryOtp: "4826", deliveryOtpHash: "hash-in-meta" },
    });
    docFor(raw);

    const result = await ordersService.getTracking(ORDER_ID);
    expect(result.success).toBe(true);
    if (!result.success) return;

    const serialized = JSON.stringify(result.data);
    expect(serialized).not.toContain("4826");
    expect(serialized).not.toContain("hash-in-payment");
    expect(serialized).not.toContain("hash-in-meta");
    expect(keysIn(result.data).has("meta")).toBe(false);
    expect(keysIn(result.data).has("deliveryOtpHash")).toBe(false);
  });

  it("stays clean when the cache was first seeded by a full getOrder read of the raw doc", async () => {
    const raw = rawOrder({
      userId: fixture.uid,
      customerId: fixture.uid,
      deliveryOtp: "4826",
      deliveryOtpHash: "cached-hash",
    });
    docFor(raw);

    const loaded = await ordersService.getOrder(ORDER_ID);
    expect(loaded.success).toBe(true);

    const tracking = await ordersService.getTracking(ORDER_ID);
    expect(tracking.success).toBe(true);
    if (!tracking.success) return;
    expect(JSON.stringify(tracking.data)).not.toContain("4826");
    expect(JSON.stringify(tracking.data)).not.toContain("cached-hash");
    expect(keysIn(tracking.data).has("deliveryOtp")).toBe(false);
  });
});
