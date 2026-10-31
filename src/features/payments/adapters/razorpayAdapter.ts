/**
 * Razorpay adapter — interface + implementation.
 *
 * Runs in two honest modes — LIVE and TEST — plus one gateway-free path:
 *
 *   - Live mode — when the key is a `rzp_live_*` publishable key, the
 *      Razorpay Checkout script is injected and a real payment modal is
 *      opened.
 *   - Test mode — `rzp_test_*` keys are accepted OUTSIDE production builds
 *      (`isTestRunnerEnv() || import.meta.env.DEV || !isProductionBuild()`:
 *      dev server, staging bundle, Android/iOS debug APK, test runners). The
 *      same SDK + real checkout modal runs against the Razorpay TEST
 *      dashboard, so developers and QA exercise the genuine flow
 *      end-to-end. Production builds reject test keys and fail closed — a
 *      live key is mandatory.
 *   - Zero-charge orders (`amount === 0`, e.g. fully discounted / reward
 *      credits) complete immediately with a sentinel payment envelope —
 *      no SDK load, no Razorpay call, no money moves.
 *
 * Test runners (`VITEST=true` / `NODE_ENV=test`) never open a real modal:
 * `openCheckout` simulates the success callback instead.
 *
 * ⚠️  SECURITY
 *   - Never hold or reference the Razorpay SECRET key on the client.
 *   - Signature verification is always performed on the backend; the
 *     adapter only forwards the signed result envelope.
 *   - Only the publishable `keyId` reaches the client.
 *   - Production builds REQUIRE a live key (`rzp_live_*`); test keys are
 *     rejected at every entry point.
 */
import type {
  PaymentMethod,
  PaymentOrder,
  PaymentResult,
} from "@/core/integrations/razorpay/types";
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
/** Internal sentinel the core wrapper passes when no key is configured. */
const PLACEHOLDER_KEY_ID = "rzp_test_placeholder";
/** Sentinel envelope for gateway-free ₹0 orders. */
const ZERO_CHARGE_PAYMENT_ID = "pay_zero_charge";
const ZERO_CHARGE_SIGNATURE = "zero_charge_sig";

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
    return Promise.resolve(window.Razorpay);
  }
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<Ctor | null>((resolve) => {
    const s = document.createElement("script");
    s.src = SDK_SRC;
    s.async = true;
    s.onload = () => {
      const ok = Boolean(window.Razorpay);
      if (!ok) logger.warn("razorpay.sdk_missing_after_load");
      resolve(window.Razorpay ?? null);
    };
    s.onerror = () => {
      sdkPromise = null;
      logger.error("razorpay.sdk_load_failed", new Error("Checkout script failed to load"));
      resolve(null);
    };
    document.head.appendChild(s);
  });
  return sdkPromise;
}

// ── Environment helpers ────────────────────────────────────────────────
// `process` is NOT guaranteed in the browser bundle: Vite statically
// replaces only `process.env.NODE_ENV`, so every other `process.env.*`
// reference must be guarded — otherwise it throws ReferenceError at
// runtime in a real browser / device build.

const readProcessEnv = (): Record<string, string | undefined> | null => {
  if (typeof process === "undefined") return null;
  try {
    return process.env;
  } catch {
    return null;
  }
};

/** True inside Vitest (or any runner advertising NODE_ENV=test). */
const isTestRunnerEnv = (): boolean => {
  const env = readProcessEnv();
  return env?.VITEST === "true" || env?.NODE_ENV === "test";
};

/** True for production bundles (`import.meta.env` first, Node/test fallback). */
const isProductionBuild = (): boolean => {
  if (import.meta.env?.PROD === true || import.meta.env?.MODE === "production") {
    return true;
  }
  return readProcessEnv()?.NODE_ENV === "production";
};

/**
 * Test (`rzp_test_*`) publishable keys are allowed wherever the bundle is
 * NOT a production build: `isTestRunnerEnv() || import.meta.env.DEV ||
 * !isProductionBuild()`. The gate is the BUILD (import.meta.env.PROD), not
 * the configured `VITE_APP_ENV`: a release bundle that forgot to set it
 * used to sail through the old `appConfig.env !== "production"` escape
 * hatch and open real checkout with a test key. Production builds still
 * refuse test keys — a live key is mandatory there.
 */
const allowsTestKeys = (): boolean =>
  isTestRunnerEnv() || import.meta.env?.DEV === true || !isProductionBuild();

const hasBrowser = (): boolean => typeof window !== "undefined" && typeof document !== "undefined";

const isLiveKey = (keyId?: string): boolean => !!keyId && keyId.startsWith("rzp_live_");

/** A genuine test key — the internal `rzp_test_placeholder` sentinel excluded. */
const isTestKeyId = (keyId?: string): boolean =>
  !!keyId && keyId.startsWith("rzp_test_") && keyId !== PLACEHOLDER_KEY_ID;

/** Key is good enough to initialise the SDK for. */
const isUsableKeyId = (keyId?: string): boolean => {
  if (isLiveKey(keyId)) return true;
  if (isTestKeyId(keyId)) return allowsTestKeys();
  // Placeholder sentinel: only tolerable where no real modal can open.
  return keyId === PLACEHOLDER_KEY_ID && isTestRunnerEnv();
};

/** A real Razorpay checkout modal may be opened with this key. */
const canOpenRealCheckout = (keyId?: string): boolean => {
  if (!hasBrowser()) return false;
  if (isLiveKey(keyId)) return true;
  return isTestKeyId(keyId) && allowsTestKeys();
};

