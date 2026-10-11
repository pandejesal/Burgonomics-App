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

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText} ${text}`.trim());
  }
  return (await res.json()) as T;
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
      return fail("GATEWAY_ERROR", message, true);
    }
  },

  async verify(result: PaymentResult): Promise<ApiResult<PaymentVerification>> {
    if (!result.signature || result.signature === "force_fail") {
      return fail("VERIFICATION_FAILED", "Invalid payment signature.", true);
    }

    try {
      // PAYMENTS_CONTRACT_SPEC §2: canonical names bind the gateway payment
      // to the INTERNAL order id (`internalOrderId`), with the pre-contract
      // aliases still present so an older server build keeps working. The
      // server MUST NOT require the order doc to pre-exist — it validates
      // against the payment-intent record keyed by `razorpayOrderId`.
      const data = await backendPost<PaymentVerification>("/verifyPayment", {
        orderId: result.internalOrderId ?? result.orderId,
        razorpayOrderId: result.orderId,
        razorpayPaymentId: result.paymentId,
        razorpaySignature: result.signature,
        paymentId: result.paymentId,
        signature: result.signature,
        method: result.method,
      });
      return ok(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Payment verification failed";
      logger.error("payments.verify_failed", err as Error);
      return fail("VERIFY_GATEWAY_ERROR", message, true);
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
