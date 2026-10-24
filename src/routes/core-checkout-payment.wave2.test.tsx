/**
 * Wave-2 core-route polish (sprint 2026-10-16) — checkout/payment honesty.
 *
 * M3: a failed totals recompute on checkout must block PAY and say so, never
 *     leave a stale bill on screen behind a live button.
 * M4: a totals failure on payment must be visible and retryable, not a silent
 *     dead button priced against a fabricated ₹0.
 * M5: raw gateway `err.description` text must never be rendered to customers;
 *     it is logged and mapped through the curated mapper (P1-8).
 *
 * These mount the real route components with their stores/repos faked, so they
 * exercise the actual render + handler wiring (not a reimplementation).
 */
/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const RAW_PRICING_TEXT = "RAW PRICING DIAGNOSTIC";
const RAW_GATEWAY_TEXT = "RAW GATEWAY TEXT bank declined 51 (BAD_REQUEST_ERROR)";

const fixture = vi.hoisted(() => {
  const lines = [{ lineId: "l1", name: "Test Burger", quantity: 1, unitPrice: 199 }];
  const cartState = { lines, promo: null, priceLockExpiresAt: null };
  const checkoutState = {
    orderNotes: "",
    deliveryInstructions: "",
    pickupInstructions: "",
    diningNotes: "",
    tipAmount: 0,
    loyaltyPointsToRedeem: 0,
    tableNumber: "",
    setOrderNotes: vi.fn(),
    setTableNumber: vi.fn(),
    setLoyaltyPointsToRedeem: vi.fn(),
  };
  const noop = vi.fn();
  return {
    lines,
    cartState,
    checkoutState,
    cart: {
      calculateTotals: vi.fn(),
      validateCart: vi.fn(),
      clear: vi.fn(async () => ({ success: true })),
    },
    navigate: vi.fn(),
    setFulfillment: vi.fn(),
    warn: vi.fn(),
    validateForPayment: vi.fn(),
    createPaymentOrder: vi.fn(),
    verifyPayment: vi.fn(),
    initializeRazorpay: vi.fn(async () => {}),
    openCheckout: vi.fn(),
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
    noop,
  };
});

/* ── framework / shell ─────────────────────────────────────────────────── */
vi.mock("sonner", () => ({
  toast: { success: fixture.toast.success, error: fixture.toast.error, info: fixture.toast.info },
}));
vi.mock("@/shared/components/feedback/AppToaster", () => ({
  toast: { success: fixture.toast.success, error: fixture.toast.error, info: fixture.toast.info },
}));
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
vi.mock("@/shared/components/feedback/KitchenClosedBanner", () => ({
  KitchenClosedBanner: () => null,
}));
// Hermetic motion: no matchMedia / rAF dependency in jsdom.
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
vi.mock("@/shared/hooks/useHydrated", () => ({ useHydrated: () => true }));
vi.mock("@/shared/hooks/useKitchenHours", () => ({
  useKitchenHours: () => ({ isOpen: true, isClosed: false }),
}));
vi.mock("@/core/state/appConfigStore", () => ({
  useAppConfig: Object.assign(
    (select: (s: { isOnline: boolean }) => unknown) => select({ isOnline: true }),
    { getState: () => ({ isOnline: true }) },
  ),
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
  logger: { warn: fixture.warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

/* ── feature stores / repos (faked) ────────────────────────────────────── */
vi.mock("@/features/cart", () => ({
  cartRepository: fixture.cart,
  useCartStore: Object.assign(
    (select: (s: typeof fixture.cartState) => unknown) => select(fixture.cartState),
    { getState: () => fixture.cartState },
  ),
  selectItemCount: (s: { lines: unknown[] }) => s.lines.length,
  PromoInput: ({ onChanged }: { onChanged: () => void }) => (
    <button type="button" onClick={() => onChanged()}>
      Refresh bill
    </button>
  ),
}));
vi.mock("@/features/checkout", () => ({
  useCheckoutStore: Object.assign(
    (select: (s: typeof fixture.checkoutState) => unknown) => select(fixture.checkoutState),
    { getState: () => fixture.checkoutState },
  ),
  AddressSelector: () => null,
  FulfillmentDetailsCard: () => null,
  PaymentMethodSelector: () => null,
  ReviewItemsList: () => null,
  calculateHaversineKm: () => 0,
}));
vi.mock("@/features/checkout/components/QuickAuthSheet", () => ({ QuickAuthSheet: () => null }));
vi.mock("@/features/stores/state/storeStore", () => ({
  useStoreSelection: (select: (s: unknown) => unknown) =>
    select({
      activeStore: { id: "store-A", name: "Surat Vesu", lat: 21.15, lng: 72.77 },
      fulfillment: "delivery",
      setFulfillment: fixture.setFulfillment,
    }),
}));
vi.mock("@/features/auth/state/authStore", () => {
  const authState = {
    user: { id: "cust_wave2", name: "Test Customer", phone: "+910000000000" },
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
  selectAddresses: () => [],
  selectSelectedAddress: () => null,
}));
vi.mock("@/features/loyalty/state/loyaltyStore", () => ({
  useLoyaltyStore: Object.assign((select: (s: { balance: number }) => unknown) => select({ balance: 0 }), {
    getState: () => ({ refreshFromServer: vi.fn() }),
  }),
}));
vi.mock("@/features/orders", () => ({
  orderRepository: {
    createFromCurrentContext: vi.fn(async () => ({ success: true, data: { id: "ord_1" } })),
    finalizePaidOrder: vi.fn(async () => ({ success: true, data: { id: "ord_1" } })),
    markPaymentFailed: vi.fn(async () => ({ success: true })),
  },
}));
// Keep the REAL payment store so status/failure transitions re-render the tree.
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
      cancelPayment: vi.fn(async () => ({ success: true })),
    },
    razorpayAdapter: {
      initialize: fixture.initializeRazorpay,
      openCheckout: fixture.openCheckout,
    },
    PaymentMethodList: () => null,
    SecurePaymentBadge: () => null,
    RazorpayModalHandler: () => null,
  };
});

