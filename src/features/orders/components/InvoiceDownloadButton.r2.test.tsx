/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

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
    dismissReorderRemaining: vi.fn(),
    dismissOutOfStockModal: vi.fn(),
    cancelPendingReorder: vi.fn(),
    confirmPendingReorder: vi.fn(),
    pendingConfirmation: null,
  }),
}));

import { InvoiceDownloadButton } from "./InvoiceDownloadButton";
import { OrderHistoryCard } from "./OrderHistoryCard";
import type { Order } from "../models";

type ReceiptRow = { label: string; amount: number };

const parseRows = (html: string): ReceiptRow[] => {
  const start = html.indexOf('<div class="totals">');
  const end = html.indexOf('<div class="footer">', start);
  const section = html.slice(start, end);
  const rows: ReceiptRow[] = [];
  const re =
    /<div class="totals-row[^"]*">\s*<span>([\s\S]*?)<\/span>\s*<span>([\s\S]*?)<\/span>\s*<\/div>/g;
  for (let match = re.exec(section); match; match = re.exec(section)) {
    const label = match[1].replace(/<[^>]*>/g, "").trim();
    const money = match[2]
      .replace(/<[^>]*>/g, "")
      .trim()
      .match(/^(-?)\s*₹\s*([\d,]+\.\d{2})$/);
    if (!money) continue;
    rows.push({ label, amount: Number(money[2].replace(/,/g, "")) * (money[1] ? -1 : 1) });
  }
  return rows;
};

async function captureReceipt(
  order: Order,
  refreshBeforePrint?: (order: Order) => Promise<Order | null>,
): Promise<string> {
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
    root.render(<InvoiceDownloadButton order={order} refreshBeforePrint={refreshBeforePrint} />);
  });
  const button = container.querySelector("button");
  expect(button).toBeTruthy();
  await act(async () => {
    button!.click();
  });
  await act(async () => {}); // flush the refresh microtask
  await act(async () => {
    root.unmount();
  });
  container.remove();
  return written;
}

const common = {
  id: "ord_r2",
  shortCode: "BG-R2",
  status: { code: "DELIVERED", label: "Delivered", kind: "completed", terminal: true },
  fulfillment: "delivery",
  store: { id: "s1", name: "Outlet", address: "Ahmedabad", phone: "9825088991" },
  placedAt: new Date("2026-11-22T10:00:00Z").toISOString(),
  items: [{ name: "Veg Burger", quantity: 1, unitPrice: 268 }],
};

const pricing = (grandTotal: number, foodSubtotal = 268, discount = 54) => ({
  foodSubtotal,
  packagingFee: 0,
  deliveryFee: 45,
  gst: 10.19,
  discount,
  loyaltyDiscount: 0,
  grandTotal,
});

