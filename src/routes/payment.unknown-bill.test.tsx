/**
 * Unit/synthetic scenarios — NOT runtime evidence: this suite mounts the real
 * payment route with faked repositories inside jsdom. Nothing here performs a
 * live call or represents production behaviour.
 *
 * SYNTHETIC SAFETY SCENARIO — unknown bill with a persisted tip.
 *
 * The pay CTA disables on `finalPayable <= 0 || !isOnline || payBlocked` only.
 * `finalPayable` is computed from `totals?.grandTotal ?? 0`, so when the bill
 * computation has FAILED or is still PENDING while a positive tip was persisted
 * on the checkout screen, `finalPayable` is a tip-only number — the CTA reads as
 * payable and the online path creates the internal payment-pending order and
 * opens the gateway on an amount the customer was never shown ("—" on screen).
 * The checkout route already disables for `totals === null || totalsFailed`.
 *
 * Rendered, behavioural assertions only — the failure mode is the DOM state of
 * the real route, not a local formula. Also locks: retry re-runs the failed
 * computation, the known-bill flow stays enterable, and a computed zero remains
 * disabled (zero-payable semantics are about KNOWN totals, never substitutes).
 */
/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const fixture = vi.hoisted(() => {
  const cartState = {
    lines: [
      {
        lineId: "l1",
        productId: "p1",
        storeId: "store-A",
        name: "Test Burger",
        quantity: 1,
        unitPrice: 199,
        modifiers: [],
        availability: "available" as const,
      },
    ],
    promo: null,
  };
  const checkoutState = {
    orderNotes: "",
    deliveryInstructions: "",
    pickupInstructions: "",
    diningNotes: "",
    // Persisted from the cart/checkout screen: a positive tip must NOT let the
    // CTA read as payable while the bill itself is unknown.
    tipAmount: 20,
    loyaltyPointsToRedeem: 0,
    tableNumber: "",
  };
  return {
    hydration: { value: true },
    cartState,
    checkoutState,
    calculateTotals: vi.fn(),
    navigate: vi.fn(),
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  };
});

const validateForPayment = vi.hoisted(() =>
  vi.fn(async () => ({ success: true as const, data: { valid: true, issues: [] } })),
);
const createPaymentOrder = vi.hoisted(() => vi.fn());

const totals = (grandTotal: number) => ({
  success: true as const,
  data: {
    subtotal: grandTotal,
    itemDiscount: 0,
    promoDiscount: 0,
    taxes: 0,
    cgst: 0,
    sgst: 0,
    gstRate: 0.05,
    deliveryFee: 0,
    packingFee: 0,
    grandTotal,
    currency: "INR" as const,
  },
});

/* ── framework / shell ─────────────────────────────────────────────────── */
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (opts: Record<string, unknown>) => ({
    ...opts,
    options: opts,
    _$path: path,
  }),
  useNavigate: () => fixture.navigate,
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/shared/layouts/AppShell", () => ({
  AppShell: ({
    children,
    bottomSlot,
  }: {
    children: React.ReactNode;
    bottomSlot?: React.ReactNode;
  }) => (
    <main data-testid="app-shell">
      {children}
      {bottomSlot}
    </main>
  ),
}));
vi.mock("motion/react", () => ({
  motion: new Proxy(
    {},
    {
      get: () => (props: { children?: React.ReactNode }) => <div>{props.children}</div>,
    },
  ),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useReducedMotion: () => false,
}));

/* ── shared hooks / services ───────────────────────────────────────────── */
vi.mock("@/shared/hooks/useHydrated", () => ({ useHydrated: () => fixture.hydration.value }));
vi.mock("@/core/state/appConfigStore", () => ({
  useAppConfig: Object.assign(
    (select: (s: { isOnline: boolean }) => unknown) => select({ isOnline: true }),
    { getState: () => ({ isOnline: true }) },
  ),
}));
vi.mock("@/core/config/env", () => ({
  appConfig: { integrations: { razorpayKeyId: "" } },
  isDev: () => true,
  isReleaseBuild: () => false,
}));
vi.mock("@/core/services/haptics", () => ({
  HapticService: {
    impact: vi.fn(async () => {}),
    selection: vi.fn(),
    notification: vi.fn(async () => {}),
  },
}));
vi.mock("@/core/services/audio", () => ({
  AudioService: { playClick: vi.fn(), playSuccess: vi.fn() },
}));
vi.mock("@/core/logging/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/shared/components/feedback/AppToaster", () => ({
  toast: { success: fixture.toast.success, error: fixture.toast.error, info: fixture.toast.info },
}));

