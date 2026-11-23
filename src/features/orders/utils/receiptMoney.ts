/**
 * Receipt money — the customer's downloaded receipt makes a money claim ONLY
 * when the SERVER'S own receipt-evidence stamp backs it.
 *
 * `receiptEvidence = {kind, paise, stampedAtMs, by:"server"}` is written by the
 * capture / cash-collection paths in the same transaction as the money field.
 * A legacy order without that stamp renders a neutral "Order Total": it never
 * says Paid or Collected, whatever its display totals or paid flag say.
 *
 * The server REPRICES at intent time (stamps `pricing`, never overwrites
 * `totals`) and the gateway charges `capturedAmountPaise` with NO tip, so a
 * stale client total, a tipped cart or a mismatched breakdown can never drive
 * the figure the receipt prints.
 */
import { includedGst } from "@/shared/pricing/pricingEngine";
import type { Order } from "../models";

export type ReceiptMoneySource =
  "capture" | "cash_collected" | "cash_due" | "cancelled" | "unverified" | "legacy";

export interface ReceiptRow {
  label: string;
  /** Signed rupees; negative values are discounts. */
  amount: number;
  /** Inclusive GST is informational and never added. */
  informational?: boolean;
}

export interface VerifiedItemPrice {
  unitPaise: number;
  quantity: number;
  linePaise: number;
}

export interface ReceiptMoney {
  source: ReceiptMoneySource;
  totalLabel: string;
  /** null withholds the figure entirely (cancelled / refresh failed). */
  total: number | null;
  rows: ReceiptRow[];
  /** Empty means hide BOTH price columns — no trusted, reconciled line prices. */
  itemPrices: VerifiedItemPrice[];
}

interface ServerEvidence {
  kind: "capture" | "cash";
  paise: number;
  stampedAtMs: number;
  by: "server";
}

const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
const rupees = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? round2(value) : 0;
const toPaise = (value: number): number => Math.round(value * 100);

const integerPaise = (value: unknown, allowZero: boolean): number | null =>
  typeof value === "number" && Number.isInteger(value) && (allowZero ? value >= 0 : value > 0)
    ? value
    : null;

/** Only a server-written stamp can corroborate a Paid/Collected claim. */
function serverEvidence(order: Order): ServerEvidence | null {
  const e = (order as unknown as Record<string, any>)?.receiptEvidence;
  if (!e || typeof e !== "object" || Array.isArray(e)) return null;
  if (e.by !== "server") return null;
  if (e.kind !== "capture" && e.kind !== "cash") return null;
  if (typeof e.paise !== "number" || !Number.isInteger(e.paise) || e.paise <= 0) return null;
  if (typeof e.stampedAtMs !== "number" || !Number.isFinite(e.stampedAtMs) || e.stampedAtMs <= 0)
    return null;
  return e as ServerEvidence;
}

/** Additive rows from the server's own pricing breakdown. */
function serverRows(pricing: Record<string, any>, couponCode: string): ReceiptRow[] {
  const rows: ReceiptRow[] = [];
  rows.push({ label: "Subtotal", amount: rupees(pricing.foodSubtotal ?? pricing.subtotal) });
  const discount = rupees(pricing.discount);
  if (discount > 0) {
    rows.push({
      label: `Coupon discount${couponCode ? ` (${couponCode})` : ""}`,
      amount: -discount,
    });
  }
  const loyaltyDiscount = rupees(pricing.loyaltyDiscount);
  if (loyaltyDiscount > 0) rows.push({ label: "Loyalty discount", amount: -loyaltyDiscount });
  const packaging = rupees(pricing.packagingFee);
  if (packaging > 0) rows.push({ label: "Packaging Fee", amount: packaging });
  const delivery = rupees(pricing.deliveryFee);
  if (delivery > 0) rows.push({ label: "Delivery Fee", amount: delivery });
  rows.push({ label: "Incl. GST (5%)", amount: rupees(pricing.gst), informational: true });
  return rows;
}

