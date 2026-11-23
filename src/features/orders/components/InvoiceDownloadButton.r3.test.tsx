/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const repoFixture = vi.hoisted(() => ({
  serverDoc: null as Record<string, any> | null,
  getDocFromServer: vi.fn(),
  getDoc: vi.fn(),
}));

vi.mock("@/core/config/firebase", () => ({
  auth: {
    currentUser: { uid: "uid_1" },
    authStateReady: () => Promise.resolve(),
  },
  db: { kind: "db" },
}));

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, path: string, id: string) => ({ path, id }),
  getDoc: (ref: unknown) => repoFixture.getDoc(ref),
  getDocFromServer: (ref: unknown) => repoFixture.getDocFromServer(ref),
}));

import { InvoiceDownloadButton } from "./InvoiceDownloadButton";
import { orderRepository } from "../repositories/OrderRepository";
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
    document: { open: vi.fn(), write: (html: string) => (written += html), close: vi.fn() },
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
  await act(async () => button!.click());
  await act(async () => {});
  await act(async () => root.unmount());
  container.remove();
  return written;
}

const base = {
  id: "ord_r3",
  shortCode: "BG-R3",
  status: { code: "DELIVERED", label: "Delivered", kind: "completed", terminal: true },
  fulfillment: "delivery",
  store: { id: "s1", name: "Outlet", address: "Ahmedabad", phone: "9825088991" },
  placedAt: new Date("2026-11-22T10:00:00Z").toISOString(),
  items: [{ name: "Veg Burger", quantity: 1, unitPrice: 268 }],
};

const pricing = (grandTotal: number, foodSubtotal = 268) => ({
  foodSubtotal,
  packagingFee: 0,
  deliveryFee: 45,
  gst: 10.19,
  discount: 54,
  loyaltyDiscount: 0,
  grandTotal,
});

const serverDocFor = (overrides: Record<string, any> = {}) => ({
  customerId: "uid_1",
  userId: "uid_1",
  shortCode: "BG-R3",
  status: { code: "PREPARING", label: "Preparing", kind: "in_progress", terminal: false },
  fulfillment: "delivery",
  store: base.store,
  items: base.items,
  totals: { subtotal: 268, taxes: 10.19, deliveryFee: 45, grandTotal: 259 },
  pricing: pricing(259),
  placedAt: base.placedAt,
  payment: { method: "cod", status: "pending" },
  ...overrides,
});

const snapshot = (data: Record<string, any> | null) => ({
  exists: () => data !== null,
  data: () => data,
});

