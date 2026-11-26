/**
 * "Cancel order" on the failure panel must not pretend the gateway cancelled.
 *
 * SYNTHETIC: this suite mounts the REAL payment route in jsdom with the
 * repository/transport boundaries faked. Nothing here performs a live call.
 *
 * The backend exposes only /createPaymentOrder, /verifyPayment, /refund and
 * /webhook — there is NO cancellation route and NO status read. The failure
 * panel nevertheless offers "Cancel order", and the route used to call the
 * (fabricated-success) transport, then unconditionally `reset()` the payment
 * store and navigate away. A customer's gateway order, internal order id and
 * reconciliation references are what a support agent needs to trace money, so
 * a refused/unavailable cancellation must never discard them, and tapping
 * "Cancel order" must never be mistaken for a completed cancellation.
 *
 * Assertions are rendered/behavioural against the real route plus the real
 * payment store; only the network-facing collaborators are faked.
 *
 * @vitest-environment jsdom
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

/** Synthetic fixtures only — no live ids, phones or customer data. */
const GATEWAY_ORDER_ID = "order_synth_cancel_attempt_1";
const INTERNAL_ORDER_ID = "ord_synth_cancel_attempt_1";

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
    tipAmount: 0,
    loyaltyPointsToRedeem: 0,
    tableNumber: "",
  };
  return {
    cartState,
    checkoutState,
    calculateTotals: vi.fn(),
    navigate: vi.fn(),
    clearCart: vi.fn(async () => ({ success: true as const })),
    validateForPayment: vi.fn(),
    createPaymentOrder: vi.fn(),
    verifyPayment: vi.fn(),
    cancelPayment: vi.fn(),
    sdkInitialize: vi.fn(async () => {}),
    sdkOpen: vi.fn(async () => {}),
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  };
});

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
  Link: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/shared/layouts/AppShell", () => ({
  AppShell: ({
    children,
    bottomSlot,
  }: {
    children?: React.ReactNode;
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
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  useReducedMotion: () => false,
}));
// The reprice dialog is Radix-based; no reprice prompt is opened in this suite.
vi.mock("@/shared/components/common/ConfirmDialog", () => ({
  ConfirmDialog: () => null,
}));

/* ── shared hooks / services ───────────────────────────────────────────── */
vi.mock("@/shared/hooks/useHydrated", () => ({ useHydrated: () => true }));
vi.mock("@/core/state/appConfigStore", () => ({
  useAppConfig: Object.assign(
    (select: (s: { isOnline: boolean }) => unknown) => select({ isOnline: true }),
    { getState: () => ({ isOnline: true }) },
  ),
}));
vi.mock("@/core/config/env", () => ({
  appConfig: { env: "development", integrations: { razorpayKeyId: "" } },
  isDev: () => true,
  isStagingBuild: () => false,
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
  AudioService: { playClick: vi.fn(), playSuccess: vi.fn(), playError: vi.fn() },
}));
vi.mock("@/core/logging/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/shared/components/feedback/AppToaster", () => ({
  toast: { success: fixture.toast.success, error: fixture.toast.error, info: fixture.toast.info },
}));

