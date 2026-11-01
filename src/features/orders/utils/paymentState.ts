/**
 * Customer-facing payment state, derived from the SERVER's order document.
 *
 * A pending online order is not a confirmed order: Razorpay is opened only
 * after the server creates `orders/{id}` with `payment.status: "pending"`, so
 * closing the sheet leaves a real, unpaid order behind. Every status surface
 * must read this helper instead of `order.status` alone (CUS-16), otherwise the
 * customer is told the kitchen received an order it never got.
 */
import type { Order, OrderStatusMeta } from "../models";

/**
 * How long after placement an unpaid online order is still "being confirmed".
 * The gateway/webhook round trip is seconds; this window keeps a customer who
 * has just paid from being told their payment failed while it lands.
 */
export const PAYMENT_CONFIRMING_WINDOW_MS = 2 * 60_000;

export type CustomerPaymentState = "paid" | "cash" | "confirming" | "unpaid";

const CASH_STATUSES = new Set(["CASH_PENDING", "PAY_AT_STORE"]);

export function orderPaymentState(order: Order | null, now: number = Date.now()): CustomerPaymentState {
  const payment = order?.payment;
  // Legacy documents with no payment block kept their previous presentation.
  if (!payment) return "paid";
  if (payment.method === "cod" || CASH_STATUSES.has(payment.status)) return "cash";
  if (payment.status === "paid" || payment.status === "refunded") return "paid";
  if (payment.status !== "pending" && payment.status !== "failed") return "paid";
  // A cancelled/failed order already has honest terminal copy of its own.
  if (order?.status?.kind === "cancelled" || order?.status?.kind === "failed") return "paid";
  if (payment.status === "failed") return "unpaid";

  const placedAt = Date.parse(order?.placedAt ?? "");
  if (Number.isFinite(placedAt)) {
    const elapsed = now - placedAt;
    // Clock skew (placedAt in the future) is not evidence of failure: treat it
    // as the same short confirming window.
    if (elapsed < PAYMENT_CONFIRMING_WINDOW_MS) return "confirming";
  }
  return "unpaid";
}

/**
 * The status a screen may show. Paid/cash/deep-linked-paid orders keep the
 * server meta exactly; unpaid and confirming orders get honest labels that
 * never claim the kitchen acknowledged the order.
 */
export function displayOrderStatus(
  order: Order | null,
  now: number = Date.now(),
): OrderStatusMeta | null {
  if (!order) return null;
  const state = orderPaymentState(order, now);
  if (state === "unpaid") {
    return {
      code: "PAYMENT_UNPAID",
      label: "Payment not completed",
      kind: "failed",
      terminal: false,
    };
  }
  if (state === "confirming") {
    return {
      code: "PAYMENT_CONFIRMING",
      label: "Confirming payment",
      kind: "upcoming",
      terminal: false,
    };
  }
  return order.status;
}
