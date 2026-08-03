/**
 * PaymentsService — transport layer.
 *
 * Each method mirrors the future REST contract:
 *   POST /v1/payments/orders          → createOrder
 *   POST /v1/payments/verify          → verify
 *   POST /v1/payments/:id/cancel      → cancel
 *   GET  /v1/payments/:id             → getStatus
 *
 * When `VITE_PAYMENTS_API_BASE_URL` is configured AND
 * `VITE_RAZORPAY_KEY_ID` is present, this layer calls the real backend
 * (`{base}/payments/orders`, `{base}/payments/verify`). Otherwise it
 * falls back to a deterministic simulation so QA can still test the
 * full journey offline.
 *
 * Backend contract (mirrors the NestJS PaymentsModule):
 *   POST /payments/orders
 *     req: { amount, currency, receipt, storeId, fulfillment, checkoutToken? }
 *     res: { orderId, keyId, amount, currency, receipt, meta? }
 *   POST /payments/verify
 *     req: { orderId, paymentId, signature, method }
 *     res: { verified: true, confirmedOrderId }
 *
 * Signature verification NEVER runs on the client — only the backend
 * holds the Razorpay secret.
 */
import { delay, fail, ok, type ApiResult } from "@/core/network/http";
import type {
  PaymentOrder,
  PaymentResult,
  PaymentVerification,
  PaymentStatus,
} from "@/features/payments/models";
import { appConfig } from "@/core/config/env";
import { useDemoStore, shouldSimulate } from "@/features/demo/state/demoStore";
import { logger } from "@/core/logging/logger";

export interface CreateOrderInput {
  amount: number;
  currency: "INR";
  receipt: string;
  storeId: string;
  fulfillment: string;
  checkoutToken?: string;
}

const hasRealBackend = () =>
  Boolean(appConfig.integrations.paymentsApiBaseUrl && appConfig.integrations.razorpayKeyId);

async function backendPost<T>(path: string, body: unknown): Promise<T> {
  const base = appConfig.integrations.paymentsApiBaseUrl.replace(/\/$/, "");
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
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

    if (shouldSimulate("network_timeout")) {
      await delay(12000);
      useDemoStore.getState().pushApiCall({
        label: "POST /v1/payments/orders",
        status: "fail",
        ms: Date.now() - t0,
      });
      useDemoStore.getState().patchRazorpay({
        paymentStatus: "failed",
        lastError: {
          code: "TIMEOUT",
          message: "Network timeout (simulated).",
          at: new Date().toISOString(),
        },
      });
      return fail("TIMEOUT", "Network timeout (simulated).", true);
    }

    // Live backend path.
    if (hasRealBackend()) {
      try {
        const order = await backendPost<PaymentOrder>("/payments/orders", input);
        useDemoStore.getState().pushApiCall({
          label: "POST /payments/orders",
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
        const message = err instanceof Error ? err.message : "Unknown gateway error";
        logger.error("payments.create_order_failed", err as Error);
        useDemoStore.getState().pushApiCall({
          label: "POST /payments/orders",
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
    }

    // Simulation path.
    await delay(450);
    const order: PaymentOrder = {
      orderId: `order_${Date.now()}`,
      keyId: appConfig.integrations.razorpayKeyId || "rzp_test_placeholder",
      amount: input.amount,
      currency: "INR",
      receipt: input.receipt,
      meta: {
        storeId: input.storeId,
        fulfillment: input.fulfillment,
        checkoutToken: input.checkoutToken,
        simulated: !appConfig.integrations.razorpayKeyId,
      },
    };
    useDemoStore.getState().pushApiCall({
      label: "POST /v1/payments/orders",
      status: "ok",
      ms: Date.now() - t0,
      meta: { orderId: order.orderId, amount: order.amount },
    });
    useDemoStore.getState().patchRazorpay({
      lastOrderId: order.orderId,
      lastLatencyMs: Date.now() - t0,
    });
    return ok(order);
  },

  async verify(result: PaymentResult): Promise<ApiResult<PaymentVerification>> {
    const t0 = Date.now();
    useDemoStore.getState().patchRazorpay({ verifyStatus: "pending" });

    if (shouldSimulate("payment") || result.signature === "force_fail") {
      await delay(600);
      useDemoStore.getState().pushApiCall({
        label: "POST /v1/payments/verify",
        status: "fail",
        ms: Date.now() - t0,
      });
      useDemoStore.getState().patchRazorpay({
        verifyStatus: "failed",
        paymentStatus: "failed",
        lastError: {
          code: "VERIFICATION_FAILED",
          message: "Signature check failed.",
          at: new Date().toISOString(),
        },
      });
      return fail("VERIFICATION_FAILED", "We couldn't verify the payment.", true);
    }

    // Live backend verification.
    if (hasRealBackend()) {
      try {
        const data = await backendPost<PaymentVerification>("/payments/verify", result);
        useDemoStore.getState().recordBackendOrder(data.confirmedOrderId);
        useDemoStore.getState().pushApiCall({
          label: "POST /payments/verify",
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
        const message = err instanceof Error ? err.message : "Unknown verify error";
        logger.error("payments.verify_failed", err as Error);
        useDemoStore.getState().pushApiCall({
          label: "POST /payments/verify",
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
    }

    // Simulation verify — always passes unless force_fail sentinel is set.
    await delay(600);
    const confirmedOrderId = `BURG-${Date.now().toString().slice(-8)}`;
    useDemoStore.getState().recordBackendOrder(confirmedOrderId);
    useDemoStore.getState().pushApiCall({
      label: "POST /v1/payments/verify",
      status: "ok",
      ms: Date.now() - t0,
      meta: { confirmedOrderId, paymentId: result.paymentId },
    });
    useDemoStore.getState().patchRazorpay({
      verifyStatus: "verified",
      lastLatencyMs: Date.now() - t0,
    });
    return ok({ verified: true, confirmedOrderId });
  },

  async cancel(orderId: string): Promise<ApiResult<null>> {
    await delay(200);
    if (!orderId) return fail("MISSING_ORDER", "No active payment to cancel.");
    useDemoStore.getState().patchRazorpay({ paymentStatus: "cancelled" });
    return ok(null);
  },

  async getStatus(orderId: string): Promise<ApiResult<PaymentStatus>> {
    await delay(200);
    if (!orderId) return fail("MISSING_ORDER", "Unknown order.");
    return ok("waiting");
  },
};
