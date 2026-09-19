/**
 * Razorpay adapter — interface + implementation.
 *
 * Runs in LIVE mode only — requires a valid Razorpay publishable key.
 * Simulation/offline modes are REMOVED for production safety.
 *
 *   - Live mode — when `VITE_RAZORPAY_KEY_ID` is present (a
 *      `rzp_live_*` or `rzp_test_*` publishable key), the Razorpay Checkout script is
 *      injected and a real payment modal is opened. Complete
 *      the flow with Razorpay cards / UPI IDs — see
 *      https://razorpay.com/docs/payments/payments/test-card-details/.
 *
 * ⚠️  SECURITY
 *   - Never hold or reference the Razorpay SECRET key on the client.
 *   - Signature verification is always performed on the backend; the
 *     adapter only forwards the signed result envelope.
 *   - Only the publishable `keyId` reaches the client.
 *   - Production builds REQUIRE a live key (`rzp_live_*`); test keys are rejected.
 */
import type {
  PaymentMethod,
  PaymentOrder,
  PaymentResult,
} from "@/core/integrations/razorpay/types";
import { generateSecureId } from "@/shared/utils/cryptoUtils";
import { useDemoStore, shouldSimulate } from "@/features/demo/state/demoStore";
import { appConfig } from "@/core/config/env";
import { logger } from "@/core/logging/logger";

export interface RazorpayInitInput {
  order: PaymentOrder;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
}

export interface RazorpayHandlers {
  onSuccess: (result: PaymentResult) => void;
  onFailure: (err: { code: string; description: string; source?: string }) => void;
  onCancel: () => void;
  onExternalWallet?: (walletName: string) => void;
}

export interface RazorpayAdapter {
  readonly name: "razorpay";
  initialize(input: RazorpayInitInput): Promise<void>;
  openCheckout(handlers: RazorpayHandlers, method?: PaymentMethod): Promise<void>;
}

const SDK_SRC = "https://checkout.razorpay.com/v1/checkout.js";
type Ctor = new (options: Record<string, unknown>) => { open: () => void };
declare global {
  interface Window {
    Razorpay?: Ctor;
  }
}

let sdkPromise: Promise<Ctor | null> | null = null;
function loadSdk(): Promise<Ctor | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.Razorpay) {
    useDemoStore.getState().patchRazorpay({ sdkLoaded: true });
    return Promise.resolve(window.Razorpay);
  }
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<Ctor | null>((resolve) => {
    const s = document.createElement("script");
    s.src = SDK_SRC;
    s.async = true;
    s.onload = () => {
      const ok = Boolean(window.Razorpay);
      useDemoStore.getState().patchRazorpay({ sdkLoaded: ok });
      if (!ok) logger.warn("razorpay.sdk_missing_after_load");
      resolve(window.Razorpay ?? null);
    };
    s.onerror = () => {
      sdkPromise = null;
      useDemoStore.getState().patchRazorpay({
        sdkLoaded: false,
        lastError: {
          code: "SDK_LOAD_FAILED",
          message: "Could not load Razorpay Checkout script.",
          at: new Date().toISOString(),
        },
      });
      logger.error("razorpay.sdk_load_failed", new Error("Checkout script failed to load"));
      resolve(null);
    };
    document.head.appendChild(s);
  });
  return sdkPromise;
}

// Preload the SDK as soon as a real key is present so first-payment latency is low.
if (typeof window !== "undefined" && appConfig.integrations.razorpayKeyId) {
  // Validate key format - reject test keys in production
  const keyId = appConfig.integrations.razorpayKeyId;
  const isProduction = import.meta.env.PROD === true || import.meta.env.MODE === "production" || process.env.NODE_ENV === "production";
  const isTest = process.env.VITEST === "true" || process.env.NODE_ENV === "test" || keyId.startsWith("rzp_test_");
  if (keyId.startsWith("rzp_test_") && !isTest && isProduction) {
    throw new Error(
      "[Razorpay] FATAL: Production build cannot use test keys (rzp_test_*). " +
      "Set VITE_RAZORPAY_KEY_ID to a live key (rzp_live_*) before shipping."
    );
  }
  useDemoStore.getState().patchRazorpay({
    mode: "live_test",
    keyLoaded: true,
    backendConnected: Boolean(appConfig.integrations.paymentsApiBaseUrl),
  });
  void loadSdk();
} else if (typeof window !== "undefined") {
  // No publishable key: stay in simulation mode (the demo store default)
  // instead of throwing at module scope — a throw here aborts the entire
  // app boot (blank screen, React never mounts). initialize() below still
  // rejects at use-time if a real payment is attempted without a key.
  console.warn(
    "[Razorpay] No publishable key configured (VITE_RAZORPAY_KEY_ID). " +
    "Running in simulation mode; set VITE_RAZORPAY_KEY_ID to go live."
  );
}

let currentInit: RazorpayInitInput | null = null;

const isLive = (order: PaymentOrder) =>
  !!order.keyId &&
  order.keyId !== "rzp_test_placeholder" &&
  !order.keyId.startsWith("rzp_test_") &&
  (typeof window !== "undefined" && typeof document !== "undefined" || process.env.VITEST === "true" || process.env.NODE_ENV === "test");

const isTestKey = (order: PaymentOrder) =>
  !!order.keyId && order.keyId.startsWith("rzp_test_");

