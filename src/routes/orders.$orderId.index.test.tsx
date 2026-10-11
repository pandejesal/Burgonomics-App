/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

// React act() needs this flag outside of Jest.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// The route mounts standalone here; TanStack's Link/useNavigate dereference
// the router, so stub them with inert implementations.
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    Link: ({ to, children, ...rest }: any) => (
      <a href={String(to)} {...rest}>
        {children}
      </a>
    ),
    // Standalone mount: the route object normally reads params from the
    // router context, which does not exist outside a <RouterProvider>.
    createFileRoute: (path: string) => (opts: any) => ({
      ...opts,
      options: opts,
      useParams: () => ({ orderId: "ord_hook_1" }),
      useSearch: () => ({}),
      useNavigate: () => vi.fn(),
      _$path: path,
    }),
  };
});

vi.mock("@/features/auth/components/ProtectedRoute", () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/shared/layouts/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/features/orders/repositories/OrderRepository", () => ({
  orderRepository: {
    getOrder: vi.fn(),
    getTracking: vi.fn(),
    buildShareMessage: vi.fn(),
    buildTrackUrl: vi.fn(),
  },
}));

import { orderRepository } from "@/features/orders/repositories/OrderRepository";
import { Route } from "./orders.$orderId.index";
import type { Order } from "@/features/orders";

const buildOrder = (overrides: Record<string, unknown> = {}) =>
  ({
    id: "ord_hook_1",
    shortCode: "BG-HOOK1",
    status: { code: "PLACED", label: "Order placed", kind: "upcoming", terminal: false },
    fulfillment: "delivery",
    store: { id: "s1", name: "Burgonomics CG Road", address: "Ahmedabad" },
    items: [{ id: "p1", name: "Smashed Burger", quantity: 1, unitPrice: 299, customizations: [] }],
    totals: { subtotal: 299, taxes: 0, deliveryFee: 0, grandTotal: 299 },
    payment: { method: "online", label: "Paid Online", status: "paid" },
    placedAt: new Date().toISOString(),
    ...overrides,
  }) as unknown as Order;

/**
 * Regression: useReorderItems() used to be called AFTER the early returns
 * (`!hydrated || loading`, `loadError`, `!order`), so the hook count flipped
 * the moment loaded data first rendered the full page — React #310 crash on
 * every order-details visit. The hook must be hoisted above the first return.
 */
describe("OrderDetailsPage — hook order (P1-1)", () => {
  beforeEach(() => {
    vi.mocked(orderRepository.getOrder).mockReset();
    vi.mocked(orderRepository.getTracking).mockReset();
    vi.mocked(orderRepository.getOrder).mockResolvedValue({
      success: true,
      data: buildOrder(),
    } as any);
    vi.mocked(orderRepository.getTracking).mockResolvedValue({
      success: true,
      data: {
        orderId: "ord_hook_1",
        status: { code: "PLACED", label: "Order placed", kind: "upcoming", terminal: false },
        steps: [],
        refreshedAt: new Date().toISOString(),
      },
    } as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const Page = (Route as unknown as { options: { component: React.ComponentType } }).options
    .component;

  async function mount() {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    // First render lands on the skeleton (hydrated=false → loading=true),
    // which is exactly the path that used to render FEWER hooks.
    await act(async () => {
      root.render(<Page />);
    });
    // Let useHydrated + the load effect settle so the page re-renders with
    // the loaded order (the render that used to blow up).
    await act(async () => {
      await Promise.resolve();
    });
    return {
      container,
      unmount: async () => {
        await act(async () => {
          root.unmount();
        });
        container.remove();
      },
    };
  }

  it("renders loaded order data without a hook-order crash", async () => {
    const { container, unmount } = await mount();
    expect(container.textContent).toContain("Burgonomics CG Road");
    expect(container.textContent).toContain("Smashed Burger");
    await unmount();
  });

  it("keeps rendering when the order genuinely does not exist", async () => {
    vi.mocked(orderRepository.getOrder).mockResolvedValue({
      success: true,
      data: null,
    } as any);
    const { container, unmount } = await mount();
    expect(container.textContent).toContain("Order not found");
    await unmount();
  });

  it("surfaces a retry instead of 'not found' when the load fails", async () => {
    vi.mocked(orderRepository.getOrder).mockResolvedValue({
      success: false,
      error: { code: "NETWORK", message: "Backend unreachable." },
    } as any);
    vi.mocked(orderRepository.getTracking).mockResolvedValue({
      success: false,
      error: { code: "NETWORK", message: "Backend unreachable." },
    } as any);
    const { container, unmount } = await mount();
    expect(container.textContent).toContain("Couldn't load this order");
    expect(container.textContent).not.toContain("Order not found");
    await unmount();
  });
});