/* ── feature stores / repos (faked) ────────────────────────────────────── */
vi.mock("@/features/cart", () => ({
  cartRepository: {
    calculateTotals: fixture.calculateTotals,
    clear: fixture.clearCart,
    prepareCheckout: vi.fn(async () => ({ success: true, data: { checkoutToken: "ct_synth" } })),
  },
  useCartStore: Object.assign(
    (select: (s: typeof fixture.cartState) => unknown) => select(fixture.cartState),
    { getState: () => fixture.cartState },
  ),
  selectItemCount: (s: { lines: unknown[] }) => s.lines.length,
}));
vi.mock("@/features/checkout", () => {
  // A fixed usable server quote: the quote machine has its own suites, and this
  // suite is about what "Cancel order" does to payment state.
  const readyFees = {
    status: "ready" as const,
    orderType: "delivery" as const,
    packagingFee: 0,
    deliveryFee: 0,
    deliveryQuoteId: "q_synth",
    provider: "synthetic",
    expiresAt: Date.now() + 3_600_000,
  };
  const readyView = {
    payEnabled: true,
    status: "ready" as const,
    message: null,
    canRetry: false,
    showTotal: true,
    takeawaySelectable: false,
    storeNotLinked: false,
  };
  return {
    useCheckoutStore: Object.assign(
      (select: (s: typeof fixture.checkoutState) => unknown) => select(fixture.checkoutState),
      { getState: () => ({ ...fixture.checkoutState, checkoutFees: readyFees, reset: vi.fn() }) },
    ),
    useCheckoutFees: () => ({
      state: readyFees,
      view: readyView,
      refresh: vi.fn(async () => readyFees),
    }),
    deliveryQuoteView: () => readyView,
    isDeliveryQuoteRefusal: () => false,
    ReviewItemsList: () => null,
  };
});
vi.mock("@/features/stores/state/storeStore", () => {
  const state = {
    activeStore: {
      id: "store-A",
      name: "Synthetic Outlet",
      area: "Test Area",
      etaMinutes: 30,
      supports: { delivery: true, takeaway: true, dineIn: false },
    },
    fulfillment: "delivery",
  };
  return {
    useStoreSelection: Object.assign((select: (s: typeof state) => unknown) => select(state), {
      getState: () => state,
    }),
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
    user: { id: "uid_synth_cancel", name: "Synthetic Customer", phone: "+910000000000" },
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
    // A6-c11 item 1: the cash attempt is TTL/basket gated before any replay.
    pendingCashAttempt: () => null,
    createOnlineDraft: vi.fn(),
    finalizePaidOrder: vi.fn(),
    markPaymentFailed: vi.fn(),
  },
}));
vi.mock("@/features/payments/components/PaymentRecoveryPanel", () => ({
  PaymentRecoveryPanel: () => null,
}));
// Keep the REAL payment store: the route's own reset and the seeded ids under
// test are the same store a customer session uses.
vi.mock("@/features/payments", async () => {
  const { usePaymentStore } = await vi.importActual<
    typeof import("@/features/payments/state/paymentStore")
  >("@/features/payments/state/paymentStore");
  return {
    usePaymentStore,
    paymentRepository: {
      validateForPayment: fixture.validateForPayment,
      createPaymentOrder: fixture.createPaymentOrder,
      verifyPayment: fixture.verifyPayment,
      cancelPayment: fixture.cancelPayment,
    },
    razorpayAdapter: { initialize: fixture.sdkInitialize, openCheckout: fixture.sdkOpen },
    PaymentMethodList: () => null,
    SecurePaymentBadge: () => null,
    RazorpayModalHandler: () => null,
  };
});

import { Route as PaymentRoute } from "./payment";
import { usePaymentStore } from "@/features/payments/state/paymentStore";
import type { PaymentOrder } from "@/features/payments/models";

const PaymentPage = (PaymentRoute as unknown as { options: { component: React.ComponentType } })
  .options.component;

