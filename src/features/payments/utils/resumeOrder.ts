/**
 * CUS-16 follow-up: "Complete payment" on an unpaid order opens
 * `/payment?orderId=…`. The cart is normally empty by then (the customer paid
 * for the order from history, or a reload dropped the local cart), so that
 * screen must work from the ORDER DOCUMENT, never the cart.
 *
 * This module is the single, DOM-free decision table for what that screen may
 * offer. It exists so the money branches are unit-tested: an already-paid,
 * cancelled, expired, cash or foreign order must never present a payable
 * button, and an unreadable document must never be presented as "nothing to
 * pay" either.
 */
import type { Order } from "@/features/orders/models";
import { orderPaymentState } from "@/features/orders/utils/paymentState";

export type ResumableOrderState =
  /** No readable document for this id under this account. */
  | { kind: "missing" }
  /** Settled: the server already recorded the payment. */
  | { kind: "paid" }
  /** Cancelled/failed/expired: nothing may be paid against it. */
  | { kind: "blocked"; reason: "expired" | "cancelled" | "failed" }
  /** A cash / pay-at-store order, which is not an online payment. */
  | { kind: "cash" }
  /** Unpaid and still payable. */
  | { kind: "payable" };

/** The server's own cancellation reason for an abandoned unpaid order. */
export const PAYMENT_NOT_COMPLETED_REASON = "payment_not_completed";

function cancellationReason(order: Order): string {
  const raw = (order as Order & { cancellationReason?: unknown }).cancellationReason;
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

/** Sellable unpaid online order, or a typed reason it cannot be paid. */
export function classifyResumableOrder(order: Order | null): ResumableOrderState {
  if (!order) return { kind: "missing" };

  const code = String(order.status?.code ?? "")
    .trim()
    .toUpperCase();

  // Terminal first: `orderPaymentState` maps cancelled/failed orders to "paid"
  // so that history screens keep their own terminal copy — which would tell
  // this screen the opposite of the truth.
  if (order.status?.kind === "cancelled" || code === "CANCELLED" || code === "REFUNDED") {
    return {
      kind: "blocked",
      reason: cancellationReason(order) === PAYMENT_NOT_COMPLETED_REASON ? "expired" : "cancelled",
    };
  }
  if (order.status?.kind === "failed" || code === "FAILED") {
    return { kind: "blocked", reason: "failed" };
  }

  const state = orderPaymentState(order);
  if (state === "paid") return { kind: "paid" };
  if (state === "cash") return { kind: "cash" };
  // "unpaid" and "confirming" are both payable: the window exists only to stop
  // a customer who just paid from being told the payment failed, and this
  // screen is reached by an explicit "Complete payment" tap.
  return { kind: "payable" };
}

/** Server refusals that mean this order can never take a payment again. */
const TERMINAL_REFUSALS = new Set([
  "ORDER_TERMINAL",
  "ORDER_ALREADY_PAID",
  "ORDER_NOT_FOUND",
  "ORDER_NOT_OWNED",
]);

export function isTerminalResumeRefusal(code?: string | null): boolean {
  return typeof code === "string" && TERMINAL_REFUSALS.has(code);
}

/** The amount this order still owes, from the document only. */
export function resumableAmountDue(order: Order): number | null {
  const grandTotal = order.totals?.grandTotal;
  if (typeof grandTotal !== "number" || !Number.isFinite(grandTotal)) return null;
  const tip =
    typeof order.tipAmount === "number" && Number.isFinite(order.tipAmount) ? order.tipAmount : 0;
  // Loyalty redemption was withdrawn; legacy docs may still carry points, and
  // they were already discounted from the server total, so they are NOT
  // subtracted here (the server's amountPaise is the authority).
  return Math.max(0, grandTotal + tip);
}
