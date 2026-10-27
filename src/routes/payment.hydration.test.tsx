/**
 * P1 — payment route hook order across hydration.
 *
 * `PaymentPage` returned a skeleton while `useHydrated()` was false and then
 * registered ANOTHER `React.useEffect` after that early return (the
 * `startPaymentRef` sync). The first post-hydration render therefore ran one
 * hook MORE than the server/pre-hydration render and React threw
 * "Rendered more hooks than during the previous render" (#310) — a crash on
 * the money screen for every cold load, not an edge case.
 *
 * This mounts the REAL route component with hydration controllable, flips it
 * false → true on the SAME root, and asserts the tree renders through the
 * transition with no hook-order error. No source-text inspection: the failure
 * mode is a runtime React error.
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
    tipAmount: 0,
    loyaltyPointsToRedeem: 0,
    tableNumber: "",
  };
  return {
    /** Flip to simulate the persisted-state hydration the route waits on. */
    hydration: { value: false },
    cartState,
    checkoutState,
    calculateTotals: vi.fn(async () => ({
      success: true as const,
      data: {
        subtotal: 199,
        itemDiscount: 0,
        promoDiscount: 0,
        taxes: 0,
        cgst: 0,
        sgst: 0,
        gstRate: 0.05,
        deliveryFee: 0,
        packingFee: 0,
        grandTotal: 199,
        currency: "INR" as const,
      },
    })),
    navigate: vi.fn(),
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  };
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
// The whole point: hydration is a live, flippable value rather than `true`.
vi.mock("@/shared/hooks/useHydrated", () => ({
  useHydrated: () => fixture.hydration.value,
}));
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
    user: { id: "cust_a", name: "Test Customer", phone: "+910000000000" },
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
// Keep the REAL payment store so the route's own reset/status effects run.
vi.mock("@/features/payments", async () => {
  const { usePaymentStore } = await vi.importActual<
    typeof import("@/features/payments/state/paymentStore")
  >("@/features/payments/state/paymentStore");
  return {
    usePaymentStore,
    paymentRepository: {
      validateForPayment: vi.fn(async () => ({
        success: true,
        data: { valid: true, issues: [] },
      })),
      createPaymentOrder: vi.fn(),
      verifyPayment: vi.fn(),
      cancelPayment: vi.fn(),
    },
    razorpayAdapter: { initialize: vi.fn(async () => {}), openCheckout: vi.fn() },
    PaymentMethodList: () => null,
    SecurePaymentBadge: () => null,
    RazorpayModalHandler: () => null,
  };
});

import { Route as PaymentRoute } from "./payment";

const PaymentPage = (PaymentRoute as unknown as { options: { component: React.ComponentType } })
  .options.component;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  fixture.hydration.value = false;
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

describe("payment route — hook order survives hydration", () => {
  it("renders the skeleton, then the payment screen, without a hooks-count error", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    // Cold load: not hydrated yet → skeleton, and the pay CTA is absent.
    await act(async () => root.render(<PaymentPage />));
    expect(container.querySelector("[data-testid='app-shell']")).toBeTruthy();
    expect(buttonWithText("Pay Online")).toBeUndefined();

    // Hydration lands and the SAME component re-renders past every early
    // return. Before the fix this render registered one extra hook and
    // React threw here.
    fixture.hydration.value = true;
    await act(async () => root.render(<PaymentPage />));

    expect(buttonWithText("Pay Online")).toBeDefined();
    expect(container.textContent).toContain("Checkout Summary");

    // Belt and braces: if React swallowed the throw into its error channel,
    // the hook-order message itself must not have been logged either.
    const hookOrderErrors = consoleError.mock.calls.filter((call) =>
      String(call[0] ?? "").includes("Rendered more hooks"),
    );
    expect(hookOrderErrors).toEqual([]);
  });
});
