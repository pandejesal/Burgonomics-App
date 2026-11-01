/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import { InvoiceDownloadButton } from "./InvoiceDownloadButton";
import { APP } from "@/core/constants/app";
import type { Order } from "../models";

const buildOrder = () =>
  ({
    id: "ord_invoice_1",
    shortCode: "BG-INV1",
    status: { code: "DELIVERED", label: "Delivered", kind: "completed", terminal: true },
    fulfillment: "delivery",
    store: { id: "s1", name: "Burgonomics CG Road", address: "Satellite, Ahmedabad", phone: "+91 98250 88991" },
    items: [{ name: "Hero Burger", quantity: 2, unitPrice: 199 }],
    totals: { subtotal: 398, taxes: 19, grandTotal: 398 },
    payment: { method: "online", label: "Paid Online", status: "paid" },
    placedAt: new Date("2026-10-20T10:00:00Z").toISOString(),
  }) as unknown as Order;

describe("InvoiceDownloadButton — seller identity comes from APP", () => {
  let written = "";

  beforeEach(() => {
    written = "";
    vi.spyOn(window, "open").mockReturnValue({
      document: {
        open: vi.fn(),
        write: (html: string) => {
          written += html;
        },
        close: vi.fn(),
      },
    } as unknown as Window);
    vi.spyOn(window, "print").mockImplementation(() => {});
  });

  it("renders the legal entity, registered address and GSTIN from APP, not a hardcoded company", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<InvoiceDownloadButton order={buildOrder()} />);
    });

    // Render assertion: the visible action label.
    expect(container.textContent).toContain("Download Invoice");

    const button = container.querySelector("button");
    expect(button).toBeTruthy();
    await act(async () => {
      button!.click();
    });

    expect(written).not.toBe("");
    expect(written).toContain(APP.legalEntity);
    expect(written).toContain(APP.registeredAddress);
    expect(written).toContain(APP.gstin);
    // The old hardcoded seller must never reappear.
    expect(written).not.toContain("Burgonomics Foodworks Pvt. Ltd.");
    // A masked registration number is unset, never printed as filler.
    expect(written).not.toContain(APP.fssaiLicense);
    expect(written).toContain("not a GST tax invoice");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
