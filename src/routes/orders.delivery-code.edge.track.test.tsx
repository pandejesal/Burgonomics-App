/**
 * Route-level edge cases for the delivery-code card:
 *  - a tracking snapshot that CONTRADICTS the loaded order (order still says
 *    active, snapshot says cancelled) must hide the code in the same commit,
 *  - a snapshot for a different order id is stale and must be ignored,
 *  - an in-app account switch re-scopes the card to the new owner's code,
 *  - an OTP carried inside the snapshot's order body is never rendered.
 */
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
import { useAuthStore } from "@/features/auth/state/authStore";

const makeOrder = (): Order => ({
  id: "order-a", shortCode: "BG-A", fulfillment: "delivery",
  status: { code: "OUT_FOR_DELIVERY", label: "On the way", terminal: false, kind: "in_progress" },
  payment: { status: "paid", method: "online", label: "Paid" },
  deliveryOtpVersion: 2,
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
const snapshotOf = (order: Order, status = order.status): OrderTrackingSnapshot => ({
  orderId: order.id,
  status,
  order,
  steps: [],
  refreshedAt: "2026-11-03T00:00:00.000Z",
});
const success = (deliveryOtp = "4826") => ({
  success: true as const,
  data: { orderId: "order-a", deliveryOtp, version: 2 as const },
});
function deferred() {
  let resolve!: (value: ReturnType<typeof success>) => void;
  const promise = new Promise<ReturnType<typeof success>>((res) => { resolve = res; });
  return { promise, resolve };
}
let container: HTMLDivElement;
let root: Root;
async function render() { await act(async () => root.render(<TrackOrderPage />)); }
const code = () => container.querySelector("[data-sensitive=delivery-code]")?.textContent;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No network allowed in delivery-code fixtures"); }));
  useAuthStore.setState({ status: "authenticated", accessToken: "fixture", user: { id: "owner-a", phone: "+910000000001" } });
  fixture.order = makeOrder();
  fixture.snapshot = null;
  fixture.raw = { ...makeOrder(), userId: "owner-a", customerId: "owner-a" };
  fixture.request.mockResolvedValue(success());
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("tracking snapshot vs loaded order disagreement", () => {
  it("hides the code when the order still says active but the snapshot says cancelled", async () => {
    await render();
    expect(code()).toBe("4826");

    fixture.snapshot = snapshotOf(makeOrder(), {
      code: "CANCELLED",
      label: "Cancelled",
      kind: "cancelled",
      terminal: true,
    });
    await render();

    expect(container.querySelector("[data-sensitive]")).toBeNull();
    // Eligibility is display-only: hiding must not trigger a second fetch.
    expect(fixture.request).toHaveBeenCalledTimes(1);
  });

  it("hides the code when only the snapshot order body records the cancellation", async () => {
    await render();
    expect(code()).toBe("4826");

    fixture.snapshot = snapshotOf({
      ...makeOrder(),
      cancelledAt: "2026-11-03T00:05:00.000Z",
      cancellationStatus: "cancelled",
    });
    await render();

    expect(container.querySelector("[data-sensitive]")).toBeNull();
    expect(fixture.request).toHaveBeenCalledTimes(1);
  });

  it("ignores a snapshot that belongs to a different order id", async () => {
    fixture.snapshot = snapshotOf(
      { ...makeOrder(), id: "order-b", cancelledAt: "2026-11-03T00:05:00.000Z" },
      { code: "CANCELLED", label: "Cancelled", kind: "cancelled", terminal: true },
    );
    await render();

    expect(code()).toBe("4826");
  });
});

describe("account scope and snapshot payload at the route", () => {
  it("re-scopes to the new account's own code after an in-app switch", async () => {
    const second = deferred();
    fixture.request
      .mockResolvedValueOnce(success("4826"))
      .mockReturnValueOnce(second.promise);

    await render();
    expect(code()).toBe("4826");

    await act(async () => useAuthStore.setState({ user: { id: "owner-b", phone: "+910000000002" } }));
    expect(container.querySelector("[data-sensitive]")).toBeNull();
    expect(fixture.request).toHaveBeenCalledTimes(2);
    expect(fixture.request.mock.calls[1][1]).toBe("owner-b");

    await act(async () => second.resolve(success("7351")));
    expect(code()).toBe("7351");
  });

  it("never renders an OTP carried by the snapshot order body when the endpoint refuses", async () => {
    fixture.request.mockResolvedValue({
      success: false,
      error: { code: "DELIVERY_CODE_UNAVAILABLE", message: "fixture", retryable: false },
    });
    fixture.snapshot = snapshotOf({
      ...makeOrder(),
      deliveryOtp: "9999",
      deliveryOtpHash: "legacy-plaintext-hash",
    } as Order);
    await render();

    expect(container.querySelector("[data-sensitive]")).toBeNull();
    expect(container.textContent).not.toContain("9999");
    expect(container.textContent).not.toContain("legacy-plaintext-hash");
  });
});