const additiveRowPaise = (rows: ReceiptRow[]): number =>
  rows.reduce((sum, row) => sum + (row.informational ? 0 : toPaise(row.amount)), 0);

function serverBreakdown(order: Order): {
  pricing: Record<string, any>;
  total: number;
  couponCode: string;
} | null {
  const raw = order as unknown as Record<string, any>;
  const pricing = raw?.pricing;
  if (!pricing || typeof pricing !== "object" || Array.isArray(pricing)) return null;
  const total = pricing.grandTotal;
  if (typeof total !== "number" || !Number.isFinite(total) || total < 0) return null;
  const couponCode =
    typeof raw.couponCode === "string" && raw.couponCode
      ? raw.couponCode
      : typeof order.promo?.code === "string"
        ? order.promo.code
        : "";
  return { pricing, total: round2(total), couponCode };
}

/**
 * Line prices are printed only when EVERY line has a usable unit price, a
 * positive INTEGER quantity, and the integer-paise line sum equals the
 * server food subtotal exactly. Prices are rendered from paise, never from
 * float multiplication (₹1.004 × 2 is ₹2.00, not ₹2.01).
 */
function verifiedItemPrices(order: Order, foodPaise: number | null): VerifiedItemPrice[] {
  const items = Array.isArray(order.items) ? order.items : [];
  if (items.length === 0 || foodPaise === null) return [];
  const prices: VerifiedItemPrice[] = [];
  let sumPaise = 0;
  for (const item of items) {
    if (typeof item.unitPrice !== "number" || !Number.isFinite(item.unitPrice)) return [];
    const qty = item.quantity;
    if (typeof qty !== "number" || !Number.isInteger(qty) || qty <= 0) return [];
    const unitPaise = toPaise(item.unitPrice);
    if (!Number.isInteger(unitPaise) || unitPaise < 0) return [];
    const linePaise = unitPaise * qty;
    prices.push({ unitPaise, quantity: qty, linePaise });
    sumPaise += linePaise;
  }
  return sumPaise === foodPaise ? prices : [];
}

function isCancelled(order: Order): boolean {
  const raw = order as unknown as Record<string, any>;
  return (
    raw?.status?.code === "CANCELLED" ||
    raw?.status?.kind === "cancelled" ||
    raw?.cancellationStatus === "CANCELLED" ||
    raw?.cancelledAt != null
  );
}

/** Neutral fallback: a display total is not proof of payment. */
function legacyReceiptMoney(order: Order): ReceiptMoney {
  const raw = order as unknown as Record<string, any>;
  const grandTotal = order.totals?.grandTotal || 0;
  const itemDiscount = order.totals?.itemDiscount || 0;
  const promoDiscount = order.totals?.promoDiscount || order.promo?.discount || 0;
  const couponCode =
    (typeof raw.couponCode === "string" ? raw.couponCode : "") || order.promo?.code || "";
  const packing = order.totals?.packingFee || 0;
  const delivery = order.totals?.deliveryFee || 0;
  const subtotal =
    typeof order.totals?.subtotal === "number"
      ? order.totals.subtotal
      : round2(grandTotal + itemDiscount + promoDiscount - packing - delivery);
  const tip =
    typeof order.tipAmount === "number" && Number.isFinite(order.tipAmount)
      ? Math.max(0, order.tipAmount)
      : 0;
  // A tip was never charged by the gateway nor recorded by cash hand-over;
  // never add it to a line the UI presents as a paid figure.
  const claimedTip = order.payment?.status === "paid" ? 0 : tip;
  const netFood = round2(Math.max(0, subtotal - itemDiscount - promoDiscount));
  const taxes = order.totals?.taxes ?? includedGst(netFood);

  const rows: ReceiptRow[] = [{ label: "Subtotal", amount: subtotal }];
  if (itemDiscount > 0) rows.push({ label: "Item discount", amount: -itemDiscount });
  if (promoDiscount > 0) {
    rows.push({
      label: `Coupon discount${couponCode ? ` (${couponCode})` : ""}`,
      amount: -promoDiscount,
    });
  }
  if (packing > 0) rows.push({ label: "Packaging Fee", amount: packing });
  if (delivery > 0) rows.push({ label: "Delivery Fee", amount: delivery });
  if (claimedTip > 0) rows.push({ label: "Delivery Tip", amount: claimedTip });
  rows.push({ label: "Incl. GST (5%)", amount: taxes, informational: true });

  const total = round2(grandTotal + claimedTip);
  // Item prices are only safe when the WHOLE legacy bill reconciles. A stale
  // subtotal that disagrees with the total must hide both price columns too.
  const reconciled = additiveRowPaise(rows) === toPaise(total);
  return {
    source: "legacy",
    totalLabel: "Order Total",
    total,
    rows: reconciled ? rows : [],
    itemPrices: reconciled ? verifiedItemPrices(order, toPaise(subtotal)) : [],
  };
}

