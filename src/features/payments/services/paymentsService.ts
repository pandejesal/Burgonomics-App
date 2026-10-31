/**
 * PaymentsService — transport layer.
 *
 * Each method connects to the secure backend payment endpoints:
 *   POST /payments/orders → createOrder
 *   POST /payments/verify → verify
 *
 * SEC-3 / PAY-1 / PAY-4 Lockdown:
 * Client-side self-approving simulations are completely disabled.
 * Orders MUST be created and verified via the backend.
 */
import { delay, fail, ok, type ApiResult } from "@/core/network/http";
import type {
  PaymentOrder,
  PaymentResult,
  PaymentVerification,
  PaymentStatus,
} from "@/features/payments/models";
import { appConfig } from "@/core/config/env";
import { logger } from "@/core/logging/logger";
import { secureStorage, SECURE_KEYS } from "@/core/storage/secureStorage";
import { usePaymentStore } from "@/features/payments/state/paymentStore";

/** PAYMENTS_CONTRACT_SPEC §1 enum. The app's `Fulfillment` maps 1:1. */
export type PaymentOrderType = "delivery" | "takeaway" | "dinein";

export interface CreateOrderInput {
  amount: number;
  currency: "INR";
  receipt: string;
  storeId: string;
  /** Legacy alias of `orderType` — kept so pre-contract servers still work. */
  fulfillment: string;
  /** Canonical order type (PAYMENTS_CONTRACT_SPEC §1). */
  orderType?: PaymentOrderType;
  /**
   * Internal Firestore order id created BEFORE the gateway opens
   * (PAYMENTS_CONTRACT_SPEC §1/§3) — the server binds the Razorpay order to
   * it and refuses an already-paid or foreign order.
   */
  orderId?: string;
  /** Pricing inputs the server reprices authoritatively (client amount is display-only). */
  items?: Array<{
    id?: string;
    productId?: string;
    price?: number;
    unitPrice?: number;
    name?: string;
    quantity?: number;
    customizations?: Array<{ price?: number; priceDelta?: number }>;
    modifiers?: Array<{ price?: number; priceDelta?: number }>;
  }>;
  branchId?: string;
  couponCode?: string;
  loyaltyPointsToRedeem?: number;
  /** Delivery-partner tip (₹) — a server-repriced input, like loyalty. */
  tipAmount?: number;
  /** Stable per checkout: retries reuse the open gateway order, no double charge. */
  idempotencyKey?: string;
  checkoutToken?: string;
  checkoutSnapshot?: Record<string, any>;
}

const getPaymentBaseUrl = (): string => {
  if (appConfig.integrations.paymentsApiBaseUrl) {
    return appConfig.integrations.paymentsApiBaseUrl.replace(/\/$/, "");
  }
  return "https://asia-south1-burgonomics-7faa8.cloudfunctions.net/api/payments";
};