describe("M8 r3 — server read, exact paise and trusted prices", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    repoFixture.serverDoc = null;
    repoFixture.getDocFromServer.mockReset();
    repoFixture.getDoc.mockReset();
    repoFixture.getDocFromServer.mockImplementation(() =>
      Promise.resolve(snapshot(repoFixture.serverDoc)),
    );
    repoFixture.getDoc.mockImplementation(() =>
      Promise.reject(new Error("getDoc must not be used for a receipt refresh")),
    );
  });

  it("1a. REAL repository + getDocFromServer sees a later cash collection", async () => {
    const cached = {
      ...base,
      paymentChannel: "cash",
      cashDuePaise: 25900,
      pricing: pricing(259),
      payment: { method: "cod", status: "pending" },
    } as unknown as Order;
    repoFixture.serverDoc = serverDocFor({
      paymentChannel: "cash",
      cashDuePaise: 25900,
      cashCollectedPaise: 25900,
      receiptEvidence: { kind: "cash", paise: 25900, stampedAtMs: 1763800000000, by: "server" },
      payment: { method: "cod", status: "completed", cashCollectedPaise: 25900 },
    });

    const html = await captureReceipt(cached, (o) => orderRepository.getOrderForReceipt(o));
    const rows = parseRows(html);
    expect(repoFixture.getDocFromServer).toHaveBeenCalled();
    expect(repoFixture.getDoc).not.toHaveBeenCalled();
    expect(rows.find((r) => /Amount Collected/.test(r.label))?.amount).toBeCloseTo(259, 2);
    expect(rows.some((r) => /Amount Due/.test(r.label))).toBe(false);
  });

  it("1b. offline getDocFromServer: REAL repository withholds every amount", async () => {
    const cached = {
      ...base,
      pricing: pricing(259),
      receiptEvidence: { kind: "capture", paise: 25900, stampedAtMs: 1763800000000, by: "server" },
      payment: { method: "upi", status: "paid", capturedAmountPaise: 25900 },
    } as unknown as Order;
    repoFixture.getDocFromServer.mockRejectedValueOnce(new Error("offline: cache only"));

    const html = await captureReceipt(cached, (o) => orderRepository.getOrderForReceipt(o));
    expect(html).toContain("Payment status unconfirmed");
    expect(html).not.toContain("Total Amount Paid");
    expect(html).not.toContain("Amount Collected");
    expect(html).not.toContain("Amount Due");
    expect(html).not.toMatch(/₹\s?259\.00/);
  });

  it("3a. exact paise: ₹259.00 capture vs ₹259.01 pricing must not reconcile rows", async () => {
    const order = {
      ...base,
      pricing: pricing(259.01),
      receiptEvidence: { kind: "capture", paise: 25900, stampedAtMs: 1763800000000, by: "server" },
      payment: { method: "upi", status: "paid", capturedAmountPaise: 25900 },
    } as unknown as Order;

    const html = await captureReceipt(order);
    const rows = parseRows(html);
    expect(rows.find((r) => /Total Amount Paid/.test(r.label))?.amount).toBeCloseTo(259, 2);
    expect(rows.some((r) => /Subtotal/.test(r.label))).toBe(false);
  });

  it("3b. exact paise: rows summing to ₹259.01 vs ₹259.00 total are omitted", async () => {
    const order = {
      ...base,
      items: [{ name: "Veg Burger", quantity: 1, unitPrice: 268.01 }],
      pricing: pricing(259, 268.01),
      receiptEvidence: { kind: "capture", paise: 25900, stampedAtMs: 1763800000000, by: "server" },
      payment: { method: "upi", status: "paid", capturedAmountPaise: 25900 },
    } as unknown as Order;

    const html = await captureReceipt(order);
    const rows = parseRows(html);
    expect(rows.find((r) => /Total Amount Paid/.test(r.label))?.amount).toBeCloseTo(259, 2);
    expect(rows.some((r) => /Subtotal/.test(r.label))).toBe(false);
  });

  it("3c. exact paise: item ₹268.00 vs server ₹268.01 hides the price columns", async () => {
    const order = {
      ...base,
      items: [{ name: "Veg Burger", quantity: 1, unitPrice: 268 }],
      pricing: pricing(259, 268.01),
      receiptEvidence: { kind: "capture", paise: 25900, stampedAtMs: 1763800000000, by: "server" },
      payment: { method: "upi", status: "paid", capturedAmountPaise: 25900 },
    } as unknown as Order;

    const html = await captureReceipt(order);
    expect(html).not.toContain(">Rate<");
    expect(html).not.toContain(">Amount<");
  });

  it("4a. no trusted line prices: price columns are omitted by default", async () => {
    const order = {
      ...base,
      items: [{ name: "Veg Burger", quantity: 1 }], // no unitPrice at all
      pricing: {
        foodSubtotal: 0,
        packagingFee: 0,
        deliveryFee: 0,
        gst: 0,
        discount: 0,
        loyaltyDiscount: 0,
        grandTotal: 0,
      },
      cashDuePaise: 0,
      paymentChannel: "cash",
      payment: { method: "cod", status: "pending" },
    } as unknown as Order;

    const html = await captureReceipt(order);
    expect(html).toContain("Veg Burger");
    expect(html).not.toContain(">Rate<");
    expect(html).not.toContain(">Amount<");
  });

  it("4b. legacy rows that do not reconcile to the total are omitted", async () => {
    const order = {
      ...base,
      totals: { subtotal: 100, taxes: 5, deliveryFee: 10, grandTotal: 100 },
      payment: { method: "cod", status: "pending" },
    } as unknown as Order;

    const html = await captureReceipt(order);
    const rows = parseRows(html);
    expect(rows.find((r) => /Order Total/.test(r.label))?.amount).toBeCloseTo(100, 2);
    expect(rows.some((r) => /Subtotal|Delivery Fee/.test(r.label))).toBe(false);
  });
});
