/**
 * T2.2 follow-up — the PUBLIC /payment route must not authorise payment
 * without a valid, supported fulfillment mode for the active outlet.
 *
 * Mounts the real route component (authenticated, valid cart, computed total
 * including a persisted tip) and asserts the CTA plus the real handler/Retry
 * path stop before preflight, internal order creation, cash order creation or
 * the gateway. Positive controls prove valid delivery/takeaway/dinein and the
 * cash/online contexts still work.
 *
 * Synthetic fixtures only; all provider calls are mocked at the boundary.
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
        unitPrice: 500,
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
    tipAmount: 25,
    loyaltyPointsToRedeem: 0,
    tableNumber: "",
  };
  const store = {
    id: "store-A",
    name: "Surat Vesu",
    area: "Vesu",
    address: "1 Main Road",
    etaMinutes: 30,
    pickupEtaMinutes: 15,
    supports: { delivery: true, takeaway: true, dineIn: true },
  };
  const selection: {
    activeStore: typeof store | null;
    fulfillment: "delivery" | "takeaway" | "dinein" | null;
  } = { activeStore: store, fulfillment: null };
  return {
    cartState,
    checkoutState,
    store,
    selection,
    calculateTotals: vi.fn(),
    validateForPayment: vi.fn(),
    createPaymentOrder: vi.fn(),
    createOnlineDraft: vi.fn(),
    // Quote fixture per case; the route reads it fresh on every tap.
    fees: null as unknown as CheckoutFeesState,
    // Owner decision 2026-11-20: cash orders are created by the SERVER.
    createCashOrder: vi.fn(),
    verifyPayment: vi.fn(),
    initialize: vi.fn(async () => {}),
    openCheckout: vi.fn(),
    navigate: vi.fn(),
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
    // Connectivity seen by the real route. `connectionStatusKnown: false` is a
    // native cold-start guess; OBSERVED offline sets it true. Keep them apart.
    appConfig: {
      isOnline: true,
      connectionStatusKnown: true,
      browserOnlineEvidence: true,
    } as {
      isOnline: boolean;
      connectionStatusKnown: boolean;
      browserOnlineEvidence: boolean;
    },
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

const defaultFees = (): CheckoutFeesReady => ({
  status: "ready",
  orderType: "delivery",
  packagingFee: 0,
  deliveryFee: 0,
  deliveryQuoteId: "q_test",
  provider: "test",
  expiresAt: Date.now() + 3_600_000,
});

/** The retired COD policy's answer: branch flag on, no ceiling. */
const legacyCashFees = (): CheckoutFeesState => ({
  ...defaultFees(),
  cashOnDelivery: { enabled: true, maxOrderValuePaise: null },
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
vi.mock("@/shared/components/common/ConfirmDialog", () => ({
  ConfirmDialog: () => null,
}));

/* ── shared hooks / services ───────────────────────────────────────────── */
vi.mock("@/shared/hooks/useHydrated", () => ({ useHydrated: () => true }));
vi.mock("@/core/state/appConfigStore", () => ({
  useAppConfig: Object.assign(
    (
      select: (s: {
        isOnline: boolean;
        connectionStatusKnown: boolean;
        browserOnlineEvidence: boolean;
      }) => unknown,
    ) => select(fixture.appConfig),
    { getState: () => fixture.appConfig },
  ),
  // Same predicate as production: a native unconfirmed start is NOT offline.
  selectObservedOffline: (s: {
    isOnline: boolean;
    connectionStatusKnown: boolean;
    browserOnlineEvidence: boolean | null;
  }) => !s.isOnline && (s.connectionStatusKnown || s.browserOnlineEvidence === false),
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

/* ── feature stores / repos (faked boundaries) ─────────────────────────── */
vi.mock("@/features/cart", () => ({
  cartRepository: {
    calculateTotals: fixture.calculateTotals,
    clear: vi.fn(async () => ({ success: true as const })),
  },
  useCartStore: Object.assign(
    (select: (s: typeof fixture.cartState) => unknown) => select(fixture.cartState),
    { getState: () => fixture.cartState },
  ),
  selectItemCount: (s: { lines: unknown[] }) => s.lines.length,
}));
vi.mock("@/features/checkout", () => {
  // Launch checkout keeps a live server quote; these route tests are about the
  // bill/payment state machine. The quote is a fixture per case so delivery's
  // online-only rule can be tested with a legacy enabled cash flag too.
  const fees = () => fixture.fees;
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
      { getState: () => ({ ...fixture.checkoutState, checkoutFees: fees(), reset: vi.fn() }) },
    ),
    useCheckoutFees: () => ({
      state: fees(),
      view: readyView,
      refresh: vi.fn(async () => fees()),
    }),
    // Mirror the quote state so the "no quote yet" case is really gated,
    // instead of being silently treated as a ready courier quote.
    deliveryQuoteView: () =>
      fees().status === "ready"
        ? readyView
        : {
            ...readyView,
            payEnabled: false,
            status: fees().status,
            message: "Getting delivery price",
          },
    isDeliveryQuoteRefusal: () => false,
    ReviewItemsList: () => null,
  };
});
vi.mock("@/features/stores/state/storeStore", () => ({
  useStoreSelection: Object.assign(
    (
      select: (s: {
        activeStore: typeof fixture.selection.activeStore;
        fulfillment: typeof fixture.selection.fulfillment;
      }) => unknown,
    ) => select(fixture.selection),
    { getState: () => fixture.selection },
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
}));
vi.mock("@/features/auth/state/authStore", () => {
  const authState = {
    user: { id: "cust_fulfill_pay", name: "Test Customer", phone: "+910000000000" },
    isBootstrapped: true,
  };
  return {
    useAuthStore: Object.assign((select: (s: typeof authState) => unknown) => select(authState), {
      getState: () => authState,
    }),
    selectIsAuthenticated: (s: { user: unknown }) => !!s.user,
  };
});
vi.mock("@/features/addresses", () => {
  const address = {
    id: "addr_fulfill",
    label: "home",
    line1: "1 Main Road",
    city: "Surat",
    pincode: "395007",
    lat: 21.15,
    lng: 72.77,
  };
  return {
    useAddressStore: (select: (s: unknown) => unknown) =>
      select({ items: [address], selectedId: address.id, select: vi.fn() }),
    selectAddresses: () => [address],
    selectSelectedAddress: () => address,
  };
});
vi.mock("@/features/orders", () => ({
  orderRepository: {
    createOnlineDraft: fixture.createOnlineDraft,
    createCashOrder: fixture.createCashOrder,
    pendingCashOrderId: () => null,
    // A6-c11 item 1: cash attempts are TTL/basket gated before any replay.
    pendingCashAttempt: () => null,
    finalizePaidOrder: vi.fn(),
    markPaymentFailed: vi.fn(),
  },
}));
vi.mock("@/features/payments/components/PaymentRecoveryPanel", () => ({
  PaymentRecoveryPanel: () => null,
}));
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
      cancelPayment: vi.fn(),
    },
    razorpayAdapter: {
      initialize: fixture.initialize,
      openCheckout: fixture.openCheckout,
    },
    PaymentMethodList: () => null,
    SecurePaymentBadge: () => null,
    RazorpayModalHandler: () => null,
  };
});