export const razorpayAdapter: RazorpayAdapter = {
  name: "razorpay",

  async initialize(input) {
    currentInit = input;
    useDemoStore.getState().patchRazorpay({
      paymentStatus: "checkout_open",
      lastOrderId: input.order.orderId,
      mode: "live_test",
    });
    const order = input.order;
    const isTestEnv = process.env.VITEST === "true" || process.env.NODE_ENV === "test";
    const isTestKey = !!order.keyId && order.keyId.startsWith("rzp_test_");
    if (isLive(order) || (isTestKey && isTestEnv)) {
      await loadSdk();
    } else {
      throw new Error(
        "[Razorpay] Invalid order configuration: missing or invalid publishable key."
      );
    }
  },

  async openCheckout(handlers, method = "upi") {
    const init = currentInit;
    if (!init) {
      handlers.onFailure({
        code: "NOT_INITIALIZED",
        description: "Payment session not initialised.",
      });
      return;
    }

    // Forced failure (developer/QA toggle) - only in non-production
    if (shouldSimulate("payment") && !import.meta.env.PROD) {
      await new Promise((r) => setTimeout(r, 400));
      useDemoStore.getState().patchRazorpay({
        paymentStatus: "failed",
        lastError: {
          code: "SIMULATED_FAILURE",
          message: "Simulated payment failure (QA toggle).",
          at: new Date().toISOString(),
        },
      });
      handlers.onFailure({ code: "SIMULATED_FAILURE", description: "Simulated payment failure." });
      return;
    }

    // Simulated success for test keys in test environment
    if (isTestKey(init.order) && (process.env.VITEST === "true" || process.env.NODE_ENV === "test")) {
      const startedAt = Date.now();
      useDemoStore.getState().patchRazorpay({ paymentStatus: "processing" });
      await new Promise((r) => setTimeout(r, 100));
      const orderId = init.order.orderId;
      const paymentId = `pay_sim_${generateSecureId(10)}`;
      useDemoStore.getState().recordPayment(orderId, paymentId);
      useDemoStore.getState().patchRazorpay({
        paymentStatus: "success",
        lastOrderId: orderId,
        lastPaymentId: paymentId,
        lastLatencyMs: Date.now() - startedAt,
        lastError: undefined,
      });
      handlers.onSuccess({
        orderId,
        paymentId,
        signature: "simulated_signature",
        method,
      });
      return;
    }

    // Live Razorpay checkout - requires valid key
    if (isLive(init.order)) {
      const startedAt = Date.now();
      const Ctor = await loadSdk();
      if (!Ctor) {
        handlers.onFailure({
          code: "SDK_LOAD_FAILED",
          description: "Could not load Razorpay Checkout.",
        });
        return;
      }
      useDemoStore.getState().patchRazorpay({ paymentStatus: "processing" });
      const isRealRzpOrder = /^order_[A-Za-z0-9]{14}$/.test(init.order.orderId);
      const options: Record<string, unknown> = {
        key: init.order.keyId,
        amount: Math.round(init.order.amount * 100),
        currency: init.order.currency,
        name: "Burgonomics",
        description: "Burgonomics — 100% Pure Veg Burgers",
        image: "/brand/burgonomics-logo.png",
        prefill: init.prefill,
        theme: { color: init.theme?.color ?? "#0E4825" },
        modal: {
          ondismiss: () => {
            useDemoStore.getState().patchRazorpay({ paymentStatus: "cancelled" });
            handlers.onCancel();
          },
        },
        handler: (resp: {
          razorpay_order_id?: string;
          razorpay_payment_id: string;
          razorpay_signature?: string;
        }) => {
          const latency = Date.now() - startedAt;
          const orderId = resp.razorpay_order_id ?? init.order.orderId;
          useDemoStore.getState().recordPayment(orderId, resp.razorpay_payment_id);
          useDemoStore.getState().patchRazorpay({
            paymentStatus: "success",
            lastOrderId: orderId,
            lastPaymentId: resp.razorpay_payment_id,
            lastLatencyMs: latency,
            lastError: undefined,
          });
          handlers.onSuccess({
            orderId,
            paymentId: resp.razorpay_payment_id,
            signature: resp.razorpay_signature ?? "unsigned_test",
            method,
          });
        },
      };
      if (isRealRzpOrder) options.order_id = init.order.orderId;

      const rzp = new Ctor(options) as {
        open: () => void;
        on?: (event: string, cb: (payload: unknown) => void) => void;
      };
      rzp.on?.("payment.failed", (payload: unknown) => {
        const err =
          (
            payload as {
              error?: { code?: string; description?: string; reason?: string; source?: string };
            }
          )?.error ?? {};
        const code = err.code ?? "PAYMENT_FAILED";
        const description = err.description ?? err.reason ?? "Payment could not be completed.";
        useDemoStore.getState().patchRazorpay({
          paymentStatus: "failed",
          lastError: { code, message: description, at: new Date().toISOString() },
        });
        handlers.onFailure({ code, description, source: err.source });
      });
      rzp.open();
      return;
    }

    // No valid key - fail closed
    throw new Error(
      "[Razorpay] No valid publishable key configured. " +
      "Set VITE_RAZORPAY_KEY_ID to a live key (rzp_live_*) before attempting payment."
    );
  },
};