/** Resolve the honest bottom line and reconciling rows for one order. */
export function resolveReceiptMoney(order: Order): ReceiptMoney {
  const raw = order as unknown as Record<string, any>;
  const payment = (raw?.payment ?? {}) as Record<string, any>;
  const isCash = raw?.paymentChannel === "cash" || payment.method === "cod";
  const evidence = serverEvidence(order);

  const captured = integerPaise(
    payment.capturedAmountPaise ?? raw?.["payment.capturedAmountPaise"],
    false,
  );
  const collected = integerPaise(raw?.cashCollectedPaise ?? payment.cashCollectedPaise, false);
  const due = integerPaise(raw?.cashDuePaise ?? payment.cashDuePaise, true);

  if (isCancelled(order) && collected === null) {
    return {
      source: "cancelled",
      totalLabel: "Order Cancelled",
      total: null,
      rows: [],
      itemPrices: [],
    };
  }

  // A PAID / COLLECTED claim needs a matching SERVER stamp. No stamp, no claim.
  const provenCapture =
    evidence?.kind === "capture" && captured !== null && evidence.paise === captured
      ? evidence.paise
      : null;
  const provenCollection =
    evidence?.kind === "cash" && collected !== null && evidence.paise === collected
      ? evidence.paise
      : null;

  if (provenCapture !== null || provenCollection !== null) {
    const verified = provenCapture ?? provenCollection!;
    const total = round2(verified / 100);
    const breakdown = serverBreakdown(order);
    let rows: ReceiptRow[] = [];
    let itemPrices: VerifiedItemPrice[] = [];

    if (breakdown && toPaise(breakdown.total) === verified) {
      const candidate = serverRows(breakdown.pricing, breakdown.couponCode);
      if (additiveRowPaise(candidate) === verified) {
        rows = candidate;
        itemPrices = verifiedItemPrices(
          order,
          toPaise(breakdown.pricing.foodSubtotal ?? breakdown.pricing.subtotal),
        );
      }
    }

    return {
      source: provenCollection !== null ? "cash_collected" : "capture",
      totalLabel: provenCollection !== null ? "Amount Collected" : "Total Amount Paid",
      total,
      rows,
      itemPrices,
    };
  }

  // Uncollected cash still has a due amount (not a payment claim).
  if (isCash && collected === null && due !== null) {
    const total = round2(due / 100);
    const breakdown = serverBreakdown(order);
    let rows: ReceiptRow[] = [];
    let itemPrices: VerifiedItemPrice[] = [];
    if (breakdown && toPaise(breakdown.total) === due) {
      const candidate = serverRows(breakdown.pricing, breakdown.couponCode);
      if (additiveRowPaise(candidate) === due) {
        rows = candidate;
        itemPrices = verifiedItemPrices(
          order,
          toPaise(breakdown.pricing.foodSubtotal ?? breakdown.pricing.subtotal),
        );
      }
    }
    return { source: "cash_due", totalLabel: "Amount Due", total, rows, itemPrices };
  }

  return legacyReceiptMoney(order);
}
