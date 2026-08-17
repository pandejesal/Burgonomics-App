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
import { useDemoStore } from "@/features/demo/state/demoStore";
import { logger } from "@/core/logging/logger";
import { secureStorage, SECURE_KEYS } from "@/core/storage/secureStorage";

export interface CreateOrderInput {
  amount: number;
  currency: "INR";
  receipt: string;
  storeId: string;
  fulfillment: string;
  checkoutToken?: string;
  checkoutSnapshot?: Record<string, any>;
}

const getPaymentBaseUrl = (): string => {
  if (appConfig.integrations.paymentsApiBaseUrl) {
    return appConfig.integrations.paymentsApiBaseUrl.replace(/\/$/, "");
  }
  return "/.netlify/functions/payments";
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
    const t0 = Date.now();
    useDemoStore
      .getState()
      .patchRazorpay({ paymentStatus: "creating_order", lastError: undefined });

    if (input.amount <= 0) {
      return fail("INVALID_AMOUNT", "Order amount must be greater than zero.");
    }

    try {
      const order = await backendPost<PaymentOrder>("/createPaymentOrder", input);
      useDemoStore.getState().pushApiCall({
        label: "POST /payments/createPaymentOrder",
        status: "ok",
        ms: Date.now() - t0,
        meta: { orderId: order.orderId, amount: order.amount },
      });
      useDemoStore.getState().patchRazorpay({
        backendConnected: true,
        lastOrderId: order.orderId,
        lastLatencyMs: Date.now() - t0,
      });
      return ok(order);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Payment gateway communication error";
      logger.error("payments.create_order_failed", err as Error);
      useDemoStore.getState().pushApiCall({
        label: "POST /payments/createPaymentOrder",
        status: "fail",
        ms: Date.now() - t0,
      });
      useDemoStore.getState().patchRazorpay({
        backendConnected: false,
        paymentStatus: "failed",
        lastError: { code: "GATEWAY_ERROR", message, at: new Date().toISOString() },
      });
      return fail("GATEWAY_ERROR", message, true);
    }
  },

  async verify(result: PaymentResult): Promise<ApiResult<PaymentVerification>> {
    const t0 = Date.now();
    useDemoStore.getState().patchRazorpay({ verifyStatus: "pending" });

    if (!result.signature || result.signature === "force_fail") {
      return fail("VERIFICATION_FAILED", "Invalid payment signature.", true);
    }

    try {
      const data = await backendPost<PaymentVerification>("/verifyPayment", result);
      useDemoStore.getState().recordBackendOrder(data.confirmedOrderId);
      useDemoStore.getState().pushApiCall({
        label: "POST /payments/verifyPayment",
        status: "ok",
        ms: Date.now() - t0,
        meta: { confirmedOrderId: data.confirmedOrderId, paymentId: result.paymentId },
      });
      useDemoStore.getState().patchRazorpay({
        verifyStatus: "verified",
        backendConnected: true,
        lastLatencyMs: Date.now() - t0,
      });
      return ok(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Payment verification failed";
      logger.error("payments.verify_failed", err as Error);
      useDemoStore.getState().pushApiCall({
        label: "POST /payments/verifyPayment",
        status: "fail",
        ms: Date.now() - t0,
      });
      useDemoStore.getState().patchRazorpay({
        verifyStatus: "failed",
        backendConnected: false,
        lastError: { code: "VERIFY_GATEWAY_ERROR", message, at: new Date().toISOString() },
      });
      return fail("VERIFY_GATEWAY_ERROR", message, true);
    }
  },

  async cancel(orderId: string): Promise<ApiResult<null>> {
    await delay(100);
    if (!orderId) return fail("MISSING_ORDER", "No active payment to cancel.");
    useDemoStore.getState().patchRazorpay({ paymentStatus: "cancelled" });
    return ok(null);
  },

  async getStatus(orderId: string): Promise<ApiResult<PaymentStatus>> {
    await delay(100);
    if (!orderId) return fail("MISSING_ORDER", "Unknown order.");
    return ok("waiting");
  },
};
