/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import { InvoiceDownloadButton } from "./InvoiceDownloadButton";
import type { Order } from "../models";

type ReceiptRow = { label: string; amount: number };

/** Parse the money rows a customer actually sees in the downloaded receipt. */
const parseRows = (html: string): ReceiptRow[] => {
  const start = html.indexOf('<div class="totals">');
  const end = html.indexOf('<div class="footer">', start);
  if (start < 0 || end < 0) throw new Error("receipt totals block missing");
  const section = html.slice(start, end);
  const rows: ReceiptRow[] = [];
  const re =
    /<div class="totals-row[^"]*">\s*<span>([\s\S]*?)<\/span>\s*<span>([\s\S]*?)<\/span>\s*<\/div>/g;
  for (let match = re.exec(section); match; match = re.exec(section)) {
    const label = match[1]
      .replace(/<[^>]*>/g, "")
      .replace(/&amp;/g, "&")
      .trim();
    const value = match[2].replace(/<[^>]*>/g, "").trim();
    const money = value.match(/^(-?)\s*₹\s*([\d,]+\.\d{2})$/);
    if (!money) throw new Error(`unparseable money in "${label}": "${value}"`);
    rows.push({
      label,
      amount: Number(money[2].replace(/,/g, "")) * (money[1] ? -1 : 1),
    });
  }
  return rows;
};

const rowByLabel = (rows: ReceiptRow[], needle: RegExp): ReceiptRow => {
  const row = rows.find((candidate) => needle.test(candidate.label));
  if (!row) throw new Error(`missing receipt row: ${needle}`);
  return row;
};

/** Inclusive GST is informational; every other row is an additive money line. */
const additiveTotal = (rows: ReceiptRow[]): number =>
  rows
    .filter(
      (row) =>
        !/Incl\. GST|Total Amount Paid|Amount Collected|Amount Due|Order Total/.test(row.label),
    )
    .reduce((sum, row) => sum + row.amount, 0);

async function captureReceipt(order: Order): Promise<string> {
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
    root.render(<InvoiceDownloadButton order={order} />);
  });
  const button = container.querySelector("button");
  expect(button).toBeTruthy();
  await act(async () => {
    button!.click();
  });
  await act(async () => {
    root.unmount();
  });
  container.remove();
  return written;
}

const ev = (kind: "capture" | "cash", paise: number) => ({
  kind,
  paise,
  stampedAtMs: 1763800000000,
  by: "server",
});

const common = {
  id: "ord_m8",
  shortCode: "BG-M8",
  status: { code: "DELIVERED", label: "Delivered", kind: "completed", terminal: true },
  fulfillment: "delivery",
  store: {
    id: "s1",
    name: "Burgonomics CG Road",
    address: "Satellite, Ahmedabad",
    phone: "+91 98250 88991",
  },
  placedAt: new Date("2026-11-22T10:00:00Z").toISOString(),
};

/**
 * Backend-shaped ONLINE order that was tipped at checkout and then REPRICED by
 * the server. `totals`/`tipAmount` are the pre-reprice cart; `pricing` is the
 * server stamp and `capturedAmountPaise` is what the gateway actually charged.
 */
const tippedRepricedOnlineOrder = () =>
  ({
    ...common,
    items: [
      { name: "Veg Burger", quantity: 1, unitPrice: 109 },
      { name: "Cheese Burger", quantity: 1, unitPrice: 159 },
    ],
    // STALE client bill + an uncollected tip the gateway never charged.
    totals: {
      subtotal: 500,
      itemDiscount: 0,
      promoDiscount: 0,
      taxes: 23.81,
      packingFee: 0,
      deliveryFee: 35,
      grandTotal: 500,
    },
    tipAmount: 40,
    couponCode: "QAC7A612927",
    // AUTHORITATIVE server money: ₹268 food − ₹54 coupon + ₹45 delivery = ₹259.
    pricing: {
      foodSubtotal: 268,
      packagingFee: 0,
      deliveryFee: 45,
      gst: 10.19,
      cgst: 5.1,
      sgst: 5.09,
      discount: 54,
      loyaltyDiscount: 0,
      grandTotal: 259,
      split: {
        courierFeePaise: 4500,
        branchTransferPaise: 21400,
        totalAmountPaise: 25900,
      },
    },
    receiptEvidence: ev("capture", 25900),
    payment: {
      method: "upi",
      label: "Paid Online",
      status: "paid",
      capturedAmountPaise: 25900,
      "payment.capturedAmountPaise": 25900,
    },
  }) as unknown as Order;