async function backendPost<T>(path: string, body: unknown): Promise<T> {
  const base = getPaymentBaseUrl();
  if (!base) {
    throw new Error("Payment API endpoint is not configured.");
  }

  const token = await secureStorage.get(SECURE_KEYS.ACCESS_TOKEN);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  try {
    const { getAppCheckToken } = await import("@/core/config/firebase");
    const appCheckToken = await getAppCheckToken();
    if (appCheckToken) headers["X-Firebase-AppCheck"] = appCheckToken;
  } catch (err) {
    // Attestation unavailable — server runs monitor mode until enforced.
    // Logged (not silent): a broken attestation path must be visible before
    // enforcement day, or launch-day payments start failing attestation.
    const { logger } = await import("@/core/logging/logger");
    logger.warn("payments.appcheck_unavailable", {
      message: err instanceof Error ? err.message : String(err),
    });
  }

  // Adjust path if base already contains /payments
  const targetUrl = base.endsWith("/payments")
    ? `${base}${path.replace(/^\/payments/, "")}`
    : `${base}${path}`;

  const res = await fetch(targetUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  // Read the body once so both success and error paths can use it. Some
  // servers answer with an empty body; treat that as an empty object.
  const text = await res.text().catch(() => "");
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  // HTTP 202 can be syntactically "ok" (Response.ok is true for 200-299) but
  // here it means TRANSFER_IN_PROGRESS — a *pending*, retryable state, NOT a
  // successful verification and NOT a signature mismatch. Surface it as a typed
  // failure so callers can retry instead of showing a paid-success or false
  // failure message.
  if (res.status === 202) {
    const p = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
    const err: any = new Error(
      typeof p.error === "string" && p.error.trim()
        ? p.error
        : "Transfer in progress — retry payment verification shortly.",
    );
    err.code = typeof p.code === "string" && p.code.trim() ? p.code : "TRANSFER_IN_PROGRESS";
    err.statusCode = 202;
    const retryHeader = res.headers?.get?.("Retry-After");
    if (retryHeader && Number.isFinite(Number(retryHeader))) {
      err.retryAfterMs = Number(retryHeader) * 1000;
    }
    if (typeof p.retryAfterMs === "number" && Number.isFinite(p.retryAfterMs)) {
      err.retryAfterMs = p.retryAfterMs;
    }
    throw err;
  }

  if (!res.ok) {
    const p = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
    const serverMsg =
      typeof p.error === "string" && p.error.trim()
        ? p.error
        : `HTTP ${res.status} ${res.statusText} ${text}`.trim();
    const err: any = new Error(serverMsg);
    if (typeof p.code === "string" && p.code.trim()) err.code = p.code;
    err.statusCode = res.status;
    throw err;
  }

  return (payload && typeof payload === "object" ? payload : {}) as unknown as T;
}

export const paymentsService = {
  async createOrder(input: CreateOrderInput): Promise<ApiResult<PaymentOrder>> {
    // NaN <= 0 is false: without the finite check, NaN/Infinity amounts
    // sailed through, serialized as null, and opened ₹0/NaN gateway orders.
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      return fail("INVALID_AMOUNT", "Order amount must be greater than zero.");
    }

    try {
      // PAYMENTS_CONTRACT_SPEC §1: the server answers with canonical names
      // (`razorpayOrderId`, `amountPaise`) plus legacy aliases (`orderId`,
      // `amount` in rupees). Read canonical first, fall back to legacy.
      const raw = await backendPost<Record<string, unknown>>("/createPaymentOrder", input);
      const razorpayOrderId = String(raw.razorpayOrderId ?? raw.orderId ?? "");
      const amountPaise =
        typeof raw.amountPaise === "number" && Number.isFinite(raw.amountPaise)
          ? raw.amountPaise
          : typeof raw.amount === "number" && Number.isFinite(raw.amount)
            ? Math.round(raw.amount * 100)
            : undefined;
      const order: PaymentOrder = {
        orderId: razorpayOrderId,
        razorpayOrderId,
        keyId: typeof raw.keyId === "string" ? raw.keyId : "",
        amount:
          typeof raw.amount === "number" && Number.isFinite(raw.amount)
            ? raw.amount
            : (amountPaise ?? 0) / 100,
        amountPaise,
        currency: "INR",
        receipt: typeof raw.receipt === "string" ? raw.receipt : input.receipt,
        meta: (raw.meta as Record<string, unknown> | undefined) ?? undefined,
      };
      if (!order.orderId) {
        return fail("GATEWAY_ERROR", "The payment gateway returned no order id.", true);
      }
      return ok(order);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Payment gateway communication error";
      logger.error("payments.create_order_failed", err as Error);
      // Preserve structured server refusals exactly as the verify path does
      // (same policy: non-retryable codes stay put, only transport/provider
      // failures retry). The transport copies the HTTP body's `code` into
      // err.code, so a 409 ITEM_UNAVAILABLE / ITEM_PRICE_UNVERIFIED must reach
      // the caller instead of being collapsed into a local GATEWAY_ERROR -
      // otherwise the customer-facing curated lists in checkout/payment can
      // never match a server refusal and show a false "try again" for an
      // intentional refusal.
      const serverCode =
        typeof (err as any)?.code === "string" && (err as any).code.trim()
          ? (err as any).code
          : "GATEWAY_ERROR";
      const statusCode = (err as any)?.statusCode;
      const retryable =
        statusCode === 502 || statusCode === 503 || statusCode === 429 || statusCode === undefined;
      return fail(serverCode, message, retryable);
    }
  },

  async verify(result: PaymentResult): Promise<ApiResult<PaymentVerification>> {
    if (!result.signature || result.signature === "force_fail") {
      return fail("VERIFICATION_FAILED", "Invalid payment signature.", true);
    }

    // Central attachment for the checkout path (A3-safe): only attach the
    // pending internal id when the gateway order being verified is the one
    // the store bound the internal id to. A mismatch means a stale store and
    // must not be silently rebound — the server then fails closed on the
    // gateway id itself.
    const pendingStore = usePaymentStore.getState();
    const explicitInternal =
      typeof result.internalOrderId === "string" && result.internalOrderId.trim()
        ? result.internalOrderId
        : undefined;
    // Fail closed on a stale store binding (A3): when the in-flight gateway
    // order differs from the one the store bound the internal id to, do NOT
    // reuse either the store's or the (store-derived) caller's internal id.
    const gatewayMatches =
      !pendingStore.gatewayOrderId || pendingStore.gatewayOrderId === result.orderId;
    const internalOrderId = gatewayMatches
      ? (explicitInternal ?? pendingStore.internalOrderId ?? undefined)
      : undefined;
    const enrichedResult: PaymentResult = internalOrderId ? { ...result, internalOrderId } : result;

    const request = () =>
      backendPost<Record<string, unknown>>("/verifyPayment", {
        orderId: internalOrderId ?? result.orderId,
        razorpayOrderId: result.orderId,
        razorpayPaymentId: result.paymentId,
        razorpaySignature: result.signature,
        paymentId: result.paymentId,
        signature: result.signature,
        method: result.method,
      });

    const MAX_TRANSFER_ATTEMPTS = 3;
    let transferAttempt = 0;
    while (true) {
      try {
        // PAYMENTS_CONTRACT_SPEC §2: canonical names bind the gateway payment
        // to the INTERNAL order id (`internalOrderId`), with the pre-contract
        // aliases still present so an older server build keeps working. The
        // server MUST NOT require the order doc to pre-exist — it validates
        // against the payment-intent record keyed by `razorpayOrderId`.
        const raw = await request();
        // Preserve a structured server false result delivered as HTTP 200
        // (legacy envelope), e.g. ORDER_TERMINAL from R06. Do not collapse it
        // into a malformed/verified-false success.
        const serverCode = typeof raw.code === "string" && raw.code.trim() ? raw.code : "";
        if (raw.success !== true && serverCode) {
          const message =
            typeof raw.error === "string" && raw.error.trim()
              ? raw.error
              : "Payment verification failed";
          const retryable = serverCode === "TRANSFER_IN_PROGRESS";
          logger.warn("payments.verify_server_false", { code: serverCode, message });
          return fail(serverCode, message, retryable);
        }
        // Normalize the REAL backend success shape. The backend never returns a
        // `verified` flag: it answers with `success` + `confirmedOrderId` +
        // `paymentId` (+ deliveryOtp/transfer). Never trust an arbitrary
        // success flag on its own — require the confirmed order id (and
        // payment id, when supplied) to match the payment we actually
        // attempted, so a mismatched/stale response fails closed.
        const confirmedOrderId =
          typeof raw.confirmedOrderId === "string" ? raw.confirmedOrderId : "";
        const backendPaymentId =
          typeof raw.paymentId === "string"
            ? raw.paymentId
            : typeof raw.razorpayPaymentId === "string"
              ? raw.razorpayPaymentId
              : undefined;
        const razorpayOrderId =
          typeof raw.razorpayOrderId === "string" ? raw.razorpayOrderId : undefined;
        const deliveryOtp = typeof raw.deliveryOtp === "string" ? raw.deliveryOtp : undefined;

        const requestedInternal = internalOrderId ?? enrichedResult.orderId;
        const backendSuccess = raw.success === true;
        const confirmedMatches =
          confirmedOrderId.length > 0 && confirmedOrderId === requestedInternal;
        const paymentMatches = !backendPaymentId || backendPaymentId === enrichedResult.paymentId;
        const verified = backendSuccess && confirmedMatches && paymentMatches;

        const normalized: PaymentVerification = {
          verified,
          confirmedOrderId: verified ? confirmedOrderId : confirmedOrderId || "",
          razorpayOrderId,
          paymentId: backendPaymentId,
          deliveryOtp: verified ? deliveryOtp : undefined,
          transfer: verified ? raw.transfer : undefined,
        };
        return ok(normalized);
      } catch (err) {
        const code = (err as any)?.code;
        const statusCode = (err as any)?.statusCode;
        const message = err instanceof Error ? err.message : "Payment verification failed";

        const isTransferInProgress = code === "TRANSFER_IN_PROGRESS" || statusCode === 202;

        if (isTransferInProgress) {
          transferAttempt += 1;
          // Bounded retry of the SAME request (no new payment) honouring the
          // server's Retry-After / retryAfterMs. Retryable pending on
          // exhaustion rather than a false failure.
          if (transferAttempt < MAX_TRANSFER_ATTEMPTS) {
            let retryMs =
              typeof (err as any)?.retryAfterMs === "number" &&
              Number.isFinite((err as any).retryAfterMs)
                ? (err as any).retryAfterMs
                : 0;
            if (!retryMs) {
              logger.warn("payments.verify_transfer_pending_no_retry_after", {});
            }
            retryMs = Math.max(0, Math.min(retryMs, 5000));
            if (retryMs > 0) await delay(retryMs);
            continue;
          }
          logger.warn("payments.verify_transfer_in_progress_exhausted", {
            message,
          });
          return fail("TRANSFER_IN_PROGRESS", message, true);
        }

        // Preserve structured server codes (A2): 401/409/etc. stay
        // non-retryable and keep their code; only transient statuses retry.
        const serverCode = typeof code === "string" && code.trim() ? code : "VERIFY_GATEWAY_ERROR";
        const retryable =
          statusCode === 502 ||
          statusCode === 503 ||
          statusCode === 429 ||
          statusCode === undefined;
        logger.error("payments.verify_failed", err as Error);
        return fail(serverCode, message, retryable);
      }
    }
  },

  async cancel(orderId: string): Promise<ApiResult<null>> {
    await delay(100);
    if (!orderId) return fail("MISSING_ORDER", "No active payment to cancel.");
    return ok(null);
  },

  async getStatus(orderId: string): Promise<ApiResult<PaymentStatus>> {
    await delay(100);
    if (!orderId) return fail("MISSING_ORDER", "Unknown order.");
    return ok("waiting");
  },
};

