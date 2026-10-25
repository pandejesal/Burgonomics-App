/**
 * COD must not settle a total the customer never accepted.
 *
 * The online path opens the gateway only on the SERVER's validated amount and
 * asks for explicit acceptance when it differs from what was shown. COD has no
 * server handshake, so the freshly recomputed client bill IS the amount to
 * settle — and the preflight revalidation can change it (price-lock refresh,
 * promo/quote change). Previously `startPayment` read the STALE `totals` state
 * and created the COD order anyway, silently charging the refreshed (higher)
 * figure. This mounts the real route and asserts the order is blocked until
 * the updated total is accepted.
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
    cartState,
    checkoutState,
    calculateTotals: vi.fn(),
    createFromCurrentContext: vi.fn(),
    navigate: vi.fn(),
    clearCart: vi.fn(async () => ({ success: true as const })),
    resetCheckout: vi.fn(),
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
// A minimal, inspectable stand-in for the real Radix dialog (which needs a
// portal/focus stack this suite does not exercise).
vi.mock("@/shared/components/common/ConfirmDialog", () => ({
  ConfirmDialog: ({
    open,
    title,
    description,
    confirmLabel,
    onConfirm,
  }: {
    open: boolean;
    title: string;
    description?: string;
    confirmLabel?: string;
    onConfirm: () => void;
  }) =>
    open ? (
      <div data-testid="reprice-dialog">
        <h2>{title}</h2>
        <p>{description}</p>
        <button type="button" onClick={onConfirm}>
          {confirmLabel ?? "Confirm"}
        </button>
      </div>
    ) : null,
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

/* ── feature stores / repos (faked) ────────────────────────────────────── */
vi.mock("@/features/cart", () => ({
  cartRepository: {
    calculateTotals: fixture.calculateTotals,
    clear: fixture.clearCart,
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
    { getState: () => ({ ...fixture.checkoutState, reset: fixture.resetCheckout }) },
  ),
  ReviewItemsList: () => null,
}));
vi.mock("@/features/stores/state/storeStore", () => ({
  useStoreSelection: (select: (s: unknown) => unknown) =>
    select({
      activeStore: { id: "store-A", name: "Surat Vesu", area: "Vesu", etaMinutes: 30 },
      fulfillment: "delivery",
    }),
}));
vi.mock("@/features/auth/state/authStore", () => {
  const authState = {
    user: { id: "cust_cod", name: "Test Customer", phone: "+910000000000" },
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
    createFromCurrentContext: fixture.createFromCurrentContext,
    finalizePaidOrder: vi.fn(),
    markPaymentFailed: vi.fn(),
  },
}));
vi.mock("@/features/payments/components/PaymentRecoveryPanel", () => ({
  PaymentRecoveryPanel: () => null,
}));
const validateForPayment = vi.hoisted(() =>
  vi.fn(async () => ({ success: true as const, data: { valid: true, issues: [] } })),
);
// Keep the REAL payment store (the route resets it on mount; the suite sets
// the cash method on the same store, exactly like the UI does).
vi.mock("@/features/payments", async () => {
  const { usePaymentStore } = await vi.importActual<
    typeof import("@/features/payments/state/paymentStore")
  >("@/features/payments/state/paymentStore");
  return {
    usePaymentStore,
    paymentRepository: {
      validateForPayment,
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
import { usePaymentStore } from "@/features/payments/state/paymentStore";

const PaymentPage = (PaymentRoute as unknown as { options: { component: React.ComponentType } })
  .options.component;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  fixture.calculateTotals.mockReset();
  fixture.createFromCurrentContext.mockReset();
  fixture.createFromCurrentContext.mockResolvedValue({ success: true, data: { id: "ord_cod" } });
  validateForPayment.mockResolvedValue({ success: true, data: { valid: true, issues: [] } });
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

async function mountCashPayment() {
  await act(async () => root.render(<PaymentPage />));
  // The route resets the payment store on mount; choose COD afterwards, as a
  // customer tapping the method selector would.
  await act(async () => usePaymentStore.getState().setMethod("cash"));
}

describe("COD — refreshed total needs explicit acceptance", () => {
  it("blocks the COD order when the refreshed total is higher, then creates it once accepted", async () => {
    // Mount prices the bill at ₹199; every later recompute (preflight refresh)
    // returns the higher ₹249.
    fixture.calculateTotals.mockResolvedValueOnce(totals(199)).mockResolvedValue(totals(249));

    await mountCashPayment();
    expect(container.textContent).toContain("199");

    const pay = buttonWithText("Place COD Order");
    expect(pay?.disabled).toBe(false);
    await act(async () => pay!.click());
    await act(async () => {});

    // Blocked: no order for a total the customer never accepted…
    expect(fixture.createFromCurrentContext).not.toHaveBeenCalled();
    const dialog = container.querySelector("[data-testid='reprice-dialog']");
    expect(dialog).toBeTruthy();
    expect(dialog?.textContent).toContain("Your total has been updated");
    expect(dialog?.textContent).toContain("249");
    expect(dialog?.textContent).toContain("199");

    // …and accepted explicitly, the same flow re-enters and creates it.
    await act(async () => {
      buttonWithText("Continue")!.click();
    });
    await act(async () => {});

    expect(fixture.createFromCurrentContext).toHaveBeenCalledTimes(1);
    expect(fixture.createFromCurrentContext).toHaveBeenCalledWith(
      expect.objectContaining({ paymentMethod: "cash" }),
    );
  });

  it("creates the COD order immediately when the refreshed total is unchanged (positive control)", async () => {
    fixture.calculateTotals.mockResolvedValue(totals(199));

    await mountCashPayment();
    await act(async () => buttonWithText("Place COD Order")!.click());
    await act(async () => {});

    expect(container.querySelector("[data-testid='reprice-dialog']")).toBeNull();
    expect(fixture.createFromCurrentContext).toHaveBeenCalledTimes(1);
  });
});
