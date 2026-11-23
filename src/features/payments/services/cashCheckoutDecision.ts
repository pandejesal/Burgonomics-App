import type { PaymentMethod } from "@/features/payments/models";

/**
 * M5 — pure decision helpers shared by the cash checkout screen and its tests.
 * Kept dependency-free so the reconfirm/zero-due rules can be pinned without
 * rendering the whole route.
 */
export function cashPriceChangedPaise(error: {
  code?: string;
  details?: Record<string, unknown>;
}): number | null {
  if (error.code !== "PRICE_CHANGED") return null;
  const totals = error.details?.totals as { split?: { totalAmountPaise?: number } } | undefined;
  const paise = totals?.split?.totalAmountPaise;
  return typeof paise === "number" && Number.isFinite(paise) && paise >= 0 ? paise : null;
}

/** A zero total is a valid CASH order (100% discount); an online payment is not. */
export function payBlockedByZeroTotal(
  grandTotal: number | null | undefined,
  method: PaymentMethod,
): boolean {
  return (typeof grandTotal !== "number" || !(grandTotal > 0)) && method !== "cash";
}

export function isZeroCashDue(cashDuePaise: number | null | undefined): boolean {
  return cashDuePaise === 0;
}
