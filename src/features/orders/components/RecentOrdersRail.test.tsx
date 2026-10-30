/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ok } from "@/core/network/http";
import type { Order } from "../models";

const fixture = vi.hoisted(() => ({
  listOrders: vi.fn(),
  user: null as { id: string } | null,
  lines: [] as Array<{ lineId: string }>,
}));

vi.mock("../repositories/OrderRepository", () => ({
  orderRepository: { listOrders: fixture.listOrders },
}));
vi.mock("../hooks/useReorderItems", () => ({
  useReorderItems: () => ({
    reorder: vi.fn(),
    isReordering: false,
    outOfStockModal: { isOpen: false, unavailableItems: [] },
    confirmReorderRemaining: vi.fn(),
    dismissOutOfStockModal: vi.fn(),
    pendingConfirmation: null,
    confirmPendingReorder: vi.fn(),
    cancelPendingReorder: vi.fn(),
  }),
}));
vi.mock("./ReorderDialogs", () => ({ ReorderDialogs: () => null }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/features/auth/state/authStore", () => ({
  selectIsAuthenticated: (state: { user: unknown }) => Boolean(state.user),
  useAuthStore: Object.assign(
    (selector: (state: { user: unknown }) => unknown) => selector({ user: fixture.user }),
    { getState: () => ({ user: fixture.user }) },
  ),
}));
vi.mock("@/features/cart/state/cartStore", () => ({
  useCartStore: Object.assign(
    (selector: (state: { lines: Array<{ lineId: string }> }) => unknown) =>
      selector({ lines: fixture.lines }),
    { getState: () => ({ lines: fixture.lines }) },
  ),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

import { RecentOrdersRail } from "./RecentOrdersRail";

const completedOrder = (id: string, name: string): Order =>
  ({
    id,
    shortCode: "BG1",
    status: { code: "DELIVERED", label: "Delivered", kind: "completed", terminal: true },
    fulfillment: "delivery",
    store: { id: "store-A", name },
    items: [{ lineId: "l1", name: "Burger", quantity: 1, unitPrice: 299 }],
    totals: { grandTotal: 299 },
    payment: { method: "cod" },
  }) as unknown as Order;

async function renderRail() {
  const container = document.createElement("div");
  const root: Root = createRoot(container);
  await act(async () => {
    root.render(<RecentOrdersRail enabled />);
  });
  // Let the bounded history read and its state updates settle.
  for (let tick = 0; tick < 5; tick += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  return {
    container,
    text: () => container.textContent ?? "",
    cleanup: () => act(() => root.unmount()),
  };
}

beforeEach(() => {
  fixture.user = null;
  fixture.lines = [];
  fixture.listOrders.mockReset();
  fixture.listOrders.mockResolvedValue(
    ok({ items: [], page: 1, pageSize: 5, total: 0, hasMore: false }),
  );
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("RecentOrdersRail — authenticated, empty-cart only", () => {
  it("issues zero history reads for a guest", async () => {
    const view = await renderRail();
    expect(fixture.listOrders).not.toHaveBeenCalled();
    expect(view.text()).toBe("");
    view.cleanup();
  });

  it("stays hidden and read-free when the cart already has items", async () => {
    fixture.user = { id: "uid-1" };
    fixture.lines = [{ lineId: "line-1" }];
    const view = await renderRail();
    expect(fixture.listOrders).not.toHaveBeenCalled();
    expect(view.text()).toBe("");
    view.cleanup();
  });

  it("reads at most five recent completed orders for a signed-in empty cart", async () => {
    fixture.user = { id: "uid-1" };
    fixture.listOrders.mockResolvedValue(
      ok({
        items: [
          completedOrder("o1", "Outlet One"),
          {
            ...completedOrder("o2", "Cancelled Outlet"),
            status: { code: "CANCELLED", label: "Cancelled", kind: "cancelled", terminal: true },
          } as unknown as Order,
        ],
        page: 1,
        pageSize: 5,
        total: 2,
        hasMore: false,
      }),
    );

    const view = await renderRail();

    expect(fixture.listOrders).toHaveBeenCalledTimes(1);
    expect(fixture.listOrders).toHaveBeenCalledWith({ bucket: "past", pageSize: 5 });
    expect(view.text()).toContain("Order again");
    expect(view.text()).toContain("Outlet One");
    // Cancelled history is not "eligible" to reorder.
    expect(view.text()).not.toContain("Cancelled Outlet");
    view.cleanup();
  });

  it("stays hidden when the history read fails", async () => {
    fixture.user = { id: "uid-1" };
    fixture.listOrders.mockResolvedValue({
      success: false,
      error: { code: "OFFLINE", message: "offline" },
    });
    const view = await renderRail();
    expect(view.text()).toBe("");
    view.cleanup();
  });
});
