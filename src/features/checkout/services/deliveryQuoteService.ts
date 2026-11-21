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
import { defaultFunctionsBase } from "@/core/config/functionsBase";
import { logger } from "@/core/logging/logger";
import { STORE_NOT_LINKED, STORE_CLOSED } from "@/features/payments/utils/paymentFailure";
import type {
  CashOnDeliveryQuote,
  CheckoutFeesContext,
  CheckoutOrderType,
} from "@/features/checkout/state/checkoutFeesTypes";
import { DEFAULT_CASH_ON_DELIVERY } from "@/features/checkout/state/checkoutFeesTypes";

export const CHECKOUT_FEES_PATH = "/checkout/fees";

/**
 * Absolute Functions URL for the fee quote. CUS-13: passing a relative path to
 * `httpClient` resolved against `appConfig.api.baseUrl`, whose fallback is
 * `https://api.dev.burgonomics.example` — CSP-blocked and not the API. The
 * Cloud Functions base is the only valid origin for this route.
 */
export function checkoutFeesUrl(): string {
  return `${defaultFunctionsBase()}${CHECKOUT_FEES_PATH}`;
}

/** Same honest sentence the payment screen uses for an unlinked outlet. */
export const STORE_NOT_LINKED_MESSAGE = "This outlet isn't taking online orders yet.";

/**
 * F2 (staging 2026-11-21, Test 9): the outlet is closed right now. Used only
 * when the response carried the code but no usable sentence — the server's own
 * copy wins whenever it is present.
 */
export const STORE_CLOSED_MESSAGE =
  "This outlet is closed right now, so online orders can't be placed. Please try again during opening hours.";

/** The server's own closed-outlet sentence, or the fixed fallback. */
function closedMessage(err: unknown): string {
  const bodyMessage = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
  if (typeof bodyMessage === "string" && bodyMessage.trim()) return bodyMessage.trim();
  const own = (err as { message?: unknown })?.message;
  if (typeof own === "string" && own.trim() && /closed/i.test(own)) return own.trim();
  return STORE_CLOSED_MESSAGE;
}

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
  /** Branch's cash-on-delivery switch + ceiling (owner decision 2026-11-20). */
  cashOnDelivery: CashOnDeliveryQuote;
}

export interface UnserviceableCheckoutFees {
  serviceable: false;
  packagingFee: number;
  reason: string | null;
  message: string;
  cashOnDelivery: CashOnDeliveryQuote;
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
  // Absolute URL: httpClient resolves absolute URLs verbatim and only prepends
  // the placeholder `appConfig.api.baseUrl` to relative ones.
  post: (url, body, init) => httpClient.post(url, body, init),
};

/** Injectable so tests can assert the exact headers without Firebase. */
export interface CheckoutFeesAuth {
  idToken?: () => Promise<string | null>;
  appCheckToken?: () => Promise<string | null>;
}

async function firebaseAuthTokens(): Promise<{
  idToken: () => Promise<string | null>;
  appCheckToken: () => Promise<string | null>;
}> {
  const { auth, getAppCheckToken } = await import("@/core/config/firebase");
  return {
    idToken: async () => (await auth.currentUser?.getIdToken()) ?? null,
    appCheckToken: async () => (await getAppCheckToken()) ?? null,
  };
}

/**
 * Bearer Firebase ID token (the `requireAuth` route needs it) plus the App
 * Check attestation header, mirroring `paymentsService` (X-Firebase-AppCheck).
 * Both are best-effort: a missing token is a 401/attestation answer from the
 * server, never a reason to invent one.
 */
