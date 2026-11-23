/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import { InvoiceDownloadButton } from "./InvoiceDownloadButton";
import type { Order } from "../models";

async function captureReceipt(order: Order): Promise<string> {
  let written = "";
  vi.spyOn(window, "open").mockReturnValue({
    document: { open: vi.fn(), write: (html: string) => (written += html), close: vi.fn() },
  } as unknown as Window);
  vi.spyOn(window, "print").mockImplementation(() => {});
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<InvoiceDownloadButton order={order} />));
  const button = container.querySelector("button");
  expect(button).toBeTruthy();
  await act(async () => button!.click());
  await act(async () => {});
  await act(async () => root.unmount());
  container.remove();
  return written;
}

describe("M8 r5 — legacy item prices follow the reconciled total", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("subtotal ₹268 vs Order Total ₹100: no price columns and no ₹268.00", async () => {
    const order = {
      id: "ord_r5",
      shortCode: "BG-R5",
      status: { code: "DELIVERED", label: "Delivered", kind: "completed", terminal: true },
      fulfillment: "delivery",
      store: { id: "s1", name: "Outlet", address: "Ahmedabad", phone: "9825088991" },
      placedAt: new Date("2026-11-22T10:00:00Z").toISOString(),
      items: [{ name: "Veg Burger", quantity: 1, unitPrice: 268 }],
      totals: { subtotal: 268, taxes: 5, deliveryFee: 10, grandTotal: 100 },
      payment: { method: "cod", status: "pending" },
    } as unknown as Order;

    const html = await captureReceipt(order);
    expect(html).toContain("Veg Burger");
    expect(html).toContain("Order Total");
    expect(html).not.toContain(">Rate<");
    expect(html).not.toContain(">Amount<");
    expect(html).not.toMatch(/₹\s?268\.00/);
  });
});