/** Cash order collected by hand-over: server due/collected are authoritative. */
const tippedRepricedCashCollectedOrder = () =>
  ({
    ...common,
    items: [{ name: "Family Pack", quantity: 1, unitPrice: 268 }],
    totals: {
      subtotal: 500,
      promoDiscount: 0,
      taxes: 23.81,
      deliveryFee: 35,
      grandTotal: 500,
    },
    tipAmount: 30,
    paymentChannel: "cash",
    cashDuePaise: 25900,
    cashCollectedPaise: 25900,
    pricing: {
      foodSubtotal: 268,
      packagingFee: 0,
      deliveryFee: 45,
      gst: 10.19,
      discount: 54,
      loyaltyDiscount: 0,
      grandTotal: 259,
    },
    receiptEvidence: ev("cash", 25900),
    payment: {
      method: "cod",
      label: "Cash on Delivery",
      status: "completed",
      cashCollectedPaise: 25900,
    },
  }) as unknown as Order;

/** Cash order placed but not collected yet: only the due amount is honest. */
const tippedRepricedCashDueOrder = () =>
  ({
    ...common,
    items: [{ name: "Family Pack", quantity: 1, unitPrice: 268 }],
    totals: { subtotal: 500, taxes: 23.81, deliveryFee: 35, grandTotal: 500 },
    tipAmount: 30,
    paymentChannel: "cash",
    cashDuePaise: 25900,
    pricing: {
      foodSubtotal: 268,
      packagingFee: 0,
      deliveryFee: 45,
      gst: 10.19,
      discount: 54,
      loyaltyDiscount: 0,
      grandTotal: 259,
    },
    payment: { method: "cod", label: "Cash on Delivery", status: "pending" },
  }) as unknown as Order;

/** Legacy doc with no server money, but a tip that was never charged. */
const legacyPaidTippedOrder = () =>
  ({
    ...common,
    items: [{ name: "Hero Burger", quantity: 1, unitPrice: 199 }],
    totals: { subtotal: 199, taxes: 9.48, grandTotal: 199 },
    tipAmount: 25,
    payment: { method: "upi", label: "Paid Online", status: "paid" },
  }) as unknown as Order;

describe("M8 — receipt money is authoritative, not the stale tipped cart", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("online tipped + repriced: prints captured ₹259, not stale ₹540, no tip paid", async () => {
    const html = await captureReceipt(tippedRepricedOnlineOrder());
    const rows = parseRows(html);

    const total = rowByLabel(rows, /Total Amount Paid/);
    expect(total.amount).toBeCloseTo(259, 2);
    // Reconcile: rows built from the SERVER breakdown add up to the capture.
    expect(additiveTotal(rows)).toBeCloseTo(total.amount, 2);
    expect(rowByLabel(rows, /^Subtotal/).amount).toBeCloseTo(268, 2);
    expect(rowByLabel(rows, /Coupon discount/).label).toContain("QAC7A612927");
    expect(rowByLabel(rows, /Coupon discount/).amount).toBeCloseTo(-54, 2);
    expect(rowByLabel(rows, /Delivery Fee/).amount).toBeCloseTo(45, 2);
    // The uncollected tip and the stale cart total must never appear as paid.
    expect(rows.some((row) => /Tip/.test(row.label))).toBe(false);
    expect(html).not.toMatch(/₹\s?540\.00/);
    expect(html).not.toMatch(/₹\s?500\.00/);
  });

  it("cash collected: prints authoritative collected ₹259, uncollected tip not paid", async () => {
    const html = await captureReceipt(tippedRepricedCashCollectedOrder());
    const rows = parseRows(html);

    const total = rowByLabel(rows, /Amount Collected/);
    expect(total.amount).toBeCloseTo(259, 2);
    expect(additiveTotal(rows)).toBeCloseTo(total.amount, 2);
    expect(rows.some((row) => /Tip/.test(row.label))).toBe(false);
    expect(html).not.toMatch(/₹\s?530\.00/);
  });

  it("cash not yet collected: prints the server due ₹259, never the stale tipped ₹530", async () => {
    const html = await captureReceipt(tippedRepricedCashDueOrder());
    const rows = parseRows(html);

    const total = rowByLabel(rows, /Amount Due|Order Total/);
    expect(total.amount).toBeCloseTo(259, 2);
    expect(additiveTotal(rows)).toBeCloseTo(total.amount, 2);
    expect(rows.some((row) => /Tip/.test(row.label))).toBe(false);
    expect(html).not.toMatch(/₹\s?530\.00/);
  });

  it("legacy paid flag with no capture proof: no verified amount is claimed as paid", async () => {
    const html = await captureReceipt(legacyPaidTippedOrder());
    const rows = parseRows(html);

    // r2: a client-writable `paid` flag cannot prove money moved. The bill is
    // shown as an order total with no paid/collected claim.
    const total = rowByLabel(rows, /Order Total/);
    expect(html).not.toContain("Total Amount Paid");
    expect(html).not.toContain("Amount Collected");
    expect(total.amount).toBeCloseTo(199, 2);
    expect(additiveTotal(rows)).toBeCloseTo(total.amount, 2);
    expect(rows.some((row) => /Tip/.test(row.label))).toBe(false);
  });
});
