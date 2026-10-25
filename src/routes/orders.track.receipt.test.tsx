/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Track-page receipt accordion:
 * - the receipt is NOT a GST tax invoice, so the heading must not call it one;
 * - the item count must come from the order (`items` may be absent on legacy
 *   docs) and pluralise correctly — never "1 Items" for an order with no lines.
 */
const fixture = vi.hoisted(() => ({
  order: null as unknown as Record<string, unknown>,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: Record<string, unknown>) => ({
    ...opts,
    options: opts,
    useParams: () => ({ orderId: "ord_receipt_1" }),
    useNavigate: () => vi.fn(),
  }),
  useNavigate: () => vi.fn(),
  Link: ({ to, children, ...rest }: any) => (
    <a href={String(to)} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/features/auth/components/ProtectedRoute", () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/shared/layouts/AppShell", () => ({
  AppShell: ({ children, rightSlot }: { children: React.ReactNode; rightSlot?: React.ReactNode }) => (
    <div>
      {rightSlot}
      {children}
    </div>
  ),
}));

vi.mock("@/shared/hooks/useHydrated", () => ({ useHydrated: () => true }));

vi.mock("@/core/services/haptics", () => ({
  HapticService: { impact: vi.fn(), selection: vi.fn() },
}));

vi.mock("@/features/orders/services/ordersService", () => ({
  ordersService: { cancelOrder: vi.fn() },
}));

vi.mock("@/features/orders", () => ({
  orderRepository: {
    getOrder: vi.fn(async () => ({ success: true, data: fixture.order })),
  },
  useOrdersStore: (selector: (state: unknown) => unknown) => selector({ orders: new Map() }),
  selectOrderById: (id: string) => (state: { orders: Map<string, unknown> }) =>
    state.orders.get(id) ?? null,
  useOrderTracking: () => ({
    snapshot: null,
    status: "idle",
    refresh: vi.fn(),
    error: null,
  }),
}));

vi.mock("@/features/tracking", () => ({
  DeliveryStepTracker: () => null,
  LiveOrderMap: () => null,
  RiderContactCard: () => null,
  usePorterLiveTracking: () => ({
    storeLocation: null,
    dropLocation: null,
    riderLocation: null,
    riderName: null,
    isTakeawayOrDineIn: false,
  }),
}));

import { Route } from "./orders.$orderId.track";

const buildOrder = (overrides: Record<string, unknown> = {}) =>
  ({
    id: "ord_receipt_1",
    shortCode: "BG-RCPT1",
    status: { code: "DELIVERED", label: "Delivered", kind: "completed", terminal: true },
    fulfillment: "delivery",
    store: { id: "s1", name: "Burgonomics CG Road", phone: "+91 98250 88991" },
    items: [{ name: "Hero Burger", quantity: 1, unitPrice: 199 }],
    totals: { subtotal: 199, taxes: 10, grandTotal: 199 },
    payment: { method: "online", label: "Paid Online", status: "paid" },
    placedAt: new Date("2026-10-20T10:00:00Z").toISOString(),
    ...overrides,
  }) as unknown as Record<string, unknown>;

const Page = (Route as unknown as { options: { component: React.ComponentType } }).options.component;

async function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<Page />);
  });
  return {
    container,
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

describe("track page receipt accordion", () => {
  beforeEach(() => {
    fixture.order = buildOrder();
  });

  it("labels the accordion as an order receipt, not a tax invoice", async () => {
    const { container, unmount } = await mount();

    expect(container.textContent).toContain("View Order Receipt");
    expect(container.textContent).not.toContain("Tax Invoice");
    expect(container.textContent).not.toContain("Invoice");

    await unmount();
  });

  it("shows 0 Items when a legacy order carries no item lines", async () => {
    fixture.order = buildOrder({ items: undefined });
    const { container, unmount } = await mount();

    expect(container.textContent).toContain("0 Items");
    expect(container.textContent).not.toContain("1 Items");

    await unmount();
  });

  it("pluralises a single line as 1 Item", async () => {
    const { container, unmount } = await mount();

    expect(container.textContent).toContain("1 Item");
    expect(container.textContent).not.toContain("1 Items");

    await unmount();
  });
});
