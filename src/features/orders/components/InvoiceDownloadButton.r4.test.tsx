/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const repoFixture = vi.hoisted(() => ({
  serverDoc: null as Record<string, any> | null,
  cachedDoc: null as Record<string, any> | null,
  pendingWrites: false,
  rejectServer: false,
  getDocFromServer: vi.fn(),
  getDoc: vi.fn(),
}));

vi.mock("@/core/config/firebase", () => ({
  auth: { currentUser: { uid: "uid_1" }, authStateReady: () => Promise.resolve() },
  db: { kind: "db" },
}));

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, path: string, id: string) => ({ path, id }),
  getDoc: () => Promise.resolve(repoFixture.cachedDoc),
  getDocFromServer: () => {
    if (repoFixture.rejectServer) return Promise.reject(new Error("offline: server unreachable"));
    if (repoFixture.pendingWrites) {
      return Promise.resolve({
        exists: () => true,
        data: () => repoFixture.serverDoc,
        metadata: { hasPendingWrites: true },
      });
    }
    return Promise.resolve({
      exists: () => repoFixture.serverDoc !== null,
      data: () => repoFixture.serverDoc,
      metadata: { hasPendingWrites: false },
    });
  },
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
  id: "ord_r4",
  shortCode: "BG-R4",
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

const evidence = (kind: "capture" | "cash", paise: number, by: "server" | "client" = "server") => ({
  kind,
  paise,
  stampedAtMs: 1763800000000,
  by,
});

const serverDocFor = (overrides: Record<string, any> = {}) => ({
  customerId: "uid_1",
  userId: "uid_1",
  shortCode: "BG-R4",
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

describe("M8 r4 — evidence stamp, fresh server read and paise-priced items", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    repoFixture.serverDoc = null;
    repoFixture.cachedDoc = null;
    repoFixture.pendingWrites = false;
    repoFixture.rejectServer = false;
  });

  it("1a. uncorroborated capturedAmountPaise never prints Paid/Collected", async () => {
    const order = {
      ...base,
      pricing: pricing(259),
      payment: { method: "upi", status: "paid", capturedAmountPaise: 25900 },
    } as unknown as Order;
    const html = await captureReceipt(order);
    expect(html).not.toContain("Total Amount Paid");
    expect(html).not.toContain("Amount Collected");
    expect(parseRows(html).some((r) => /Order Total/.test(r.label))).toBe(true);
  });

  it("1b. a server stamp backs the paid claim", async () => {
    const order = {
      ...base,
      pricing: pricing(259),
      payment: { method: "upi", status: "paid", capturedAmountPaise: 25900 },
      receiptEvidence: evidence("capture", 25900),
    } as unknown as Order;
    const html = await captureReceipt(order);
    expect(parseRows(html).find((r) => /Total Amount Paid/.test(r.label))?.amount).toBeCloseTo(
      259,
      2,
    );
  });

  it("1c. a client-supplied or mismatched stamp never backs a claim", async () => {
    const forged = {
      ...base,
      pricing: pricing(259),
      payment: { method: "upi", status: "paid", capturedAmountPaise: 25900 },
      receiptEvidence: evidence("capture", 25900, "client"),
    } as unknown as Order;
    const mismatched = {
      ...forged,
      receiptEvidence: evidence("capture", 99900),
    } as unknown as Order;
    for (const order of [forged, mismatched]) {
      const html = await captureReceipt(order);
      expect(html).not.toContain("Total Amount Paid");
      expect(html).not.toContain("Amount Collected");
    }
  });

  it("2a. offline: getDoc has stale money, getDocFromServer rejects — no currency anywhere", async () => {
    const cached = {
      ...base,
      pricing: pricing(259),
      payment: { method: "upi", status: "paid", capturedAmountPaise: 25900 },
      receiptEvidence: evidence("capture", 25900),
    } as unknown as Order;
    repoFixture.cachedDoc = serverDocFor({
      pricing: pricing(259),
      payment: { method: "upi", status: "paid", capturedAmountPaise: 25900 },
      receiptEvidence: evidence("capture", 25900),
    });
    repoFixture.rejectServer = true;

    const html = await captureReceipt(cached, (o) => orderRepository.getOrderForReceipt(o));
    expect(html).not.toMatch(/₹\s?[\d,]+\.\d{2}/);
    expect(html).toContain("Payment status unconfirmed");
  });

  it("2b. hasPendingWrites snapshot is rejected with no amounts", async () => {
    const cached = {
      ...base,
      pricing: pricing(259),
      payment: { method: "upi", status: "paid", capturedAmountPaise: 25900 },
      receiptEvidence: evidence("capture", 25900),
    } as unknown as Order;
    repoFixture.serverDoc = serverDocFor({
      pricing: pricing(259),
      payment: { method: "upi", status: "paid", capturedAmountPaise: 25900 },
      receiptEvidence: evidence("capture", 25900),
    });
    repoFixture.pendingWrites = true;

    const html = await captureReceipt(cached, (o) => orderRepository.getOrderForReceipt(o));
    expect(html).not.toMatch(/₹\s?[\d,]+\.\d{2}/);
  });

  it("4a. legacy item ₹268 against ₹100 total: both price columns absent", async () => {
    const order = {
      ...base,
      items: [{ name: "Veg Burger", quantity: 1, unitPrice: 268 }],
      totals: { subtotal: 100, taxes: 5, grandTotal: 100 },
      payment: { method: "cod", status: "pending" },
    } as unknown as Order;
    const html = await captureReceipt(order);
    expect(html).toContain("Veg Burger");
    expect(html).not.toContain(">Rate<");
    expect(html).not.toContain(">Amount<");
    expect(html).not.toMatch(/₹\s?268\.00/);
  });

  it("4b. ₹1.004 × 2 renders from integer paise as ₹1.00 / ₹2.00", async () => {
    const order = {
      ...base,
      items: [{ name: "Spice", quantity: 2, unitPrice: 1.004 }],
      pricing: {
        foodSubtotal: 2,
        packagingFee: 0,
        deliveryFee: 0,
        gst: 0,
        discount: 0,
        loyaltyDiscount: 0,
        grandTotal: 2,
      },
      cashDuePaise: 200,
      receiptEvidence: evidence("cash", 200),
      payment: { method: "cod", status: "completed", cashCollectedPaise: 200 },
      cashCollectedPaise: 200,
    } as unknown as Order;
    const html = await captureReceipt(order);
    expect(html).toContain(">Rate<");
    expect(html).toContain(">Amount<");
    expect(html).toContain("₹1.00");
    expect(html).toContain("₹2.00");
    expect(html).not.toContain("₹2.01");
  });

  it("5. pricing+capture at ₹259.01 keeps rows; item-only one-paise gap hides prices", async () => {
    const order = {
      ...base,
      items: [{ name: "Veg Burger", quantity: 1, unitPrice: 268 }],
      pricing: pricing(259.01, 268.01, 54),
      payment: { method: "upi", status: "paid", capturedAmountPaise: 25901 },
      receiptEvidence: evidence("capture", 25901),
    } as unknown as Order;
    const html = await captureReceipt(order);
    const rows = parseRows(html);
    expect(rows.find((r) => /Total Amount Paid/.test(r.label))?.amount).toBeCloseTo(259.01, 2);
    expect(rows.find((r) => /^Subtotal/.test(r.label))?.amount).toBeCloseTo(268.01, 2);
    expect(rows.find((r) => /Coupon discount/.test(r.label))?.amount).toBeCloseTo(-54, 2);
    expect(html).not.toContain(">Rate<");
    expect(html).not.toContain(">Amount<");
  });
});