export async function buildCheckoutFeesHeaders(
  deps: CheckoutFeesAuth = {},
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  try {
    let tokens: Awaited<ReturnType<typeof firebaseAuthTokens>> | null = null;
    const resolveTokens = async () => {
      tokens ??= await firebaseAuthTokens();
      return tokens;
    };
    const idToken = await (deps.idToken ?? (await resolveTokens()).idToken)();
    // Lowercase on purpose: `authSetup` injects `authorization` (lowercase) on
    // every httpClient request. A capital-A `Authorization` here would survive
    // as a SECOND header, and `new Headers()` joins the pair into
    // "Bearer T1, Bearer T2" — rejected by requireAuth. Lowercase lets the
    // interceptor's spread replace this value with the fresh token.
    if (idToken) headers.authorization = `Bearer ${idToken}`;
    const appCheckToken = await (deps.appCheckToken ?? (await resolveTokens()).appCheckToken)();
    if (appCheckToken) headers["X-Firebase-AppCheck"] = appCheckToken;
  } catch (err) {
    logger.warn("checkout.fees_auth_unavailable", {
      message: err instanceof Error ? err.message : String(err),
    });
  }
  return headers;
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
 * The branch's cash-on-delivery answer. An OLDER backend omits the field, so a
 * missing/odd value keeps the documented default (COD on, no ceiling stated) —
 * the create route is the authority and refuses a branch that has it off.
 */
export function parseCashOnDelivery(raw: unknown): CashOnDeliveryQuote {
  if (!raw || typeof raw !== "object") return DEFAULT_CASH_ON_DELIVERY;
  const block = raw as Record<string, unknown>;
  const enabled =
    typeof block.enabled === "boolean" ? block.enabled : DEFAULT_CASH_ON_DELIVERY.enabled;
  const cap = block.maxOrderValuePaise;
  const maxOrderValuePaise =
    typeof cap === "number" && Number.isSafeInteger(cap) && cap > 0
      ? cap
      : cap === null
        ? null
        : DEFAULT_CASH_ON_DELIVERY.maxOrderValuePaise;
  return { enabled, maxOrderValuePaise };
}

/**
 * Parses the endpoint's response. Returns null when a required field is
 * missing — the caller treats that as an error rather than inventing a fee.
 */
export function parseCheckoutFees(raw: unknown, orderType: CheckoutOrderType): CheckoutFees | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as Record<string, unknown>;
  const packagingFee = finiteFee(body.packagingFee);
  if (packagingFee === null) return null;
  const cashOnDelivery = parseCashOnDelivery(body.cashOnDelivery);

  if (orderType !== "delivery") {
    return {
      serviceable: true,
      packagingFee,
      deliveryFee: 0,
      deliveryQuoteId: null,
      provider: null,
      expiresAt: null,
      cashOnDelivery,
    };
  }

  if (body.serviceable === false) {
    return {
      serviceable: false,
      packagingFee,
      reason: typeof body.reason === "string" ? body.reason : null,
      message: typeof body.message === "string" ? body.message : "",
      cashOnDelivery,
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
    cashOnDelivery,
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
  deps: { transport?: CheckoutFeesTransport } & CheckoutFeesAuth = {},
): Promise<ApiResult<CheckoutFees>> {
  const transport = deps.transport ?? defaultTransport;
  try {
    const res = await transport.post(checkoutFeesUrl(), checkoutFeesRequestBody(ctx), {
      headers: await buildCheckoutFeesHeaders(deps),
    });
    const parsed = parseCheckoutFees(res.data, ctx.orderType);
    if (!parsed) {
      logger.warn("checkout.fees_invalid_response", { orderType: ctx.orderType });
      return fail(
        "DELIVERY_QUOTE_INVALID",
        "We couldn't load your order price. Please try again.",
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
    // F2 (staging 2026-11-21, Test 9): staff closed the outlet, so the server
    // refuses the quote. Static (the shop must reopen), so no retry affordance
    // and the customer reads the server's own sentence.
    if (code === STORE_CLOSED) {
      logger.warn("checkout.fees_store_closed", { orderType: ctx.orderType });
      return fail(STORE_CLOSED, closedMessage(err), false);
    }
    // Never surface provider/transport text: the UI has fixed, honest copy.
    logger.warn("checkout.fees_request_failed", {
      orderType: ctx.orderType,
      message: err instanceof Error ? err.message : String(err),
    });
    return fail(
      "DELIVERY_QUOTE_FAILED",
      "We couldn't load your order price. Please try again.",
      true,
    );
  }
}

export const deliveryQuoteService = {
  quote: requestCheckoutFees,
};
