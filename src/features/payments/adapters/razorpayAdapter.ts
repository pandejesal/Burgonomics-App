/**
 * Razorpay adapter — interface + implementation.
 *
 * Runs in one of two modes depending on runtime configuration:
 *
 *   1. Live test mode — when `VITE_RAZORPAY_KEY_ID` is present (a
 *      `rzp_test_*` publishable key), the Razorpay Checkout script is
 *      injected and a real test-mode payment modal is opened. Complete
 *      the flow with Razorpay test cards / UPI IDs — see
 *      https://razorpay.com/docs/payments/payments/test-card-details/.
 *
 *   2. Simulation mode — no key configured, or the demo `payment`
 *      failure toggle is on. Fires a synthetic success/failure so the
 *      full customer journey can still be exercised offline.
 *
 * ⚠️  SECURITY
 *   - Never hold or reference the Razorpay SECRET key on the client.
 *   - Signature verification is always performed on the backend; the
 *     adapter only forwards the signed result envelope.
 *   - Only the publishable `keyId` reaches the client.
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
  useDemoStore.getState().patchRazorpay({
    mode: "live_test",
    keyLoaded: true,
    backendConnected: Boolean(appConfig.integrations.paymentsApiBaseUrl),
  });
  void loadSdk();
} else if (typeof window !== "undefined") {
  useDemoStore.getState().patchRazorpay({ mode: "simulation", keyLoaded: false });
}

let currentInit: RazorpayInitInput | null = null;

const isLive = (order: PaymentOrder) =>
  !!order.keyId &&
  order.keyId !== "rzp_test_placeholder" &&
  typeof window !== "undefined" &&
  typeof document !== "undefined";

export const razorpayAdapter: RazorpayAdapter = {
  name: "razorpay",

  async initialize(input) {
    currentInit = input;
    useDemoStore.getState().patchRazorpay({
      paymentStatus: "checkout_open",
      lastOrderId: input.order.orderId,
      mode: isLive(input.order) ? "live_test" : "simulation",
    });
    if (isLive(input.order)) {
      await loadSdk();
    } else {
      await new Promise((r) => setTimeout(r, 200));
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

    // Forced failure (developer/QA toggle).
    if (shouldSimulate("payment")) {
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

    // Live Razorpay test-mode checkout.
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
      // Only pass `order_id` when it was minted by the backend (real
      // Razorpay order ids start with `order_` followed by 14 base62
      // chars). Client-simulated ids would make Razorpay reject the
      // checkout with a silent error and leave the UI hanging.
      const isRealRzpOrder = /^order_[A-Za-z0-9]{14}$/.test(init.order.orderId);
      const options: Record<string, unknown> = {
        key: init.order.keyId,
        amount: Math.round(init.order.amount * 100),
        currency: init.order.currency,
        name: "Burgonomics",
        description: "House of DAMN GOOD BURGERS!!",
        prefill: init.prefill,
        theme: { color: init.theme?.color ?? "#EF6124" },
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
      // Razorpay fires `payment.failed` for gateway/validation errors
      // (invalid order, network drop, bank decline). Without this
      // listener the modal shows the error but our UI stays "waiting".
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

    // Simulation success (no SDK / test key configured).
    const startedAt = Date.now();
    useDemoStore.getState().patchRazorpay({ paymentStatus: "processing" });
    await new Promise((r) => setTimeout(r, 800));
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
    handlers.onSuccess({ orderId, paymentId, signature: "simulated_signature", method });
  },
};
