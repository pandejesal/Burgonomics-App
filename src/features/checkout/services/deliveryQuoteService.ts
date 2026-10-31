/**
 * CheckoutFeesService — the ONLY source of delivery and packaging fees (R8).
 *
 * Calls `POST /checkout/fees` on the existing authenticated HTTP client
 * (`httpClient`, wired with the Firebase ID token by `setupHttpAuth`) and the
 * App Check token, exactly like the payment transport. The server resolves the
 * branch, quotes the courier and returns the winner's fare; the client never
 * invents a fee, never applies a markup, and never falls back to a static
 * number. A failure is an error state, not a guess.
 *
 * Request: `{ storeId?, branchId?, orderType, dropLat?, dropLng? }`.
 * Delivery responses carry `deliveryQuoteId` + `expiresAt`; non-delivery
 * responses are `{ packagingFee, deliveryFee: 0 }` with no provider call.
 */
import { fail, ok, type ApiResult } from "@/core/network/http";
import { httpClient } from "@/core/network/httpClient";
import { logger } from "@/core/logging/logger";
import { STORE_NOT_LINKED } from "@/features/payments/utils/paymentFailure";
import type {
  CheckoutFeesContext,
  CheckoutOrderType,
} from "@/features/checkout/state/checkoutFeesTypes";

export const CHECKOUT_FEES_PATH = "/checkout/fees";

/** Same honest sentence the payment screen uses for an unlinked outlet. */
export const STORE_NOT_LINKED_MESSAGE = "This outlet isn't taking online orders yet.";

export interface CheckoutFeesRequest {
  storeId?: string;
  branchId?: string;
  orderType: CheckoutOrderType;
  dropLat?: number;
  dropLng?: number;
}

export interface ServiceableCheckoutFees {
  serviceable: true;
  packagingFee: number;
  deliveryFee: number;
  deliveryQuoteId: string | null;
  provider: string | null;
  expiresAt: number | null;
}

export interface UnserviceableCheckoutFees {
  serviceable: false;
  packagingFee: number;
  reason: string | null;
  message: string;
}

export type CheckoutFees = ServiceableCheckoutFees | UnserviceableCheckoutFees;

export interface CheckoutFeesPostResult {
  data: unknown;
}

/** Injectable transport so the wire shape is testable without a network. */
export interface CheckoutFeesTransport {
  post(
    url: string,
    body: unknown,
    init?: { headers?: Record<string, string> },
  ): Promise<CheckoutFeesPostResult>;
}

const defaultTransport: CheckoutFeesTransport = {
  post: (url, body, init) => httpClient.post(url, body, init),
};

/** Best-effort App Check attestation — the endpoint is in the protected list. */
async function attestationHeaders(): Promise<Record<string, string>> {
  try {
    const { getAppCheckToken } = await import("@/core/config/firebase");
    const token = await getAppCheckToken();
    return token ? { "X-Firebase-AppCheck": token } : {};
  } catch (err) {
    logger.warn("checkout.fees_appcheck_unavailable", {
      message: err instanceof Error ? err.message : String(err),
    });
    return {};
  }
}

function finiteFee(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

/** Epoch-ms expiry from a number (ms or seconds), ISO string or Timestamp. */
export function parseExpiresAt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1e12 ? Math.round(value * 1000) : Math.round(value);
  }
  if (typeof value === "string") {
    const t = Date.parse(value);
    return Number.isFinite(t) ? t : null;
  }
  if (value && typeof value === "object") {
    const o = value as {
      toMillis?: () => number;
      _seconds?: number;
      seconds?: number;
    };
    if (typeof o.toMillis === "function") {
      const ms = Number(o.toMillis());
      if (Number.isFinite(ms)) return ms;
    }
    const seconds = o._seconds ?? o.seconds;
    if (typeof seconds === "number" && Number.isFinite(seconds)) return Math.round(seconds * 1000);
  }
  return null;
}

/**
 * Parses the endpoint's response. Returns null when a required field is
 * missing — the caller treats that as an error rather than inventing a fee.
 */