/** Fully discounted / reward-credit orders never reach the gateway. */
const isZeroCharge = (order: PaymentOrder): boolean => order.amount === 0;

const completeZeroCharge = (
  init: RazorpayInitInput,
  handlers: RazorpayHandlers,
  method: PaymentMethod,
): void => {
  logger.info("razorpay.zero_charge_complete", { orderId: init.order.orderId });
  handlers.onSuccess({
    orderId: init.order.orderId,
    paymentId: ZERO_CHARGE_PAYMENT_ID,
    signature: ZERO_CHARGE_SIGNATURE,
    method,
  });
};

// Preload the SDK as soon as a usable key is present so first-payment latency is low.
if (typeof window !== "undefined" && appConfig.integrations.razorpayKeyId) {
  const keyId = appConfig.integrations.razorpayKeyId;
  if (isTestKeyId(keyId) && !allowsTestKeys()) {
    // Production bundle carrying a test key: never preload it, and never
    // throw at module scope (a throw here aborts the entire app boot —
    // blank screen, React never mounts). initialize()/openCheckout() fail
    // closed at use-time; log loudly so the misconfiguration is fixed.
    console.error(
      "[Razorpay] FATAL: Production build cannot use test keys (rzp_test_*). " +
        "Set VITE_RAZORPAY_KEY_ID to a live key (rzp_live_*) before shipping.",
    );
  } else {
    void loadSdk();
  }
} else if (typeof window !== "undefined") {
  // No publishable key: warn instead of throwing at module scope — a throw
  // here aborts the entire app boot (blank screen, React never mounts).
  // initialize() below still rejects at use-time if a real payment is
  // attempted without a key.
  console.warn(
    "[Razorpay] No publishable key configured (VITE_RAZORPAY_KEY_ID). " +
      "Payments will fail closed until a key is set.",
  );
}

let currentInit: RazorpayInitInput | null = null;

export const razorpayAdapter: RazorpayAdapter = {
  name: "razorpay",

  async initialize(input) {
    currentInit = input;
    const order = input.order;

    // Zero-charge orders: nothing to load, nothing to validate — the
    // checkout completes gateway-free in openCheckout().
    if (isZeroCharge(order)) {
      logger.info("razorpay.zero_charge_skip_gateway", { orderId: order.orderId });
      return;
    }

    if (!isUsableKeyId(order.keyId)) {
      throw new Error(
        "[Razorpay] Invalid order configuration: missing or invalid publishable key.",
      );
    }

    // Live AND (non-production) test keys preload the real SDK, so dev
    // servers and debug APKs get the genuine checkout flow. Test runners
    // have no `window` — loadSdk() resolves null there without touching
    // the network.
    await loadSdk();
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

    // 1. Zero-charge (amount === 0): complete instantly — no SDK load, no
    //    Razorpay call, no money moves.
    if (isZeroCharge(init.order)) {
      completeZeroCharge(init, handlers, method);
      return;
    }

    // 2. Test runners never open a real modal — simulate the success
    //    callback so the surrounding flow stays end-to-end testable.
    if (isTestRunnerEnv()) {
      logger.info("razorpay.test_runner_simulation", { orderId: init.order.orderId });
      handlers.onSuccess({
        orderId: init.order.orderId,
        paymentId: "pay_test_simulated",
        signature: "simulated_test_sig",
        method,
      });
      return;
    }

    // 3. Real browser / device checkout: live keys always, test keys outside
    //    production (dev server, staging bundle, debug APK) against the
    //    Razorpay TEST dashboard.
    if (canOpenRealCheckout(init.order.keyId)) {
      const Ctor = await loadSdk();
      if (!Ctor) {
        handlers.onFailure({
          code: "SDK_LOAD_FAILED",
          description: "Could not load Razorpay Checkout.",
        });
        return;
      }
      const isRealRzpOrder = /^order_[A-Za-z0-9]{14}$/.test(init.order.orderId);
      // Razorpay dismisses the modal after `payment.failed` too, so onCancel
      // must not fire (and downgrade) a real failure — the caller's failure
      // copy/CTA is the honest surface.
      let failureReported = false;
      const options: Record<string, unknown> = {
        key: init.order.keyId,
        // Canonical gateway amount is paise (contract §1) — only fall back
        // to the rupees field (and its rounding) when the server sent none.
        amount: init.order.amountPaise ?? Math.round(init.order.amount * 100),
        currency: init.order.currency,
        name: "Burgonomics",
        description: "Burgonomics — 100% Pure Veg Burgers",
        image: "/brand/burgonomics-logo.png",
        prefill: init.prefill,
        theme: { color: init.theme?.color ?? "#0E4825" },
        modal: {
          ondismiss: () => {
            if (!failureReported) handlers.onCancel();
          },
        },
        handler: (resp: {
          razorpay_order_id?: string;
          razorpay_payment_id: string;
          razorpay_signature?: string;
        }) => {
          const orderId = resp.razorpay_order_id ?? init.order.orderId;
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
        failureReported = true;
        handlers.onFailure({ code, description, source: err.source });
      });
      rzp.open();
      return;
    }

    // 4. No usable key (production with a test key, missing key, or the
    //    placeholder sentinel in a real browser) — fail closed.
    throw new Error(
      "[Razorpay] No valid publishable key configured. " +
        "Set VITE_RAZORPAY_KEY_ID to a live key (rzp_live_*) before attempting payment.",
    );
  },
};
