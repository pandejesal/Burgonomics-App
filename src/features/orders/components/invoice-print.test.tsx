/** @vitest-environment jsdom */
/**
 * A6-c11 item 5 (Medium): "Download Invoice" produced a receipt page whose
 * "Print / Save as PDF" button did nothing inside the Android app.
 *
 * On Android `window.print()` is a documented NO-OP in a plain WebView, and the
 * shell had no PrintManager bridge at all — the popup opened, the receipt HTML
 * was written, `window.print()` fired into the void and the button reset itself
 * after 600 ms. The customer could not print or save the one artifact needed for
 * expense claims and refunds.
 *
 * The fix exposes `window.BurgonomicsPrint.print()` from MainActivity (Android
 * PrintManager) and makes the popup prefer it, keeping `window.print()` only as
 * the web fallback.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import {
  NATIVE_PRINT_BRIDGE,
  invoicePrintButtonOnClick,
  invoicePrintScript,
} from "@/features/orders/utils/invoicePrint";
import { InvoiceDownloadButton } from "@/features/orders/components/InvoiceDownloadButton";
import type { Order } from "@/features/orders/models";

const ORDER = {
  id: "ord_invoice",
  shortCode: "BG-INV1",
  status: { code: "DELIVERED", label: "Delivered", kind: "completed", terminal: true },
  fulfillment: "delivery",
  store: { id: "s1", name: "Outlet", address: "Ahmedabad", phone: "9825088991" },
  items: [{ name: "Veg Burger", quantity: 1, unitPrice: 268 }],
  totals: { subtotal: 268, taxes: 12.76, grandTotal: 268 },
  pricing: { foodSubtotal: 268, grandTotal: 268 },
  payment: { method: "online", label: "Paid Online", status: "paid" },
  paymentChannel: "online",
  capturedAmountPaise: 26800,
  receiptEvidence: { kind: "capture", paise: 26800, stampedAtMs: Date.now(), by: "server" },
  placedAt: "2026-11-22T10:00:00Z",
} as unknown as Order;

async function captureReceiptText(): Promise<string> {
  let written = "";
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

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<InvoiceDownloadButton order={ORDER} />);
  });
  const button = container.querySelector("button");
  await act(async () => {
    button!.click();
  });
  await act(async () => {});
  await act(async () => root.unmount());
  container.remove();
  return written;
}

describe("invoice print bridge (A6-c11 item 5)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("names the native bridge the Android shell injects", () => {
    expect(NATIVE_PRINT_BRIDGE).toBe("BurgonomicsPrint");
  });

  it("prefers the native bridge over the no-op window.print()", () => {
    const script = invoicePrintScript();
    expect(script).toContain("BurgonomicsPrint");
    expect(script).toContain("__bgnPrint");
    // The bridge must be tried BEFORE the web fallback.
    expect(script.indexOf("BurgonomicsPrint")).toBeLessThan(script.indexOf("window.print()"));
  });

  it("routes the receipt's own button through the same routine", () => {
    const onClick = invoicePrintButtonOnClick();
    expect(onClick).toContain("__bgnPrint");
  });

  it("ships the bridge script and the routed button inside the receipt HTML", async () => {
    const html = await captureReceiptText();

    expect(html).toContain("BurgonomicsPrint");
    expect(html).toContain("__bgnPrint");
    // The old inline `onclick="window.print()"` (a no-op on Android) is gone.
    expect(html).not.toContain('onclick="window.print()"');
  });

  it("actually calls the injected bridge when the popup runs it", async () => {
    const html = await captureReceiptText();
    const print = vi.fn();
    const windowPrint = vi.spyOn(window, "print").mockImplementation(() => {});
    (window as any).BurgonomicsPrint = { print };

    try {
      // The script is written into the popup; run exactly the shipped routine.
      const run = new Function("window", `${invoicePrintScript()}; return window.__bgnPrint();`);
      const result = run(window);

      expect(result).toBe(true);
      expect(print).toHaveBeenCalledTimes(1);
      // The no-op web path is NOT taken when the native bridge exists.
      expect(windowPrint).not.toHaveBeenCalled();
      expect(html.length).toBeGreaterThan(0);
    } finally {
      delete (window as any).BurgonomicsPrint;
      windowPrint.mockRestore();
    }
  });

  it("falls back to window.print() only when no bridge is present (web)", () => {
    const windowPrint = vi.spyOn(window, "print").mockImplementation(() => {});
    try {
      const run = new Function("window", `${invoicePrintScript()}; return window.__bgnPrint();`);
      expect(run(window)).toBe(true);
      expect(windowPrint).toHaveBeenCalledTimes(1);
    } finally {
      windowPrint.mockRestore();
    }
  });
});
