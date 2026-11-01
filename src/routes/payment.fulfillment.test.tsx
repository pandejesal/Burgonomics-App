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
    createFromCurrentContext: vi.fn(),
    verifyPayment: vi.fn(),
    initialize: vi.fn(async () => {}),
    openCheckout: vi.fn(),
    navigate: vi.fn(),
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
vi.mock("@/features/checkout", () => ({
  useCheckoutStore: Object.assign(
    (select: (s: typeof fixture.checkoutState) => unknown) => select(fixture.checkoutState),
    { getState: () => ({ ...fixture.checkoutState, reset: vi.fn() }) },
  ),
  ReviewItemsList: () => null,
}));
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
vi.mock("@/features/addresses", () => ({
  useAddressStore: (select: (s: unknown) => unknown) =>
    select({ items: [], selectedId: null }),
  selectSelectedAddress: () => null,
}));
vi.mock("@/features/orders", () => ({
  orderRepository: {
    createFromCurrentContext: fixture.createFromCurrentContext,
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
  fixture.createFromCurrentContext.mockReset();
  fixture.openCheckout.mockReset();
  fixture.initialize.mockReset();

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
      amount: 525,
      currency: "INR",
      receipt: "rcpt_fulfill_pay",
      keyId: "rzp_test_key",
    },
  });
  fixture.createFromCurrentContext.mockResolvedValue({
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
  expect(fixture.createFromCurrentContext).not.toHaveBeenCalled();
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
    expect(container.textContent).toContain("Choose how you'd like this order");
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
    expect(container.textContent).toContain("Choose how you'd like this order");
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

  it("cash delivery still creates a COD order", async () => {
    fixture.selection.fulfillment = "delivery";
    await mountPayment();
    await act(async () => usePaymentStore.getState().setMethod("cash"));

    const pay = buttonWithText("Place COD Order");
    expect(pay).toBeDefined();
    expect(pay!.disabled).toBe(false);
    await act(async () => pay!.click());
    await act(async () => {});

    expect(fixture.createFromCurrentContext).toHaveBeenCalledWith(
      expect.objectContaining({ paymentMethod: "cash", paymentStatus: "CASH_PENDING" }),
    );
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

      expect(fixture.createFromCurrentContext).toHaveBeenCalledWith(
        expect.objectContaining({ paymentMethod: "cash", paymentStatus: "PAY_AT_STORE" }),
      );
    },
  );
});
