/**
 * DeliveryQuoteService — the dynamic delivery-fee quote.
 *
 * Delivery fees are quoted per order (distance / surge / partner pricing),
 * not hardcoded per screen. Until the quote endpoint ships, the service
 * returns the published sandbox quote (₹35) so the number the customer is
 * SHOWN is the number the pricing engine CHARGES — a client-side
 * "estimated fee" that disagrees with the bill is a support ticket.
 *
 * Replacing this with a real quote is a body-only change: callers already
 * consume {@link DeliveryQuote} and never see the source.
 */
import { ok, type ApiResult } from "@/core/network/http";
import { DEFAULT_DELIVERY_QUOTE_FEE } from "@/shared/pricing/pricingEngine";

export type DeliveryQuoteSource = "sandbox" | "api";

export interface DeliveryQuote {
  /** Quoted delivery fee in ₹. Never negative. */
  fee: number;
  /**
   * Where the number came from. Surfaced so the UI can label a sandbox quote
   * honestly instead of implying a live distance-based quote.
   */
  source: DeliveryQuoteSource;
  quotedAt: number;
}

export interface QuoteDeliveryFeeInput {
  storeId?: string | null;
  /** Distance from the store, when known. Unused by the sandbox quote. */
  distanceKm?: number | null;
}

/** Published sandbox quote. Stable identity so a default is never "fresh". */
export const SANDBOX_DELIVERY_QUOTE: DeliveryQuote = Object.freeze({
  fee: DEFAULT_DELIVERY_QUOTE_FEE,
  source: "sandbox",
  quotedAt: 0,
});

/**
 * Quotes the delivery fee for an order.
 *
 * Never fails: a quote we could not fetch must not take the checkout down —
 * the caller falls back to the sandbox quote, which is a real published
 * price, not an invented one.
 */
export async function quoteDeliveryFee(
  _input: QuoteDeliveryFeeInput = {},
): Promise<ApiResult<DeliveryQuote>> {
  return ok({ ...SANDBOX_DELIVERY_QUOTE, quotedAt: Date.now() });
}

/**
 * Normalises any candidate fee into a usable quote. Non-finite / negative
 * values fall back to the sandbox quote rather than pricing a ₹0 delivery.
 */
export function toDeliveryQuote(
  fee: unknown,
  source: DeliveryQuoteSource = "sandbox",
): DeliveryQuote {
  const n = Number(fee);
  if (!Number.isFinite(n) || n < 0) return SANDBOX_DELIVERY_QUOTE;
  return { fee: Math.round(n * 100) / 100, source, quotedAt: Date.now() };
}

export const deliveryQuoteService = {
  quote: quoteDeliveryFee,
  sandbox: SANDBOX_DELIVERY_QUOTE,
};