import { GENERIC_ERROR_MESSAGE } from "@/core/errors/userMessages";
import { usePaymentStore } from "@/features/payments/state/paymentStore";
import { Route as CheckoutRoute } from "./checkout";
import { Route as PaymentRoute } from "./payment";

const CheckoutPage = (CheckoutRoute as unknown as { options: { component: React.ComponentType } })
  .options.component;
const PaymentPage = (PaymentRoute as unknown as { options: { component: React.ComponentType } })
  .options.component;

const okTotals = (grandTotal: number) => ({
  success: true as const,
  data: {
    subtotal: 199,
    taxes: 0,
    packingFee: 0,
    deliveryFee: 0,
    promoDiscount: 0,
    loyaltyDiscount: 0,
    grandTotal,
  },
});
const billFailure = {
  success: false as const,
  error: { code: "PRICING_CALCULATION_ERROR", message: RAW_PRICING_TEXT },
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  fixture.cart.calculateTotals.mockReset();
  fixture.openCheckout.mockReset();
  fixture.validateForPayment.mockReset();
  fixture.createPaymentOrder.mockReset();
  fixture.checkoutState.tipAmount = 0;
  fixture.checkoutState.loyaltyPointsToRedeem = 0;
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

async function mount(Page: React.ComponentType) {
  await act(async () => root.render(<Page />));
}

function buttonWithText(text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button")).find((b) =>
    b.textContent?.includes(text),
  );
}

describe("M3 — checkout recompute failure blocks PAY and clears the stale bill", () => {
  it("disables PAY and shows a curated, retryable bill message when recompute fails", async () => {
    fixture.cart.calculateTotals
      .mockResolvedValueOnce(okTotals(299))
      .mockResolvedValueOnce(billFailure);

    await mount(CheckoutPage);

    // Precondition: the first recompute priced the order and PAY is live.
    expect(container.textContent).toContain("299");
    expect(buttonWithText("PAY")?.disabled).toBe(false);

    // A fulfillment/promo change re-runs recompute and this time it fails.
    const refresh = buttonWithText("Refresh bill");
    expect(refresh).toBeDefined();
    await act(async () => refresh!.click());

    // The failure must be visible …
    expect(container.textContent).toContain("Couldn't compute your bill");
    // … the stale ₹299 bill must be gone …
    expect(container.textContent).not.toContain("299");
    // … and PAY must be locked against paying an unknown total.
    expect(buttonWithText("PAY")?.disabled).toBe(true);
    // No raw internal diagnostic text anywhere on screen.
    expect(container.textContent).not.toContain(RAW_PRICING_TEXT);

    // Honesty (review-wave2 blocker): while `totals` is unknown the in-body
    // Bill Breakdown must not present a fabricated zero. Its sibling rows
    // already read "unavailable" — the numeric rows must match that treatment.
    const breakdown = Array.from(container.querySelectorAll("h2"))
      .find((heading) => heading.textContent?.includes("Bill Breakdown"))
      ?.closest("section");
    expect(breakdown).toBeTruthy();
    const breakdownText = breakdown?.textContent ?? "";
    expect(breakdownText).toContain("unavailable");
    expect(breakdownText).not.toMatch(/₹\s*0/);
  });
});