import type {
  CheckoutFeesReady,
  CheckoutFeesState,
} from "@/features/checkout/state/checkoutFeesTypes";
import { Route as PaymentRoute } from "./payment";
import { usePaymentStore } from "@/features/payments/state/paymentStore";

const PaymentPage = (PaymentRoute as unknown as { options: { component: React.ComponentType } })
  .options.component;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  fixture.calculateTotals.mockReset();
  fixture.validateForPayment.mockReset();
  fixture.createPaymentOrder.mockReset();
  fixture.createOnlineDraft.mockReset();
  fixture.createCashOrder.mockReset();
  fixture.openCheckout.mockReset();
  fixture.initialize.mockReset();
  fixture.fees = defaultFees();
  fixture.appConfig = {
    isOnline: true,
    connectionStatusKnown: true,
    browserOnlineEvidence: true,
  };

  fixture.selection.activeStore = fixture.store;
  fixture.selection.fulfillment = null;
  fixture.checkoutState.tipAmount = 25;
  fixture.calculateTotals.mockResolvedValue(totals(500));
  fixture.validateForPayment.mockResolvedValue({
    success: true,
    data: { valid: true, issues: [] },
  });
  fixture.createPaymentOrder.mockResolvedValue({
    success: true,
    data: {
      orderId: "order_fulfill_pay",
      // Owner decision 2026-11-25 (#1): the persisted ₹25 tip is hidden and is
      // part of NO billed figure, so the server total matches the visible ₹500.
      amount: 500,
      currency: "INR",
      receipt: "rcpt_fulfill_pay",
      keyId: "rzp_test_key",
    },
  });
  fixture.createOnlineDraft.mockResolvedValue({
    success: true,
    data: { id: "ord_fulfill_cash" },
  });
  fixture.createCashOrder.mockResolvedValue({
    success: true,
    data: { id: "ord_fulfill_cash" },
  });
  fixture.openCheckout.mockResolvedValue(undefined);
  fixture.initialize.mockResolvedValue(undefined);
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