const gatewayOrder: PaymentOrder = {
  orderId: GATEWAY_ORDER_ID,
  razorpayOrderId: GATEWAY_ORDER_ID,
  keyId: "rzp_test_synthetic",
  amount: 199,
  amountPaise: 19900,
  currency: "INR",
  receipt: "rcpt_synth_cancel",
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  fixture.calculateTotals.mockReset();
  fixture.calculateTotals.mockResolvedValue(totals(199));
  fixture.validateForPayment.mockResolvedValue({
    success: true as const,
    data: { valid: true, issues: [] },
  });
  fixture.cancelPayment.mockReset();
  fixture.createPaymentOrder.mockReset();
  fixture.verifyPayment.mockReset();
  usePaymentStore.getState().reset();
  sessionStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  // Restore any stubbed promise behaviour so a pending deferred cannot leak.
  fixture.cancelPayment.mockReset();
  usePaymentStore.getState().reset();
  sessionStorage.clear();
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

/**
 * Seed a failed attempt that already has BOTH references: the internal
 * `orders/{id}` document created before the gateway opened, and the Razorpay
 * order it was bound to. These are the two things a cancellation must never
 * silently drop.
 */
async function seedFailedAttemptWithGatewayOrder() {
  act(() => {
    usePaymentStore.setState({
      status: "failed",
      failure: {
        code: "RAZORPAY_PAYMENT_FAILED",
        message: "Your payment could not be completed.",
        retryable: true,
      },
      order: gatewayOrder,
      internalOrderId: INTERNAL_ORDER_ID,
      gatewayOrderId: GATEWAY_ORDER_ID,
      reconciliationPending: false,
      reconciliationReason: null,
    });
  });
  await act(async () => {});
}

/**
 * The most common real path: the customer dismissed the Razorpay modal, so the
 * attempt is ALREADY recorded as cancelled-by-user (`USER_CANCELLED`) with a
 * gateway order bound to an internal `orders/{id}`. That status is truthful
 * about the dismissed ATTEMPT — it says nothing about the gateway order, which
 * may still be payable. Tapping "Cancel order" from this panel must therefore
 * not quietly reset the reference set or navigate away from the panel.
 */
async function seedDismissedGatewayModal() {
  act(() => {
    usePaymentStore.setState({
      status: "cancelled",
      failure: {
        code: "USER_CANCELLED",
        message: "Payment modal was dismissed.",
        retryable: true,
      },
      order: gatewayOrder,
      internalOrderId: INTERNAL_ORDER_ID,
      gatewayOrderId: GATEWAY_ORDER_ID,
      reconciliationPending: false,
      reconciliationReason: null,
    });
  });
  await act(async () => {});
}

/**
 * A refused/unavailable cancellation must leave the customer with a bounded,
 * VISIBLE instruction rather than a dead control: either the honest failure
 * panel is still on screen, or a toast reports the refusal. The exact copy is
 * the parent's decision, so this asserts the surface, not the wording.
 *
 * Both halves fail on the pre-fix behaviour, which resets the store and
 * navigates away: the panel vanishes and nothing is said.
 */
function expectBoundedGuidanceAfterRefusal(before: { toasts: number }) {
  expect(fixture.toast.success).not.toHaveBeenCalled();
  const toastCalls = fixture.toast.error.mock.calls.length + fixture.toast.info.mock.calls.length;
  const alert = container.querySelector('[role="alert"]');
  const alertGuidance = alert !== null && (alert.textContent ?? "").trim().length > 0;
  expect(alertGuidance || toastCalls > before.toasts).toBe(true);
}

/**
 * A refused cancellation must not be relabelled as a completed one: the
 * failure panel's "Payment cancelled" branch claims the gateway cancelled,
 * which is exactly the fake-live status this slice removes.
 */
function expectNoFakeCancellationClaim() {
  expect(container.textContent ?? "").not.toContain("Payment cancelled");
}

function surfaceSnapshot() {
  return {
    toasts: fixture.toast.error.mock.calls.length + fixture.toast.info.mock.calls.length,
  };
}

/**
 * The attempt may name either real reference it is holding (the gateway order
 * or the internal document) — what it must never do is invent an id or send
 * more than one attempt. A route that refuses locally, without touching the
 * transport (nothing to cancel against), is equally honest, so zero calls is
 * allowed here.
 */
function expectNoInventedCancelRequest() {
  expect(fixture.cancelPayment.mock.calls.length).toBeLessThanOrEqual(1);
  for (const [sent] of fixture.cancelPayment.mock.calls as Array<[unknown]>) {
    expect([GATEWAY_ORDER_ID, INTERNAL_ORDER_ID]).toContain(sent);
  }
}

describe("payment route — 'Cancel order' must not fake a gateway cancellation", () => {
  it("a dismissed gateway modal stays 'cancelled' with its references when the cancellation is refused", async () => {
    // The dominant real path: the customer closed the Razorpay pop-up. The
    // attempt legitimately reads "Payment cancelled" (the ATTEMPT was
    // dismissed) and still holds a bound gateway order plus the internal
    // `orders/{id}`. Nothing here says the gateway order is gone.
    fixture.cancelPayment.mockResolvedValue({
      success: false,
      error: {
        code: "PAYMENT_CANCEL_UNSUPPORTED",
        message: "Order cancellation isn't available in the app yet.",
        retryable: false,
      },
    });

    await mountPayment();
    await seedDismissedGatewayModal();
    expect(buttonWithText("Cancel order")).toBeDefined();
    const before = surfaceSnapshot();
    expect(usePaymentStore.getState().status).toBe("cancelled");
    expect(fixture.cancelPayment).not.toHaveBeenCalled();

    await act(async () => buttonWithText("Cancel order")!.click());
    await act(async () => {});

    // A refusal names a real bound reference, at most once.
    expectNoInventedCancelRequest();

    // The pre-existing status is TRUTHFUL about the dismissed attempt and must
    // not be overwritten, reset to idle, or flipped to a success. (The
    // "Payment cancelled" title is therefore deliberately NOT asserted against
    // in this case — see the failed-seeded cases for that check.)
    const state = usePaymentStore.getState();
    expect(state.status).toBe("cancelled");
    expect(state.failure?.code).toBe("USER_CANCELLED");
    expect(state.failure?.retryable).toBe(true);
    expect(state.order?.orderId).toBe(GATEWAY_ORDER_ID);
    expect(state.internalOrderId).toBe(INTERNAL_ORDER_ID);
    expect(state.gatewayOrderId).toBe(GATEWAY_ORDER_ID);

    // No reset, no cart clear, no navigation merely because of the refusal.
    expect(fixture.clearCart).not.toHaveBeenCalled();
    expect(fixture.navigate).not.toHaveBeenCalled();
    expect(fixture.toast.success).not.toHaveBeenCalled();

    // The customer is told something (panel copy or a toast) rather than left
    // with a control that silently does nothing.
    expectBoundedGuidanceAfterRefusal(before);

    // A cancellation attempt moves no money and starts nothing new.
    expect(fixture.createPaymentOrder).not.toHaveBeenCalled();
    expect(fixture.verifyPayment).not.toHaveBeenCalled();
    expect(fixture.sdkOpen).not.toHaveBeenCalled();
  });

  it("a structured refusal keeps the order, both references and the failure on screen", async () => {
    fixture.cancelPayment.mockResolvedValue({
      success: false,
      error: {
        code: "PAYMENT_CANCEL_UNSUPPORTED",
        message: "This payment can't be cancelled from here. Check your orders or contact support.",
        retryable: false,
      },
    });

    await mountPayment();
    await seedFailedAttemptWithGatewayOrder();
    expect(buttonWithText("Cancel order")).toBeDefined();
    const before = surfaceSnapshot();

    await act(async () => buttonWithText("Cancel order")!.click());
    await act(async () => {});

    // The attempt asked about a reference it was actually showing — never an
    // invented id, and never a second attempt.
    expectNoInventedCancelRequest();

    // Nothing was cleared or navigated merely because the customer tapped
    // "Cancel order": the references support needs are still here.
    const state = usePaymentStore.getState();
    // Stays on the honest failure surface — never a reset to a fresh idle
    // screen (that is the discard bug), never "cancelled" (the panel would then
    // claim the gateway cancelled), never success.
    expect(state.status).not.toBe("idle");
    expect(state.status).not.toBe("cancelled");
    expect(state.status).not.toBe("success");
    expect(state.failure).not.toBeNull();
    expect(state.order?.orderId).toBe(GATEWAY_ORDER_ID);
    expect(state.internalOrderId).toBe(INTERNAL_ORDER_ID);
    expect(state.gatewayOrderId).toBe(GATEWAY_ORDER_ID);
    expect(fixture.clearCart).not.toHaveBeenCalled();
    expect(fixture.navigate).not.toHaveBeenCalled();

    // The honest failure surface is still rendered, with guidance telling the
    // customer what to do instead of a false "cancelled" confirmation.
    expect(container.querySelector('[role="alert"]')).toBeTruthy();
    expectBoundedGuidanceAfterRefusal(before);
    expectNoFakeCancellationClaim();

    // A cancellation attempt starts no money movement of any kind.
    expect(fixture.createPaymentOrder).not.toHaveBeenCalled();
    expect(fixture.verifyPayment).not.toHaveBeenCalled();
    expect(fixture.sdkOpen).not.toHaveBeenCalled();
  });

  it("a thrown transport failure is handled, not escaped, and the references survive", async () => {
    fixture.cancelPayment.mockRejectedValue(new Error("transport unavailable"));

    await mountPayment();
    await seedFailedAttemptWithGatewayOrder();
    const before = surfaceSnapshot();

    // A rejection escaping the click handler becomes an unhandled rejection.
    // Capture it explicitly: letting the harness swallow it would hide exactly
    // the defect this case is about. Only THIS transport's rejection is
    // counted, so an unrelated floating promise cannot flake the case.
    const escaped: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      if (reason instanceof Error && reason.message === "transport unavailable") {
        escaped.push(reason);
      }
    };
    process.on("unhandledRejection", onUnhandled);

    let clickError: unknown = null;
    try {
      await act(async () => buttonWithText("Cancel order")!.click());
      await act(async () => {});
      // Drain the microtask/task queue so a floating rejection is observed.
      await new Promise<void>((resolve) => setTimeout(() => resolve(), 0));
    } catch (err) {
      clickError = err;
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }

    // Nothing may escape: no thrown error out of the handler, and no promise
    // left unhandled.
    expect(clickError).toBeNull();
    expect(escaped).toEqual([]);

    const state = usePaymentStore.getState();
    // Stays on the honest failure surface — never a reset to a fresh idle
    // screen (that is the discard bug), never "cancelled" (the panel would then
    // claim the gateway cancelled), never success.
    expect(state.status).not.toBe("idle");
    expect(state.status).not.toBe("cancelled");
    expect(state.status).not.toBe("success");
    expect(state.failure).not.toBeNull();
    expect(state.order?.orderId).toBe(GATEWAY_ORDER_ID);
    expect(state.internalOrderId).toBe(INTERNAL_ORDER_ID);
    expect(state.gatewayOrderId).toBe(GATEWAY_ORDER_ID);
    expect(fixture.clearCart).not.toHaveBeenCalled();
    expect(fixture.navigate).not.toHaveBeenCalled();
    expectBoundedGuidanceAfterRefusal(before);
    expectNoFakeCancellationClaim();
  });

  it("holds the state and navigation until the cancellation result is known", async () => {
    const deferred: { resolve: ((value: unknown) => void) | null } = { resolve: null };
    fixture.cancelPayment.mockImplementation(
      () =>
        new Promise((resolve) => {
          deferred.resolve = resolve;
        }),
    );

    await mountPayment();
    await seedFailedAttemptWithGatewayOrder();
    const before = surfaceSnapshot();

    await act(async () => buttonWithText("Cancel order")!.click());
    await act(async () => {});

    // Still pending: the screen must not have reset, cleared or navigated on
    // the assumption that a cancellation is happening. (A route that refuses
    // locally without calling the transport is also honest — it must then just
    // be in that same untouched state.)
    expectNoInventedCancelRequest();
    expect(fixture.navigate).not.toHaveBeenCalled();
    expect(fixture.clearCart).not.toHaveBeenCalled();
    const pendingState = usePaymentStore.getState();
    expect(pendingState.status).not.toBe("idle");
    expect(pendingState.status).not.toBe("success");
    expect(pendingState.failure).not.toBeNull();
    expect(pendingState.internalOrderId).toBe(INTERNAL_ORDER_ID);
    expect(pendingState.gatewayOrderId).toBe(GATEWAY_ORDER_ID);
    // No polling, no second payment and no refund kicked off while waiting.
    expect(fixture.createPaymentOrder).not.toHaveBeenCalled();
    expect(fixture.verifyPayment).not.toHaveBeenCalled();
    expect(fixture.sdkOpen).not.toHaveBeenCalled();

    // The backend has no cancellation contract, so the pending call resolves
    // with the same honest refusal; the references must still survive it.
    await act(async () => {
      deferred.resolve?.({
        success: false,
        error: {
          code: "PAYMENT_CANCEL_UNSUPPORTED",
          message:
            "This payment can't be cancelled from here. Check your orders or contact support.",
          retryable: false,
        },
      });
    });
    await act(async () => {});

    const state = usePaymentStore.getState();
    expect(state.status).not.toBe("idle");
    expect(state.status).not.toBe("cancelled");
    expect(state.internalOrderId).toBe(INTERNAL_ORDER_ID);
    expect(state.gatewayOrderId).toBe(GATEWAY_ORDER_ID);
    expect(fixture.clearCart).not.toHaveBeenCalled();
    expect(fixture.navigate).not.toHaveBeenCalled();
    expectBoundedGuidanceAfterRefusal(before);
    expectNoFakeCancellationClaim();
  });

  it("an unreconciled post-gateway payment offers no local 'Cancel order' at all", async () => {
    // Reconciliation gates are unchanged by this work: while a payment may
    // already have moved, the recovery surface (check orders / contact
    // support) replaces the failure panel, so a customer cannot dismiss
    // anything locally.
    await mountPayment();
    act(() => {
      usePaymentStore
        .getState()
        .setReconciliation(true, "PAYMENT_SYNC_PENDING", INTERNAL_ORDER_ID, GATEWAY_ORDER_ID);
      usePaymentStore.setState({
        status: "failed",
        failure: {
          code: "PAYMENT_SYNC_PENDING",
          message: "We could not confirm this payment yet.",
          retryable: false,
        },
      });
    });
    await act(async () => {});

    expect(usePaymentStore.getState().reconciliationPending).toBe(true);
    expect(buttonWithText("Cancel order")).toBeUndefined();
    expect(fixture.cancelPayment).not.toHaveBeenCalled();
    expect(fixture.clearCart).not.toHaveBeenCalled();
    expect(fixture.navigate).not.toHaveBeenCalled();
    expect(usePaymentStore.getState().internalOrderId).toBe(INTERNAL_ORDER_ID);
    expect(usePaymentStore.getState().gatewayOrderId).toBe(GATEWAY_ORDER_ID);
  });

  it("with no gateway order bound, a local exit never claims a gateway cancellation", async () => {
    // CONTROL (passes before and after the fix): a failure that never reached
    // the gateway has nothing for the gateway to cancel, so leaving for
    // checkout locally is honest and is NOT asserted against here. What must
    // never happen is inventing a cancellation — no transport call with a
    // fabricated id, no success claim, no money movement, and no "cancelled"
    // status that the failure panel would render as a completed cancellation.
    await mountPayment();
    act(() => {
      usePaymentStore.setState({
        status: "failed",
        failure: {
          code: "PREFLIGHT_ERROR",
          message: "We couldn't check your order. Please try again.",
          retryable: true,
        },
        internalOrderId: null,
        gatewayOrderId: null,
        order: null,
      });
    });
    await act(async () => {});
    expect(buttonWithText("Cancel order")).toBeDefined();

    await act(async () => buttonWithText("Cancel order")!.click());
    await act(async () => {});

    expect(fixture.cancelPayment).not.toHaveBeenCalled();
    expect(fixture.toast.success).not.toHaveBeenCalled();
    expect(fixture.createPaymentOrder).not.toHaveBeenCalled();
    expect(fixture.verifyPayment).not.toHaveBeenCalled();
    expect(fixture.clearCart).not.toHaveBeenCalled();
    expect(usePaymentStore.getState().status).not.toBe("cancelled");
    expect(container.textContent ?? "").not.toContain("Payment cancelled");
    // A local exit may only go to checkout — never to a confirmation screen
    // that would read as "this order is done".
    for (const [target] of fixture.navigate.mock.calls as Array<[{ to?: unknown }]>) {
      expect(target.to).toBe("/checkout");
    }
  });
});