describe("M4 — payment totals failure is visible, retryable, and not a fabricated ₹0", () => {
  it("shows an honest reason + Retry and disables PAY while the bill is unknown", async () => {
    fixture.cart.calculateTotals.mockResolvedValueOnce(billFailure);

    await mount(PaymentPage);

    expect(container.textContent).toContain("Couldn't compute your bill");
    expect(buttonWithText("Retry")).toBeDefined();
    expect(container.textContent).not.toContain(RAW_PRICING_TEXT);
    // PAY is not usable against an unknown total (and no fake ₹0 is presented).
    expect(buttonWithText("Pay Online")?.disabled).toBe(true);

    // Retry with a successful recompute clears the failure and prices the order.
    fixture.cart.calculateTotals.mockResolvedValueOnce(okTotals(299));
    const retry = buttonWithText("Retry");
    await act(async () => retry!.click());

    expect(container.textContent).not.toContain("Couldn't compute your bill");
    expect(container.textContent).toContain("299");
    expect(buttonWithText("Pay Online")?.disabled).toBe(false);
  });
});

describe("payment To Pay — tip and loyalty redemption", () => {
  it("shows the tip/points-adjusted total that the reprice gate compares", async () => {
    fixture.checkoutState.tipAmount = 20;
    fixture.checkoutState.loyaltyPointsToRedeem = 50;
    fixture.cart.calculateTotals.mockResolvedValueOnce(okTotals(555));

    await mount(PaymentPage);

    expect(container.textContent).toContain("525");
    expect(container.textContent).not.toContain("555");
  });
});

describe("M5 — raw gateway failure text never reaches the customer", () => {
  it("maps the gateway failure through the curated mapper and logs the raw text", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    fixture.cart.calculateTotals.mockResolvedValue(okTotals(199));
    fixture.validateForPayment.mockResolvedValue({
      success: true,
      data: { valid: true, issues: [] },
    });
    fixture.createPaymentOrder.mockResolvedValue({
      success: true,
      data: {
        orderId: "order_rzp_wave2",
        amount: 199,
        currency: "INR",
        receipt: "rcpt_wave2",
        keyId: "rzp_test_key",
      },
    });
    fixture.openCheckout.mockImplementation(
      async (handlers: { onFailure: (err: { code: string; description: string }) => void }) => {
        handlers.onFailure({ code: "BAD_REQUEST_ERROR", description: RAW_GATEWAY_TEXT });
      },
    );

    await mount(PaymentPage);
    const pay = buttonWithText("Pay Online");
    expect(pay?.disabled).toBe(false);
    await act(async () => pay!.click());
    await act(async () => {});

    // The gateway string is not customer copy (P1-8): never rendered.
    expect(container.textContent).not.toContain(RAW_GATEWAY_TEXT);
    expect(container.textContent).not.toContain("bank declined");
    // The customer sees the curated mapper output instead.
    expect(container.textContent).toContain(GENERIC_ERROR_MESSAGE);
    expect(fixture.toast.error).toHaveBeenCalledWith("Payment failed", {
      description: GENERIC_ERROR_MESSAGE,
    });
    // The raw text is preserved for diagnostics only.
    expect(console.error).toHaveBeenCalledWith(
      "[payment] gateway onFailure:",
      expect.objectContaining({ description: RAW_GATEWAY_TEXT }),
    );
  });
});
