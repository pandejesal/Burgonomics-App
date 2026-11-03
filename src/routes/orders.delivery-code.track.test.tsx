/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Order, OrderTrackingSnapshot } from "@/features/orders/models";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
const fixture = vi.hoisted(() => ({
  order: null as Order | null,
  snapshot: null as OrderTrackingSnapshot | null,
  raw: {} as Record<string, unknown>,
  request: vi.fn(),
}));
vi.mock("@/features/tracking/services/deliveryCodeService", () => ({ retrieveDeliveryCode: fixture.request }));
vi.mock("@/features/auth/state/authStore", async () => {
  const { create } = await import("zustand");
  return {
    useAuthStore: create(() => ({ status: "authenticated", accessToken: "fixture", user: { id: "owner-a", phone: "+910000000001" } })),
    selectIsAuthenticated: () => true,
  };
});
vi.mock("@/features/orders", () => ({
  useOrdersStore: (select: (s: { byId: Record<string, Order> }) => unknown) => select({ byId: fixture.order ? { [fixture.order.id]: fixture.order } : {} }),
  selectOrderById: (id: string) => (s: { byId: Record<string, Order> }) => s.byId[id] ?? null,
  orderRepository: { getOrder: async () => ({ success: true, data: fixture.order }) },
  useOrderTracking: () => ({ status: "tracking", snapshot: fixture.snapshot, refresh: vi.fn() }),
}));
vi.mock("@/features/tracking", () => ({
  DeliveryStepTracker: () => null,
  LiveOrderMap: () => null,
  RiderContactCard: () => null,
  usePorterLiveTracking: () => ({ storeLocation: null, dropLocation: null, paymentState: "paid" }),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: { component: React.ComponentType }) => ({ ...options, useParams: () => ({ orderId: "order-a" }) }),
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children?: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock("@/shared/hooks/useHydrated", () => ({ useHydrated: () => true }));
vi.mock("@/shared/layouts/AppShell", () => ({ AppShell: ({ children }: { children?: React.ReactNode }) => <main>{children}</main> }));
vi.mock("@/features/auth/components/ProtectedRoute", () => ({ ProtectedRoute: ({ children }: { children?: React.ReactNode }) => <>{children}</> }));
vi.mock("@/features/orders/hooks/useStorePhone", () => ({ useStorePhone: () => undefined }));
vi.mock("@/core/config/firebase", () => ({ auth: { currentUser: { uid: "owner-a" } }, db: {} }));
vi.mock("firebase/firestore", () => ({ doc: () => ({}), getDoc: async () => ({ exists: () => true, data: () => fixture.raw }) }));

import TrackOrderPage from "./orders.$orderId.track";
import { ordersService } from "@/features/orders/services/ordersService";

const makeOrder = (): Order => ({
  id: "order-a", shortCode: "BG-A", fulfillment: "delivery",
  status: { code: "OUT_FOR_DELIVERY", label: "On the way", terminal: false, kind: "in_progress" },
  payment: { status: "paid", method: "online", label: "Paid" },
  store: { id: "fixture-outlet", name: "Fixture outlet", address: "Fixture address", area: "Fixture area", city: "Fixture city", phone: "" },
  items: [],
  totals: {
    grandTotal: 100,
    subtotal: 100,
    taxes: 0,
    packingFee: 0,
    deliveryFee: 0,
    promoDiscount: 0,
    itemDiscount: 0,
    cgst: 0,
    sgst: 0,
    gstRate: 0.05,
    currency: "INR",
  },
  placedAt: "2026-01-01T00:00:00.000Z",
});
let container: HTMLDivElement;
let root: Root;
async function render() { await act(async () => root.render(<TrackOrderPage />)); }
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No network allowed in delivery-code fixtures"); }));
  fixture.order = makeOrder();
  fixture.snapshot = null;
  fixture.raw = { ...makeOrder(), userId: "owner-a", customerId: "owner-a" };
  fixture.request.mockResolvedValue({ success: true, data: { orderId: "order-a", deliveryOtp: "4826", version: 2 } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("real tracking route delivery-code integration", () => {
  it("shows the genuine owner delivery code on tracking entry", async () => {
    await render();
    expect(container.querySelector("[data-sensitive=delivery-code]")?.textContent).toBe("4826");
  });

  it("observes live paid payment changes even when the lifecycle status code is unchanged", async () => {
    fixture.order = { ...makeOrder(), payment: { status: "pending", method: "online", label: "Pending" } };
    await render();
    expect(fixture.request).not.toHaveBeenCalled();
    fixture.snapshot = { orderId: "order-a", status: fixture.order.status, order: makeOrder(), steps: [], refreshedAt: "2026-11-03T00:00:00.000Z" };
    await render();
    expect(container.querySelector("[data-sensitive=delivery-code]")?.textContent).toBe("4826");
  });

  it.each([
    { deliveryOtpConsumedAt: "fixture-time" },
    { refundStatus: "processing" },
    { refundActiveClaim: "fixture-claim" },
    { refundClaimedAt: "fixture-time" },
    { reconciliation: { state: "payment_review" } },
    { payment: { status: "refunded", method: "online", label: "Refunded" } },
    { status: { code: "DELIVERED", label: "Delivered", terminal: true, kind: "completed" } },
  ])("hides for a live eligibility update without relying on the stale initial order: %j", async (update) => {
    await render();
    expect(container.querySelector("[data-sensitive=delivery-code]")?.textContent).toBe("4826");
    const liveOrder = { ...makeOrder(), ...update } as Order;
    fixture.snapshot = { orderId: "order-a", status: liveOrder.status, order: liveOrder, steps: [], refreshedAt: "2026-11-03T00:00:00.000Z" };
    await render();
    expect(container.querySelector("[data-sensitive]")).toBeNull();
  });
});

describe("existing subscription refresh publishes an ephemeral normalized order, never an OTP", () => {
  it.each(["completed", "captured"])("normalizes server %s to display paid after the existing live server read", async (status) => {
    fixture.raw = { ...fixture.raw, paymentStatus: status, payment: { method: "online", status, label: "Online" }, deliveryOtp: "1111", deliveryOtpHash: "fixture-hash" };
    const result = await ordersService.getTracking("order-a");
    expect(result).toMatchObject({ success: true, data: { order: { payment: { status: "paid" } } } });
    if (result.success) {
      expect(result.data?.order).not.toHaveProperty("deliveryOtp");
      expect(result.data?.order).not.toHaveProperty("deliveryOtpHash");
    }
    expect(fixture.raw.payment).toMatchObject({ status }); // normalization never mutates/writes source
  });

  it("publishes fresh refund and consumption signals via that same subscription refresh", async () => {
    await ordersService.getTracking("order-a");
    fixture.raw = { ...fixture.raw, deliveryOtpConsumedAt: "fixture-time", refundStatus: "processing", payment: { status: "refunded", method: "online", refundStatus: "processing" } };
    expect(await ordersService.getTracking("order-a")).toMatchObject({ success: true, data: { order: { deliveryOtpConsumedAt: "fixture-time", refundStatus: "processing", payment: { status: "refunded", refundStatus: "processing" } } } });
  });
});