describe("M8 r2 — verified money beats stale totals", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("1a. capture with MISMATCHED pricing: print the capture, omit non-reconciling rows", async () => {
    const order = {
      ...common,
      totals: { subtotal: 500, taxes: 23, deliveryFee: 35, grandTotal: 500 },
      tipAmount: 40,
      pricing: pricing(300),
      receiptEvidence: { kind: "capture", paise: 25900, stampedAtMs: 1763800000000, by: "server" },
      payment: { method: "upi", status: "paid", capturedAmountPaise: 25900 },
    } as unknown as Order;

    const html = await captureReceipt(order);
    const rows = parseRows(html);
    expect(rows.find((r) => /Total Amount Paid/.test(r.label))?.amount).toBeCloseTo(259, 2);
    expect(rows.some((r) => /Subtotal/.test(r.label))).toBe(false);
    expect(html).not.toMatch(/₹\s?500\.00/);
    expect(html).not.toMatch(/₹\s?300\.00/);
  });

  it("1b. capture with NO pricing: print the capture, never the stale cart total", async () => {
    const order = {
      ...common,
      totals: { subtotal: 500, taxes: 23, deliveryFee: 35, grandTotal: 500 },
      tipAmount: 40,
      receiptEvidence: { kind: "capture", paise: 25900, stampedAtMs: 1763800000000, by: "server" },
      payment: { method: "upi", status: "paid", capturedAmountPaise: 25900 },
    } as unknown as Order;

    const html = await captureReceipt(order);
    const rows = parseRows(html);
    expect(rows.find((r) => /Total Amount Paid/.test(r.label))?.amount).toBeCloseTo(259, 2);
    expect(rows.some((r) => /Subtotal/.test(r.label))).toBe(false);
    expect(html).not.toMatch(/₹\s?500\.00/);
  });

  it("1c. legacy paid flag with no capture proof: no unverified amount paid", async () => {
    const order = {
      ...common,
      totals: { subtotal: 199, taxes: 9, grandTotal: 199 },
      payment: { method: "upi", status: "paid" },
    } as unknown as Order;

    const html = await captureReceipt(order);
    expect(html).not.toContain("Total Amount Paid");
    expect(html).not.toContain("Amount Collected");
    expect(parseRows(html).some((r) => /Order Total/.test(r.label))).toBe(true);
  });

  it("1d. a zero cash due is a valid verified amount", async () => {
    const order = {
      ...common,
      totals: { subtotal: 268, taxes: 0, grandTotal: 0 },
      paymentChannel: "cash",
      cashDuePaise: 0,
      pricing: {
        foodSubtotal: 268,
        packagingFee: 0,
        deliveryFee: 0,
        gst: 0,
        discount: 268,
        loyaltyDiscount: 0,
        grandTotal: 0,
      },
      payment: { method: "cod", status: "pending" },
    } as unknown as Order;

    const html = await captureReceipt(order);
    const rows = parseRows(html);
    expect(rows.find((r) => /Amount Due/.test(r.label))?.amount).toBeCloseTo(0, 2);
    expect(rows.find((r) => /^Subtotal/.test(r.label))?.amount).toBeCloseTo(268, 2);
    expect(rows.find((r) => /Coupon discount/.test(r.label))?.amount).toBeCloseTo(-268, 2);
  });

  it("2b. refresh sees a cash collection that happened after the cached pending read", async () => {
    const cached = {
      ...common,
      totals: { subtotal: 268, taxes: 10, deliveryFee: 45, grandTotal: 259 },
      paymentChannel: "cash",
      cashDuePaise: 25900,
      pricing: pricing(259),
      payment: { method: "cod", status: "pending" },
    } as unknown as Order;
    const collected = {
      ...cached,
      cashCollectedPaise: 25900,
      receiptEvidence: { kind: "cash", paise: 25900, stampedAtMs: 1763800000000, by: "server" },
      payment: { method: "cod", status: "completed", cashCollectedPaise: 25900 },
    } as unknown as Order;

    const html = await captureReceipt(cached, async () => collected);
    const rows = parseRows(html);
    expect(rows.find((r) => /Amount Collected/.test(r.label))?.amount).toBeCloseTo(259, 2);
    expect(rows.some((r) => /Amount Due/.test(r.label))).toBe(false);
  });

  it("2c. a failed refresh withholds every payment claim", async () => {
    const order = {
      ...common,
      totals: { subtotal: 268, taxes: 10, deliveryFee: 45, grandTotal: 259 },
      pricing: pricing(259),
      receiptEvidence: { kind: "capture", paise: 25900, stampedAtMs: 1763800000000, by: "server" },
      payment: { method: "upi", status: "paid", capturedAmountPaise: 25900 },
    } as unknown as Order;

    const html = await captureReceipt(order, async () => null);
    expect(html).not.toContain("Total Amount Paid");
    expect(html).not.toContain("Amount Collected");
    expect(html).not.toContain("Amount Due");
    expect(html).toContain("Payment status unconfirmed");
  });

  it("3. repriced catalogue prices: omit price columns instead of contradicting the server", async () => {
    const order = {
      ...common,
      items: [
        { name: "Veg Burger", quantity: 1, unitPrice: 500 }, // stale catalogue price
      ],
      totals: { subtotal: 500, taxes: 23, deliveryFee: 35, grandTotal: 500 },
      pricing: pricing(259),
      receiptEvidence: { kind: "capture", paise: 25900, stampedAtMs: 1763800000000, by: "server" },
      payment: { method: "upi", status: "paid", capturedAmountPaise: 25900 },
    } as unknown as Order;

    const html = await captureReceipt(order);
    expect(html).toContain("Veg Burger");
    expect(html).not.toContain(">Rate<");
    expect(html).not.toContain(">Amount<");
    expect(html).not.toMatch(/₹\s?500\.00/);
  });

  it("4. cancelled uncollected cash order in Orders history: show cancellation, no due", async () => {
    const cancelled = {
      ...common,
      status: { code: "CANCELLED", label: "Cancelled", kind: "cancelled", terminal: true },
      totals: { subtotal: 268, taxes: 10, deliveryFee: 45, grandTotal: 259 },
      paymentChannel: "cash",
      cashDuePaise: 25900,
      cancelledAt: "2026-11-22T11:00:00Z",
      pricing: pricing(259),
      payment: { method: "cod", status: "pending" },
    } as unknown as Order;

    let written = "";
    vi.spyOn(window, "open").mockReturnValue({
      document: { open: vi.fn(), write: (html: string) => (written += html), close: vi.fn() },
    } as unknown as Window);
    vi.spyOn(window, "print").mockImplementation(() => {});

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(<OrderHistoryCard order={cancelled} />));
    const button = Array.from(container.querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").includes("Download Invoice"),
    );
    expect(button).toBeTruthy();
    await act(async () => button!.click());
    await act(async () => {});
    await act(async () => root.unmount());
    container.remove();

    expect(written).toContain("Veg Burger");
    expect(written).toContain("Cancelled");
    expect(written).not.toContain("Amount Due");
    expect(written).not.toMatch(/₹\s?259\.00/);
  });
});