/**
 * Codes that describe a payment outcome where no money was captured /
 * authorization is missing or invalid. Only these may drive `markPaymentFailed`
 * from the verify fail-closed arm: default/uncertain/captured-possible
 * outcomes must never downgrade an order's payment state. Treat any other code
 * (including the absence of a code) as a pending/sync state, not a failure.
 *
 * A08 B1 (C01): the signature codes were removed. `INVALID_SIGNATURE`,
 * `VERIFICATION_FAILED` and `SIGNATURE_MISMATCH` only prove an HMAC mismatch
 * (the server answers 401 without ever reading capture state), so a genuinely
 * captured payment whose callback was truncated/replayed answers identically —
 * treating it as "proven uncaptured" invited a re-pay on taken money. They now
 * fall through to the reconciliation path in `resolveVerifyOutcome`.
 *
 * `PAYMENT_NOT_CAPTURED` stays here (it IS a live-fetch proof of non-capture)
 * but `resolveVerifyOutcome` still routes it to reconciliation: `awaiting_
 * capture` means an authorization may be held and capture later, so no new
 * payment is offered automatically (A08 P4).
 */
export const UNCAPTURED_PAYMENT_ERROR_CODES = new Set<string>([
  "PAYMENT_NOT_CAPTURED",
  "PAYMENT_FAILED",
  "PAYMENT_DECLINED",
  "PAYMENT_NOT_AUTHORIZED",
]);

export function isUncapturedPaymentError(code: unknown): boolean {
  return typeof code === "string" && UNCAPTURED_PAYMENT_ERROR_CODES.has(code);
}
