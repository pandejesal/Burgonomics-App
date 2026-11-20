/**
 * Checkout fees state (R8).
 *
 * The delivery fee comes from the courier quote endpoint (`POST /checkout/fees`)
 * and packaging comes from the same response. There is NO static delivery fee
 * anywhere on the client: not ₹35, not ₹40, no free-delivery threshold.
 *
 * The state machine exists so stale responses can never overwrite newer ones:
 * every request takes a monotonically increasing sequence number and a context
 * key (store + branch + fulfillment + drop pins). A response is applied ONLY
 * when it still matches both. Changing the address while a quote is in flight
 * therefore cannot show the old address's fare.
 */
import type { PricingFulfillment } from "@/shared/pricing/pricingEngine";

export type CheckoutOrderType = PricingFulfillment;

/**
 * Owner decision 2026-11-20: cash on delivery is in the launch scope, but each
 * BRANCH decides whether it is offered and up to what order value. This is the
 * server's answer from `POST /checkout/fees`; the create route re-reads the same
 * branch document and enforces it, so this only decides what the screen shows.
 */
export interface CashOnDeliveryQuote {
  enabled: boolean;
  /** `null` = the branch set no ceiling. */
  maxOrderValuePaise: number | null;
}

export interface CheckoutFeesReady {
  status: "ready";
  orderType: CheckoutOrderType;
  /** Server-authoritative packaging fee for this order (₹). */
  packagingFee: number;
  /** Courier-quoted delivery fee (₹). Always 0 off-delivery. */
  deliveryFee: number;
  /** Quote id the server binds to the payment order. Null off-delivery. */
  deliveryQuoteId: string | null;
  provider: string | null;
  /** Epoch ms after which the quote is refused by the server. Null off-delivery. */
  expiresAt: number | null;
  /**
   * Branch's cash-on-delivery switch + ceiling. Optional because a persisted
   * or older state may not carry it; readers fall back to
   * `DEFAULT_CASH_ON_DELIVERY` and the create route remains the authority.
   */
  cashOnDelivery?: CashOnDeliveryQuote;
}

export interface CheckoutFeesUnserviceable {
  status: "unserviceable";
  packagingFee: number;
  reason: string | null;
  message: string;
}

export type CheckoutFeesState =
  | { status: "idle" }
  | { status: "loading" }
  | CheckoutFeesReady
  | CheckoutFeesUnserviceable
  /** `code` is the server refusal (e.g. STORE_NOT_LINKED) when one was parsed. */
  | { status: "error"; code: string | null };

export const INITIAL_CHECKOUT_FEES: CheckoutFeesState = { status: "idle" };

/** Everything a quote depends on. Any change invalidates the previous quote. */
export interface CheckoutFeesContext {
  storeId: string | null;
  branchId: string | null;
  orderType: CheckoutOrderType;
  dropLat: number | null;
  dropLng: number | null;
}

export function buildCheckoutFeesContext(input: {
  storeId?: string | null;
  branchId?: string | null;
  orderType: CheckoutOrderType;
  dropLat?: number | null;
  dropLng?: number | null;
}): CheckoutFeesContext {
  const coord = (v: number | null | undefined): number | null =>
    typeof v === "number" && Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : null;
  return {
    storeId: input.storeId ?? null,
    branchId: input.branchId ?? null,
    orderType: input.orderType,
    dropLat: coord(input.dropLat),
    dropLng: coord(input.dropLng),
  };
}

/** Stable identity of one quote request (used to detect stale responses). */
export function checkoutFeesKey(ctx: CheckoutFeesContext): string {
  return [
    ctx.storeId ?? "",
    ctx.branchId ?? "",
    ctx.orderType,
    ctx.dropLat ?? "",
    ctx.dropLng ?? "",
  ].join("|");
}

/** True once the server will refuse this quote as expired. */
export function isCheckoutFeesExpired(state: CheckoutFeesState, now: number = Date.now()): boolean {
  if (state.status !== "ready" || state.expiresAt === null) return false;
  return now >= state.expiresAt;
}

/**
 * A quote may back a payment only when it is ready, belongs to this order type
 * and has not expired. Delivery additionally requires a quote id and pins.
 */
export function isCheckoutFeesUsable(state: CheckoutFeesState, now: number = Date.now()): boolean {
  if (state.status !== "ready") return false;
  if (isCheckoutFeesExpired(state, now)) return false;
  if (state.orderType === "delivery") {
    return (
      typeof state.deliveryQuoteId === "string" &&
      state.deliveryQuoteId.length > 0 &&
      typeof state.expiresAt === "number"
    );
  }
  return true;
}

/** The hook re-quotes proactively this many ms after expiry. */
export const QUOTE_REFRESH_GRACE_MS = 500;

/** Re-quote window for a ready quote (null = no timer needed). */
export function nextRequoteDelay(
  state: CheckoutFeesState,
  now: number = Date.now(),
): number | null {
  if (state.status !== "ready" || state.expiresAt === null) return null;
  return Math.max(0, state.expiresAt - now) + QUOTE_REFRESH_GRACE_MS;
}

/** Codes the payment endpoint answers when the quote is missing or stale. */
export const DELIVERY_QUOTE_REQUIRED = "DELIVERY_QUOTE_REQUIRED";
export const DELIVERY_QUOTE_EXPIRED = "DELIVERY_QUOTE_EXPIRED";

export function isDeliveryQuoteRefusal(code: string | null | undefined): boolean {
  return code === DELIVERY_QUOTE_REQUIRED || code === DELIVERY_QUOTE_EXPIRED;
}

/** The default the screen assumes until the server has answered. */
export const DEFAULT_CASH_ON_DELIVERY: CashOnDeliveryQuote = {
  enabled: true,
  maxOrderValuePaise: null,
};

/**
 * Whether the cash option may be CHOSEN for this bill.
 *
 * Fail-open while the quote is unknown: the option is the offline fallback and
 * hiding it during loading would strand a customer with no tender. Once the
 * server has answered, the branch's switch and ceiling are binding — and the
 * create route enforces the same values again, so a stale screen can never
 * place a cash order the branch refuses.
 */
export function cashOnDeliveryAvailability(
  state: CheckoutFeesState,
  totalPaise: number | null,
): { allowed: boolean; reason: string | null } {
  if (state.status !== "ready") return { allowed: true, reason: null };
  const cod = state.cashOnDelivery ?? DEFAULT_CASH_ON_DELIVERY;
  if (cod.enabled !== true) {
    return {
      allowed: false,
      reason: "Cash on delivery is not available at this outlet. Please pay online.",
    };
  }
  const cap = cod.maxOrderValuePaise;
  if (
    typeof cap === "number" &&
    Number.isFinite(cap) &&
    typeof totalPaise === "number" &&
    totalPaise > cap
  ) {
    return {
      allowed: false,
      reason: `Cash on delivery is available up to ₹${Math.floor(cap / 100)} for one order. Please pay online for this order.`,
    };
  }
  return { allowed: true, reason: null };
}
