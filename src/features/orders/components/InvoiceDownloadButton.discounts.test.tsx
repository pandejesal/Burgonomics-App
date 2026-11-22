/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import { InvoiceDownloadButton } from "./InvoiceDownloadButton";
import type { Order } from "../models";

type ReceiptRow = { label: string; amount: number };

/** Read the money rows the customer actually sees in the downloaded receipt. */
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

/** Item amounts from the receipt table, so the item lines can be checked too. */
const parseItemAmounts = (html: string): number[] => {
  const table = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
  if (!table) throw new Error("receipt item table missing");
  return table[1]
    .split(/<tr>/)
    .slice(1)
    .map((row) => {
      const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => cell[1].trim());
      const last = cells[cells.length - 1] ?? "";
      const money = last.match(/^₹\s*([\d,]+\.\d{2})$/);
      if (!money) throw new Error(`unparseable item amount: "${last}"`);
      return Number(money[1].replace(/,/g, ""));
    });
};

const rowByLabel = (rows: ReceiptRow[], needle: RegExp): ReceiptRow => {
  const row = rows.find((candidate) => needle.test(candidate.label));
  if (!row) throw new Error(`missing receipt row: ${needle}`);
  return row;
};

/** GST is inclusive: it is shown but never added to the bill. */
const additiveTotal = (rows: ReceiptRow[]): number =>
  rows
    .filter((row) => !/Incl\. GST|Total Amount Paid|Order Total/.test(row.label))
    .reduce((sum, row) => sum + row.amount, 0);

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

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

const common = {
  id: "ord_f10",
  shortCode: "BG-F10",
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

/** Staging Cycle 7 shape: ₹109 + ₹159 + ₹45 delivery − ₹54 coupon = ₹259. */
const onlineCouponOrder = () =>
  ({
    ...common,
    items: [
      { name: "Veg Burger", quantity: 1, unitPrice: 109 },
      { name: "Cheese Burger", quantity: 1, unitPrice: 159 },
    ],
    totals: {
      subtotal: 268,
      itemDiscount: 0,
      promoDiscount: 54,
      taxes: 10.19,
      cgst: 5.1,
      sgst: 5.09,
      packingFee: 0,
      deliveryFee: 45,
      grandTotal: 259,
    },
    couponCode: "QAC7A612927",
    payment: { method: "upi", label: "Paid Online", status: "paid" },
  }) as unknown as Order;

/** COD coupon plus item discount, packing and a tip outside grandTotal. */
const codCouponOrder = () =>
  ({
    ...common,
    items: [{ name: "Family Pack", quantity: 1, unitPrice: 500 }],
    totals: {
      subtotal: 500,
      itemDiscount: 20,
      promoDiscount: 50,
      taxes: 20.48,
      packingFee: 10,
      deliveryFee: 40,
      grandTotal: 480,
    },
    promo: { code: "COD50", discount: 50 },
    tipAmount: 30,
    payment: { method: "cash", label: "Cash on Delivery", status: "pending" },
  }) as unknown as Order;

const noCouponOrder = () =>
  ({
    ...common,
    items: [{ name: "Hero Burger", quantity: 2, unitPrice: 199 }],
    totals: { subtotal: 398, taxes: 18.95, grandTotal: 398 },
    payment: { method: "upi", label: "Paid Online", status: "paid" },
  }) as unknown as Order;

describe("F10 — downloaded receipt money lines", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("online order with a coupon: every line adds up and the coupon code is printed", async () => {
    const html = await captureReceipt(onlineCouponOrder());
    const rows = parseRows(html);

    expect(sum(parseItemAmounts(html))).toBeCloseTo(268, 2);
    expect(rowByLabel(rows, /^Subtotal/).amount).toBeCloseTo(268, 2);
    const coupon = rowByLabel(rows, /Coupon discount/);
    expect(coupon.label).toContain("QAC7A612927");
    expect(coupon.amount).toBeCloseTo(-54, 2);
    expect(rowByLabel(rows, /Delivery Fee/).amount).toBeCloseTo(45, 2);
    expect(rows.some((row) => /Incl\. GST/.test(row.label))).toBe(true);

    const total = rowByLabel(rows, /Total Amount Paid|Order Total/);
    expect(additiveTotal(rows)).toBeCloseTo(total.amount, 2);
    expect(total.amount).toBeCloseTo(259, 2);
  });

  it("COD order with a coupon: item, coupon, packing, delivery and tip add up to the total", async () => {
    const html = await captureReceipt(codCouponOrder());
    const rows = parseRows(html);

    expect(rowByLabel(rows, /^Subtotal/).amount).toBeCloseTo(500, 2);
    expect(rowByLabel(rows, /Item discount/).amount).toBeCloseTo(-20, 2);
    const coupon = rowByLabel(rows, /Coupon discount/);
    expect(coupon.label).toContain("COD50");
    expect(coupon.amount).toBeCloseTo(-50, 2);
    expect(rowByLabel(rows, /Packaging Fee/).amount).toBeCloseTo(10, 2);
    expect(rowByLabel(rows, /Delivery Fee/).amount).toBeCloseTo(40, 2);
    expect(rowByLabel(rows, /Tip/).amount).toBeCloseTo(30, 2);

    const total = rowByLabel(rows, /Order Total/);
    expect(total.label).not.toContain("Amount Paid");
    expect(additiveTotal(rows)).toBeCloseTo(total.amount, 2);
    expect(total.amount).toBeCloseTo(510, 2);
  });

  it("order without a coupon: no discount line, items and total agree", async () => {
    const html = await captureReceipt(noCouponOrder());
    const rows = parseRows(html);

    expect(rows.some((row) => /Coupon discount|Promo|Item discount/.test(row.label))).toBe(false);
    expect(sum(parseItemAmounts(html))).toBeCloseTo(398, 2);
    expect(rowByLabel(rows, /^Subtotal/).amount).toBeCloseTo(398, 2);
    expect(rows.some((row) => /Incl\. GST/.test(row.label))).toBe(true);

    const total = rowByLabel(rows, /Total Amount Paid|Order Total/);
    expect(additiveTotal(rows)).toBeCloseTo(total.amount, 2);
    expect(total.amount).toBeCloseTo(398, 2);
  });
});