/* ── feature stores / repos (faked) ────────────────────────────────────── */
vi.mock("@/features/cart", () => ({
  cartRepository: { calculateTotals: fixture.calculateTotals, clear: vi.fn(async () => ({})) },
  useCartStore: Object.assign(
    (select: (s: typeof fixture.cartState) => unknown) => select(fixture.cartState),
    { getState: () => fixture.cartState },
  ),
  selectItemCount: (s: { lines: unknown[] }) => s.lines.length,
}));
vi.mock("@/features/checkout", () => ({
  useCheckoutStore: Object.assign(
    (select: (s: typeof fixture.checkoutState) => unknown) => select(fixture.checkoutState),
    { getState: () => ({ ...fixture.checkoutState, reset: vi.fn() }) },
  ),
  ReviewItemsList: () => null,
}));
vi.mock("@/features/stores/state/storeStore", () => {
  const state = {
    activeStore: {
      id: "store-A",
      name: "Surat Vesu",
      area: "Vesu",
      etaMinutes: 30,
      supports: { delivery: true, takeaway: true, dineIn: false },
    },
    fulfillment: "delivery",
  };
  return {
    useStoreSelection: Object.assign(
      (select: (s: typeof state) => unknown) => select(state),
      { getState: () => state },
    ),
    storeSupportsFulfillment: (
      store: { supports?: { delivery?: boolean; takeaway?: boolean; dineIn?: boolean } } | null,
      mode: string | null,
    ) => {
      if (!store || !mode) return false;
      if (mode === "delivery") return !!store.supports?.delivery;
      if (mode === "takeaway") return !!store.supports?.takeaway;
      if (mode === "dinein") return !!store.supports?.dineIn;
      return false;
    },
  };
});
vi.mock("@/features/auth/state/authStore", () => {
  const authState = {
    user: { id: "cust_bill", name: "Test Customer", phone: "+910000000000" },
    isBootstrapped: true,
  };
  return {
    useAuthStore: Object.assign((select: (s: typeof authState) => unknown) => select(authState), {
      getState: () => authState,
    }),
    selectIsAuthenticated: (s: { user: unknown }) => !!s.user,
  };
});
vi.mock("@/features/addresses", () => ({
  useAddressStore: (select: (s: unknown) => unknown) => select({ items: [], selectedId: null }),
  selectSelectedAddress: () => null,
}));
vi.mock("@/features/orders", () => ({
  orderRepository: {
    createFromCurrentContext: vi.fn(),
    finalizePaidOrder: vi.fn(),
    markPaymentFailed: vi.fn(),
  },
}));
vi.mock("@/features/payments/components/PaymentRecoveryPanel", () => ({
  PaymentRecoveryPanel: () => null,
}));
// Keep the REAL payment store (the route resets it on mount) — same pattern as
// payment.cod-consent.test.tsx.
vi.mock("@/features/payments", async () => {
  const { usePaymentStore } = await vi.importActual<
    typeof import("@/features/payments/state/paymentStore")
  >("@/features/payments/state/paymentStore");
  return {
    usePaymentStore,
    paymentRepository: {
      validateForPayment,
      createPaymentOrder,
      verifyPayment: vi.fn(),
      cancelPayment: vi.fn(),
    },
    razorpayAdapter: { initialize: vi.fn(async () => {}), openCheckout: vi.fn(async () => {}) },
    PaymentMethodList: () => null,
    SecurePaymentBadge: () => null,
    RazorpayModalHandler: () => null,
  };
});

import { Route as PaymentRoute } from "./payment";
import { usePaymentStore } from "@/features/payments/state/paymentStore";

const PaymentPage = (PaymentRoute as unknown as { options: { component: React.ComponentType } })
  .options.component;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  fixture.calculateTotals.mockReset();
  fixture.checkoutState.tipAmount = 20;
  validateForPayment.mockResolvedValue({ success: true, data: { valid: true, issues: [] } });
  createPaymentOrder.mockResolvedValue({
    success: true as const,
    data: {
      orderId: "order_bill_unknown_synth",
      amount: 219,
      currency: "INR",
      receipt: "rcpt_synth",
      keyId: "rzp_test_synth",
    },
  });
  usePaymentStore.getState().reset();
  sessionStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

function buttonWithText(text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button")).find((b) =>
    b.textContent?.includes(text),
  );
}

async function mountPayment() {
  await act(async () => root.render(<PaymentPage />));
  await act(async () => {});
}