export function parseCheckoutFees(
  raw: unknown,
  orderType: CheckoutOrderType,
): CheckoutFees | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as Record<string, unknown>;
  const packagingFee = finiteFee(body.packagingFee);
  if (packagingFee === null) return null;

  if (orderType !== "delivery") {
    return {
      serviceable: true,
      packagingFee,
      deliveryFee: 0,
      deliveryQuoteId: null,
      provider: null,
      expiresAt: null,
    };
  }

  if (body.serviceable === false) {
    return {
      serviceable: false,
      packagingFee,
      reason: typeof body.reason === "string" ? body.reason : null,
      message: typeof body.message === "string" ? body.message : "",
    };
  }

  const deliveryFee = finiteFee(body.deliveryFee);
  const deliveryQuoteId =
    typeof body.deliveryQuoteId === "string" && body.deliveryQuoteId.trim()
      ? body.deliveryQuoteId.trim()
      : null;
  const expiresAt = parseExpiresAt(body.expiresAt);
  // Contract R5: a successful delivery quote ALWAYS carries an id and an
  // expiry. Without them the payment endpoint would refuse the order, so this
  // is an error state, never a usable quote.
  if (deliveryFee === null || !deliveryQuoteId || expiresAt === null) return null;

  return {
    serviceable: true,
    packagingFee,
    deliveryFee,
    deliveryQuoteId,
    provider: typeof body.provider === "string" ? body.provider : null,
    expiresAt,
  };
}

/** Maps a context to the request body; pins are sent only for delivery. */
export function checkoutFeesRequestBody(ctx: CheckoutFeesContext): CheckoutFeesRequest {
  const body: CheckoutFeesRequest = { orderType: ctx.orderType };
  if (ctx.storeId) body.storeId = ctx.storeId;
  if (ctx.branchId) body.branchId = ctx.branchId;
  if (ctx.orderType === "delivery") {
    if (ctx.dropLat !== null) body.dropLat = ctx.dropLat;
    if (ctx.dropLng !== null) body.dropLng = ctx.dropLng;
  }
  return body;
}

export async function requestCheckoutFees(
  ctx: CheckoutFeesContext,
  deps: { transport?: CheckoutFeesTransport } = {},
): Promise<ApiResult<CheckoutFees>> {
  const transport = deps.transport ?? defaultTransport;
  try {
    const res = await transport.post(CHECKOUT_FEES_PATH, checkoutFeesRequestBody(ctx), {
      headers: await attestationHeaders(),
    });
    const parsed = parseCheckoutFees(res.data, ctx.orderType);
    if (!parsed) {
      logger.warn("checkout.fees_invalid_response", { orderType: ctx.orderType });
      return fail(
        "DELIVERY_QUOTE_INVALID",
        "We couldn't get a delivery price. Please try again.",
        true,
      );
    }
    return ok(parsed);
  } catch (err) {
    // An unlinked outlet (409 STORE_NOT_LINKED) can never quote fees — every
    // retry fails identically, so say so with no retry affordance instead of a
    // generic "try again". httpClient preserves the response status/body code
    // on the mapped error (see mapTransportError).
    const status = Number((err as { status?: unknown })?.status);
    const bodyCode = (err as { response?: { data?: { code?: unknown } } })?.response?.data?.code;
    const code =
      typeof bodyCode === "string" && bodyCode.trim()
        ? bodyCode
        : typeof (err as { code?: unknown })?.code === "string"
          ? ((err as { code: string }).code ?? "")
          : "";
    if (code === STORE_NOT_LINKED || (status === 409 && !code)) {
      logger.warn("checkout.fees_store_not_linked", { orderType: ctx.orderType });
      return fail(STORE_NOT_LINKED, STORE_NOT_LINKED_MESSAGE, false);
    }
    // Never surface provider/transport text: the UI has fixed, honest copy.
    logger.warn("checkout.fees_request_failed", {
      orderType: ctx.orderType,
      message: err instanceof Error ? err.message : String(err),
    });
    return fail(
      "DELIVERY_QUOTE_FAILED",
      "We couldn't get a delivery price. Please try again.",
      true,
    );
  }
}

export const deliveryQuoteService = {
  quote: requestCheckoutFees,
};
