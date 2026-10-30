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
  it("offers delivery tracking without inventing a courier or a live GPS feed", () => {
    const html = renderToStaticMarkup(<OrderHistoryCard order={makeOrder("delivery")} />);
    expect(html).toContain("Track delivery");
    expect(html).not.toContain("Porter");
    expect(html).not.toContain("GPS");
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
    expect(html).toContain("Reorder");
  });
});