function exactButton(text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === text,
  );
}

async function mountPayment() {
  await act(async () => root.render(<PaymentPage />));
  await act(async () => {});
}

function expectNoPaymentStarted() {
  expect(fixture.validateForPayment).not.toHaveBeenCalled();
  expect(fixture.createPaymentOrder).not.toHaveBeenCalled();
  expect(fixture.createOnlineDraft).not.toHaveBeenCalled();
  expect(fixture.initialize).not.toHaveBeenCalled();
  expect(fixture.openCheckout).not.toHaveBeenCalled();
}

describe("payment route — missing/invalid fulfillment blocks every payment path", () => {
  it("null mode: CTA disabled, honest alert, and no preflight/order/gateway", async () => {
    await mountPayment();

    const pay = buttonWithText("Choose fulfillment");
    expect(pay).toBeDefined();
    expect(pay!.disabled).toBe(true);
    expect(pay!.getAttribute("title")).toContain("fulfillment");

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("Choose how you'd like this order");
    expect(buttonWithText("Review Checkout")).toBeDefined();

    // Defense in depth: a programmatic activation must still do nothing.
    await act(async () => {
      pay!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await act(async () => {});
    expectNoPaymentStarted();
  });

  it("mode unsupported by the active outlet: same honest block", async () => {
    fixture.selection.activeStore = {
      ...fixture.store,
      supports: { delivery: false, takeaway: true, dineIn: false },
    };
    fixture.selection.fulfillment = "delivery";

    await mountPayment();

    const pay = buttonWithText("Choose fulfillment");
    expect(pay).toBeDefined();
    expect(pay!.disabled).toBe(true);
    expect(container.textContent).toContain("not offering your selected order type");
    await act(async () => pay!.click());
    await act(async () => {});
    expectNoPaymentStarted();
  });

  it("no active outlet: same honest block, Review Checkout routes to the chooser", async () => {
    fixture.selection.activeStore = null;
    fixture.selection.fulfillment = "delivery";

    await mountPayment();

    const pay = buttonWithText("Choose fulfillment");
    expect(pay).toBeDefined();
    expect(pay!.disabled).toBe(true);
    expect(container.textContent).toContain("Choose an outlet");

    const review = buttonWithText("Review Checkout");
    expect(review).toBeDefined();
    await act(async () => review!.click());
    expect(fixture.navigate).toHaveBeenCalledWith({ to: "/checkout" });

    await act(async () => pay!.click());
    await act(async () => {});
    expectNoPaymentStarted();
  });

  it("real FailurePanel Retry path: no payment starts, status returns to idle, alert stays actionable", async () => {
    await mountPayment();

    // Seed the real failure state AFTER mount (the route resets on entry).
    await act(async () => {
      const store = usePaymentStore.getState();
      store.setFailure({
        code: "GATEWAY_ERROR",
        message: "Payment could not be completed.",
        retryable: true,
      });
      store.setStatus("failed");
    });

    const retry = exactButton("Retry");
    expect(retry).toBeDefined();
    await act(async () => retry!.click());
    await act(async () => {});

    expectNoPaymentStarted();
    expect(usePaymentStore.getState().status).toBe("idle");
    expect(container.textContent).toContain("Choose how you'd like this order");
    expect(buttonWithText("Review Checkout")).toBeDefined();
  });

  it("re-reads the live selection on Retry: a post-mount change without a re-render still blocks", async () => {
    fixture.selection.fulfillment = "delivery";
    await mountPayment();

    await act(async () => {
      const store = usePaymentStore.getState();
      store.setFailure({
        code: "GATEWAY_ERROR",
        message: "Payment could not be completed.",
        retryable: true,
      });
      store.setStatus("failed");
    });

    // Mutate the shared selection AFTER mount; the plain selector mock does
    // not re-render, so only the handler's fresh getState() can see this.
    fixture.selection.activeStore = {
      ...fixture.store,
      supports: { delivery: false, takeaway: true, dineIn: false },
    };

    const retry = exactButton("Retry");
    expect(retry).toBeDefined();
    await act(async () => retry!.click());
    await act(async () => {});

    expectNoPaymentStarted();
    expect(usePaymentStore.getState().status).toBe("idle");
    expect(container.textContent).toContain("not offering your selected order type");
  });
});

describe("payment route — valid supported modes still work", () => {
  it("online delivery (with persisted tip) reaches preflight and creates a payment order", async () => {
    fixture.selection.fulfillment = "delivery";
    await mountPayment();

    const pay = buttonWithText("Pay Online");
    expect(pay).toBeDefined();
    expect(pay!.disabled).toBe(false);
    expect(container.textContent).not.toContain("Review Checkout");

    await act(async () => pay!.click());
    await act(async () => {});

    expect(fixture.validateForPayment).toHaveBeenCalledTimes(1);
    expect(fixture.createPaymentOrder).toHaveBeenCalledTimes(1);
    expect(fixture.openCheckout).toHaveBeenCalledTimes(1);
  });

  it("refuses delivery cash on the direct route, even with a legacy enabled quote", async () => {
    fixture.selection.fulfillment = "delivery";
    fixture.fees = legacyCashFees();
    await mountPayment();
    await act(async () => usePaymentStore.getState().setMethod("cash"));

    // A restored/stale cash choice is corrected: no COD label, only online.
    expect(usePaymentStore.getState().method).toBe("online");
    expect(buttonWithText("Place COD Order")).toBeUndefined();
    expect(buttonWithText("Pay Online")).toBeDefined();

    // Action boundary: a method written straight to the live store after render
    // (as a restored selection would be) must still not reach the cash creator.
    const pay = buttonWithText("Pay Online");
    usePaymentStore.setState({ method: "cash" });
    await act(async () => pay!.click());
    await act(async () => {});

    expect(fixture.createCashOrder).not.toHaveBeenCalled();
    expect(fixture.createOnlineDraft).not.toHaveBeenCalled();
    expect(fixture.validateForPayment).not.toHaveBeenCalled();
    expect(container.textContent).toContain("paid online only");
  });

  it("does not send a cash request for delivery when no quote exists", async () => {
    fixture.selection.fulfillment = "delivery";
    fixture.fees = { status: "idle" };
    await mountPayment();
    await act(async () => usePaymentStore.getState().setMethod("cash"));

    const pay = buttonWithText("Place COD Order") ?? buttonWithText("Pay Online");
    expect(pay).toBeDefined();
    await act(async () => pay!.click());
    await act(async () => {});

    expect(fixture.createCashOrder).not.toHaveBeenCalled();
    expect(fixture.validateForPayment).not.toHaveBeenCalled();
  });

  it.each(["takeaway", "dinein"] as const)(
    "cash %s still creates a pay-at-store order",
    async (mode) => {
      fixture.selection.fulfillment = mode;
      await mountPayment();
      await act(async () => usePaymentStore.getState().setMethod("cash"));

      const pay = buttonWithText("Place Order");
      expect(pay).toBeDefined();
      expect(pay!.disabled).toBe(false);
      await act(async () => pay!.click());
      await act(async () => {});

      expect(fixture.createCashOrder).toHaveBeenCalledTimes(1);
      expect(fixture.createOnlineDraft).not.toHaveBeenCalled();
    },
  );
});

describe("payment route — a mode switch cannot re-open delivery cash", () => {
  it("refuses a counter cash selection once the live mode is delivery", async () => {
    fixture.selection.fulfillment = "takeaway";
    await mountPayment();
    await act(async () => usePaymentStore.getState().setMethod("cash"));

    const pay = buttonWithText("Place Order");
    expect(pay).toBeDefined();

    // Mutate the shared selection after render: only a live re-read can see it,
    // exactly like a menu/store switch while this screen is open.
    fixture.selection.fulfillment = "delivery";
    fixture.fees = legacyCashFees();
    await act(async () => pay!.click());
    await act(async () => {});

    expect(fixture.createCashOrder).not.toHaveBeenCalled();
    expect(fixture.validateForPayment).not.toHaveBeenCalled();
    expect(container.textContent).toContain("paid online only");
  });
});

describe("payment route — zero-due stays server-verified", () => {
  it("places a server-verified zero-due delivery order without opening Razorpay", async () => {
    fixture.selection.fulfillment = "delivery";
    fixture.calculateTotals.mockResolvedValue(totals(0));
    fixture.createCashOrder.mockResolvedValue({
      success: true,
      data: { id: "ord_zero", cashDuePaise: 0 },
    });
    await mountPayment();

    const pay = buttonWithText("Place Zero-Due Order");
    expect(pay).toBeDefined();
    await act(async () => pay!.click());
    await act(async () => {});

    expect(fixture.createCashOrder).toHaveBeenCalledWith({ zeroDueOnly: true });
    expect(fixture.createPaymentOrder).not.toHaveBeenCalled();
    expect(fixture.openCheckout).not.toHaveBeenCalled();
    expect(fixture.toast.success).toHaveBeenCalledWith("No payment to collect", expect.anything());
  });

  it("does not record a guessed capture when a stale zero-due bill is actually payable", async () => {
    fixture.selection.fulfillment = "delivery";
    fixture.calculateTotals.mockResolvedValue(totals(0));
    fixture.createCashOrder.mockResolvedValue({
      success: true,
      data: { id: "ord_stale", cashDuePaise: 10900 },
    });
    await mountPayment();

    const pay = buttonWithText("Place Zero-Due Order");
    expect(pay).toBeDefined();
    await act(async () => pay!.click());
    await act(async () => {});

    expect(fixture.createCashOrder).toHaveBeenCalledWith({ zeroDueOnly: true });
    expect(fixture.navigate).not.toHaveBeenCalled();
    expect(fixture.toast.success).not.toHaveBeenCalled();
    expect(usePaymentStore.getState().status).toBe("failed");
  });
});

/**
 * The request boundary already refuses payable delivery cash. This pins the
 * route's UI edge: an OBSERVED offline answer must not re-open a COD label or
 * "Place COD Order" CTA from a restored selection just because the correction
 * effect used to opt out whenever `isOnline` was false. The zero-due and live
 * getState regressions above stay as they are — neither is duplicated here.
 */
describe("payment route — observed offline never re-opens payable delivery cash", () => {
  it("legacy cash-enabled quote + stale cash selection stays online-only with no COD copy", async () => {
    fixture.selection.fulfillment = "delivery";
    fixture.fees = legacyCashFees();
    // Authoritative offline evidence, distinct from an unconfirmed cold start.
    fixture.appConfig = {
      isOnline: false,
      connectionStatusKnown: true,
      browserOnlineEvidence: false,
    };

    await mountPayment();
    await act(async () => {
      // A restored/stale choice written after render: no re-render may be
      // relied on to hide it, exactly like a persisted payment draft.
      usePaymentStore.getState().setMethod("cash");
      await Promise.resolve();
    });
    await act(async () => {});

    expect(usePaymentStore.getState().method).toBe("online");
    expect(buttonWithText("Place COD Order")).toBeUndefined();
    expect(container.textContent).not.toContain("Cash on Delivery");
    expect(container.textContent).not.toContain(
      "Pay with cash at your doorstep when food is delivered",
    );
    expect(container.textContent).toContain("paid online only");

    // Honest CTA while offline: no cash request is started from this state.
    const pay = buttonWithText("Pay Online");
    expect(pay).toBeDefined();
    expect(pay!.disabled).toBe(true);
    await act(async () => {
      pay!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await act(async () => {});
    expect(fixture.createCashOrder).not.toHaveBeenCalled();
    expect(fixture.validateForPayment).not.toHaveBeenCalled();
  });
});
