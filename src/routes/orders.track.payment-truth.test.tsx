/** @vitest-environment jsdom */
/**
 * A6-c11 item 2 (High): the tracking receipt claimed "Total Paid" in success
 * green for money nobody had handed over.
 *
 * `orders.$orderId.track.tsx` rendered
 *   `unpaid ? "Order total (…)" : "Total Paid (…)"` in `text-success`
 * so a COD / pay-at-store order (paymentState "cash") and an online order still
 * inside the two-minute "confirming" window both claimed to be paid, while the
 * downloadable receipt for the SAME order correctly printed "Amount Due".
 *
 * These assertions are on the rendered DOM of the real route: the label AND the
 * colour class, so a revert of either half fails.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const fixture = vi.hoisted(() => ({
  order: null as unknown as Record<string, unknown>,
  paymentState: "paid" as string,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: Record<string, unknown>) => ({
    ...opts,
    options: opts,
    useParams: () => ({ orderId: "ord_receipt_paid" }),
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
  AppShell: ({
    children,
    rightSlot,
  }: {
    children: React.ReactNode;
    rightSlot?: React.ReactNode;
  }) => (
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
    paymentState: fixture.paymentState,
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

const Page = (Route as unknown as { options: { component: React.ComponentType } }).options
  .component;

function buildOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "ord_receipt_paid",
    shortCode: "BG-PAID1",
    status: { code: "DELIVERED", label: "Delivered", kind: "completed", terminal: true },
    fulfillment: "delivery",
    store: { id: "s1", name: "Burgonomics CG Road", phone: "+91 98250 88991" },
    items: [{ name: "Hero Burger", quantity: 1, unitPrice: 199 }],
    totals: { subtotal: 199, taxes: 10, grandTotal: 199 },
    payment: {
      method: "online",
      label: "Paid Online",
      status: "paid",
      capturedAmountPaise: 19900,
    },
    placedAt: new Date("2026-10-20T10:00:00Z").toISOString(),
    ...overrides,
  } as unknown as Record<string, unknown>;
}

/** The captured receipt stamp the server writes in the same transaction. */
const captureStamp = (paise: number) => ({
  receiptEvidence: { kind: "capture", paise, stampedAtMs: Date.now(), by: "server" },
});
const cashStamp = (paise: number) => ({
  receiptEvidence: { kind: "cash", paise, stampedAtMs: Date.now(), by: "server" },
});

async function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<Page />);
  });
  // Open the receipt accordion.
  const toggle = Array.from(container.querySelectorAll("button")).find((b) =>
    (b.textContent ?? "").includes("View Order Receipt"),
  );
  if (toggle) {
    await act(async () => {
      toggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  }
  return {
    container,
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

function totalRow(container: HTMLElement) {
  const amount = container.querySelector('[data-testid="receipt-total-amount"]');
  const label = amount?.previousElementSibling;
  return { label: label?.textContent ?? "", amount: amount as HTMLElement | null };
}

describe("track receipt bottom row claims payment only with server proof", () => {
  beforeEach(() => {
    fixture.paymentState = "paid";
    fixture.order = buildOrder(captureStamp(19900));
  });

  it("says Paid and uses success ink when the server stamped the capture", async () => {
    const { container, unmount } = await mount();
    const row = totalRow(container);
    expect(row.label).toMatch(/paid/i);
    expect(row.amount?.className).toContain("text-success");
    await unmount();
  });

  it("does NOT claim payment for an uncollected CASH order", async () => {
    fixture.paymentState = "cash";
    fixture.order = buildOrder({
      payment: { method: "cod", label: "Cash on Delivery", status: "CASH_PENDING" },
      paymentChannel: "cash",
      cashDuePaise: 19900,
    });
    const { container, unmount } = await mount();
    const row = totalRow(container);
    expect(row.label).not.toMatch(/total paid/i);
    expect(row.label).toMatch(/amount due/i);
    // Neutral ink: an unpaid figure must never read as success.
    expect(row.amount?.className).not.toContain("text-success");
    await unmount();
  });

  it("does NOT claim payment while an online payment is only confirming", async () => {
    fixture.paymentState = "confirming";
    fixture.order = buildOrder({
      payment: { method: "online", label: "Pay Online", status: "pending" },
    });
    const { container, unmount } = await mount();
    const row = totalRow(container);
    expect(row.label).not.toMatch(/total paid/i);
    expect(row.amount?.className).not.toContain("text-success");
    await unmount();
  });

  it("says Collected only for cash the handover actually recorded", async () => {
    fixture.paymentState = "paid";
    fixture.order = buildOrder({
      payment: { method: "cod", label: "Cash on Delivery", status: "paid" },
      paymentChannel: "cash",
      cashCollectedPaise: 19900,
      cashDuePaise: 19900,
      ...cashStamp(19900),
    });
    const { container, unmount } = await mount();
    const row = totalRow(container);
    expect(row.label).toMatch(/collected/i);
    expect(row.amount?.className).toContain("text-success");
    await unmount();
  });

  it("withholds a money claim the server never stamped (legacy paid flag)", async () => {
    fixture.paymentState = "paid";
    fixture.order = buildOrder({
      payment: { method: "online", label: "Paid Online", status: "paid" },
    });
    const { container, unmount } = await mount();
    const row = totalRow(container);
    expect(row.label).not.toMatch(/total paid/i);
    expect(row.amount?.className).not.toContain("text-success");
    // The figure is still the receipt total, just not presented as paid.
    expect(row.amount?.textContent).toContain("199");
    await unmount();
  });
});
