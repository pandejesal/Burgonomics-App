/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OrderHistoryCard } from "./OrderHistoryCard";
import type { Order } from "../models";

// The card navigates through TanStack Router and reads the reorder hook;
// mount it standalone with benign stubs (same approach as the track suite).
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a>,
}));

vi.mock("../hooks/useReorderItems", () => ({
  useReorderItems: () => ({
    reorder: vi.fn(),
    isReordering: false,
    outOfStockModal: { isOpen: false },
    confirmReorderRemaining: vi.fn(),
    dismissOutOfStockModal: vi.fn(),
  }),
}));

vi.mock("./InvoiceDownloadButton", () => ({
  InvoiceDownloadButton: () => null,
}));

const makeOrder = (fulfillment: string, terminal = false): Order =>
  ({
    id: "ord_1",
    shortCode: "BG1234",
    status: terminal
      ? { code: "DELIVERED", label: "Delivered", kind: "completed", terminal: true }
      : { code: "PLACED", label: "Order Placed", kind: "in_progress", terminal: false },
    fulfillment,
    placedAt: Date.now(),
    totals: { grandTotal: 299 },
    items: [{ name: "Big Bang Burger", quantity: 1, unitPrice: 299 }],
    payment: { method: "cod" },
  }) as unknown as Order;

describe("O-09: courier tracking promise is delivery-only", () => {
  it("offers Live Porter GPS for an active delivery order", () => {
    const html = renderToStaticMarkup(<OrderHistoryCard order={makeOrder("delivery")} />);
    expect(html).toContain("Live Porter GPS");
  });

  it("never promises courier GPS on an active dine-in order", () => {
    const html = renderToStaticMarkup(<OrderHistoryCard order={makeOrder("dinein")} />);
    expect(html).not.toContain("Live Porter GPS");
    // Honest replacement action instead of a dead courier promise.
    expect(html).toContain("View Order Status");
  });

  it("never promises courier GPS on an active takeaway order", () => {
    const html = renderToStaticMarkup(<OrderHistoryCard order={makeOrder("takeaway")} />);
    expect(html).not.toContain("Live Porter GPS");
    expect(html).toContain("View Order Status");
  });

  it("offers Reorder instead of tracking for a terminal order", () => {
    const html = renderToStaticMarkup(<OrderHistoryCard order={makeOrder("delivery", true)} />);
    expect(html).not.toContain("Live Porter GPS");
    expect(html).toContain("1-Tap Reorder");
  });
});

/**
 * ordersService.quarantine only requires `status.kind`; a legacy doc can reach
 * the list with no `status.code`. `order.status.code.includes(...)` threw on
 * that doc and took the whole history screen down with it.
 */
describe("malformed status cannot crash the history card", () => {
  const codelessOrder = () => {
    const order = makeOrder("delivery", true) as unknown as Record<string, any>;
    order.status = { label: "Delivered", kind: "completed", terminal: true };
    return order as unknown as Order;
  };

  it("renders a code-less status without throwing", () => {
    expect(() => renderToStaticMarkup(<OrderHistoryCard order={codelessOrder()} />)).not.toThrow();
  });

  it("falls back to a readable status label when both code and label are missing", () => {
    const order = makeOrder("delivery", true) as unknown as Record<string, any>;
    order.status = { kind: "completed", terminal: true };
    const html = renderToStaticMarkup(<OrderHistoryCard order={order as unknown as Order} />);
    expect(html).toContain("Status unavailable");
    expect(html).not.toContain("undefined");
  });
});