describe("payment route — unknown bill must not be payable (synthetic scenarios)", () => {
  it("[synthetic] rejected bill computation + persisted tip: CTA disabled, honest error copy, retry re-computes, no payment started", async () => {
    // Bill computation REJECTS while a ₹20 tip is persisted → the only figure
    // the pre-fix formula produces is the tip; PAY must not read as payable.
    fixture.calculateTotals.mockRejectedValue(new Error("pricing offline"));

    await mountPayment();

    const pay = buttonWithText("Pay Online");
    expect(pay).toBeDefined();

    // Honest, visible error copy with the existing retry action (role=alert).
    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("Couldn't compute your bill");
    expect(buttonWithText("Retry")).toBeDefined();

    // THE FIX UNDER TEST: CTA disabled until the bill is actually computed.
    expect(pay!.disabled).toBe(true);
    expect(pay!.getAttribute("title")).toContain("Couldn't compute your bill");

    // Retry re-runs the failed computation (the route's own error-path action).
    const callsAfterMount = fixture.calculateTotals.mock.calls.length;
    await act(async () => buttonWithText("Retry")!.click());
    await act(async () => {});
    expect(fixture.calculateTotals.mock.calls.length).toBeGreaterThan(callsAfterMount);

    // Defense in depth: even if activated, NOTHING may start a payment order
    // while the bill is unknown — no preflight, no internal order, no gateway.
    await act(async () => pay!.click());
    await act(async () => {});
    expect(validateForPayment).not.toHaveBeenCalled();
    expect(createPaymentOrder).not.toHaveBeenCalled();
  });

  it("[synthetic] pending bill computation + persisted tip: CTA disabled with honest 'computing' state, no payment started", async () => {
    // Bill computation hangs (network stall) — the same unknown-bill hazard
    // without an error banner: the CTA must await the computed bill.
    fixture.calculateTotals.mockImplementation(() => new Promise<never>(() => {}));

    await mountPayment();

    const pay = buttonWithText("Pay Online");
    expect(pay).toBeDefined();
    expect(pay!.disabled).toBe(true);
    expect(pay!.getAttribute("title")).toContain("still being computed");

    await act(async () => pay!.click());
    await act(async () => {});
    expect(validateForPayment).not.toHaveBeenCalled();
    expect(createPaymentOrder).not.toHaveBeenCalled();
  });

  it("[synthetic] FailurePanel Retry with unknown bill reaches the guarded startPayment: no payment started, state is honestly actionable (idle), never stuck busy", async () => {
    // React suppresses synthetic clicks on disabled controls, so the covered
    // scenario is the REACHABLE guarded path: a failed payment retry
    // (FailurePanel Retry -> retry() -> startPayment()) while the bill
    // recompute has failed. The guard must (a) not start any payment and
    // (b) release the "retrying" state retry() set BEFORE the guard —
    // otherwise the CTA is stuck aria-busy/disabled with an empty label and
    // the failure surface vanishes until unmount.
    fixture.calculateTotals.mockRejectedValue(new Error("pricing offline"));

    await mountPayment();
    expect(container.textContent).toContain("Couldn't compute your bill");

    // Seed a retryable failed payment (an ordinary gateway decline) so the
    // FailurePanel and its Retry action render.
    act(() => {
      usePaymentStore.setState({
        status: "failed",
        failure: {
          code: "RAZORPAY_PAYMENT_FAILED",
          message: "Your payment could not be completed.",
          retryable: true,
        },
      });
    });
    await act(async () => {});
    expect(usePaymentStore.getState().status).toBe("failed");

    // The FailurePanel Retry is the LAST button whose text is exactly "Retry"
    // (the totalsFailed alert renders an earlier one; "Retry checkout" must
    // not match — exact match excludes it).
    const retryButtons = Array.from(container.querySelectorAll("button")).filter(
      (b) => b.textContent?.trim() === "Retry",
    );
    expect(retryButtons.length).toBeGreaterThanOrEqual(2);
    const failurePanelRetry = retryButtons[retryButtons.length - 1]!;
    expect(failurePanelRetry).toBeDefined();

    await act(async () => failurePanelRetry.click());
    await act(async () => {});

    // Nothing may start while the bill is unknown.
    expect(validateForPayment).not.toHaveBeenCalled();
    expect(createPaymentOrder).not.toHaveBeenCalled();

    // The guard must restore an actionable state: back to "idle" (the
    // pre-fix defect left status "retrying" -> CTA stuck loading forever).
    expect(usePaymentStore.getState().status).toBe("idle");
    const pay = buttonWithText("Pay Online");
    expect(pay).toBeDefined();
    expect(pay!.getAttribute("aria-busy")).not.toBe("true");

    // The honest, retryable error surface remains visible (role=alert) and
    // its own Retry re-computation action is still offered.
    expect(container.textContent).toContain("Couldn't compute your bill");
    expect(container.querySelector('[role="alert"]')).toBeDefined();
    expect(buttonWithText("Retry")).toBeDefined();
  });

  it("[synthetic] positive control: computed bill + persisted tip stays payable and the pay flow runs", async () => {
    // The fix must not over-disable: a successfully computed bill (₹199 + ₹20
    // persisted tip = ₹219) keeps the CTA enabled and the flow enterable.
    fixture.calculateTotals.mockResolvedValue(totals(199));

    await mountPayment();

    const pay = buttonWithText("Pay Online");
    expect(pay!.disabled).toBe(false);
    expect(container.textContent).toContain("219");

    await act(async () => pay!.click());
    await act(async () => {});
    expect(validateForPayment).toHaveBeenCalledTimes(1);
    expect(createPaymentOrder).toHaveBeenCalledTimes(1);
  });

  it("[synthetic] computed ZERO payable stays disabled (regression lock: zero-pay semantics on KNOWN totals only)", async () => {
    fixture.checkoutState.tipAmount = 0;
    fixture.calculateTotals.mockResolvedValue(totals(0));

    await mountPayment();

    const pay = buttonWithText("Pay Online");
    expect(pay!.disabled).toBe(true);
    expect(validateForPayment).not.toHaveBeenCalled();
    expect(createPaymentOrder).not.toHaveBeenCalled();
  });
});
