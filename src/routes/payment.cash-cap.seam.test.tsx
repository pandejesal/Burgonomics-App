/**
 * Colocated seam for the ₹500 counter-cash cap — the only fixture that mounts
 * the REAL /payment route and the REAL PaymentMethodList together.
 *
 * Why a separate file: payment.fulfillment.test.tsx deliberately replaces the
 * list with `() => null` for all of its cases, and
 * PaymentMethodList.offline.test.tsx deliberately mounts the list without the
 * route. Turning the real list on inside either suite would change the meaning
 * of its existing offline/cold-start, delivery and zero-due cases. This seam
 * keeps those files byte-for-byte intact.
 *
 * R2 defect pinned here: the route bills against the actual payable total and
 * applies the branch cap; the list calls the same REAL eligibility helper with
 * a null total, which skips the cap. An observed-offline counter bill above the
 * cap therefore alternates list→cash / route→online. The harness below records
 * the first forbidden cash transition and suppresses only its repeats so the
 * old build cannot spin in an unbounded React state loop. Production
 * eligibility (cashOnDeliveryAvailability) and both production components are
 * real; nothing about the decision is mocked away.
 */
/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
const lockState = { held: false };
let authEpoch = 0;

type ListProps = React.ComponentProps<
  typeof import("@/features/payments/components/PaymentMethodList").PaymentMethodList
>;
type ListMethod = ListProps["value"];

const fixture = vi.hoisted(() => ({
  cartState: {
    lines: [
      {
        lineId: "l1",
        productId: "p1",
        storeId: "store-A",
        name: "Test Burger",
        quantity: 1,
        unitPrice: 900,
        modifiers: [],
        availability: "available" as const,
      },
    ],
    promo: null,
  },
  checkoutState: {
    orderNotes: "",
    deliveryInstructions: "",
    pickupInstructions: "",
    diningNotes: "",
    tipAmount: 0,
    loyaltyPointsToRedeem: 0,
    tableNumber: "",
    checkoutFees: null as unknown as CheckoutFeesState,
  },
  store: {
    id: "store-A",
    name: "Surat Vesu",
    area: "Vesu",
    etaMinutes: 30,
    pickupEtaMinutes: 15,
    supports: { delivery: true, takeaway: true, dineIn: true },
  },
  selection: {
    activeStore: { id: "store-A" } as { id: string } | null,
    fulfillment: "takeaway" as "takeaway" | "delivery" | "dinein" | null,
  },
  fees: null as unknown as CheckoutFeesState,
  calculateTotals: vi.fn(),
  clearCart: vi.fn(async () => ({ success: true as const })),
  getOrder: vi.fn(),
  validateForPayment: vi.fn(),
  createPaymentOrder: vi.fn(),
  verifyPayment: vi.fn(),
  cancelPayment: vi.fn(),
  createCashOrder: vi.fn(),
  /** Provider boundary only — the repository and localStorage are REAL. */
  cashCreateOnServer: vi.fn(),
  realRepo:
    null as unknown as import("@/features/orders/repositories/OrderRepository").OrderRepository,
  initialize: vi.fn(async () => {}),
  openCheckout: vi.fn(),
  navigate: vi.fn(),
  appToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  sonnerToast: { warning: vi.fn(), error: vi.fn(), success: vi.fn(), info: vi.fn() },
  appConfig: {
    isOnline: false,
    connectionStatusKnown: true,
    browserOnlineEvidence: false,
  } as {
    isOnline: boolean;
    connectionStatusKnown: boolean;
    browserOnlineEvidence: boolean;
  },

  /* ── TEST-ONLY bounded loop guard ──────────────────────────────────────
   * The old build calls onChange("cash") forever. Record the first one, let it
   * reach the real route so the genuine failure is observed, then drop repeats
   * while `boundAboveCapLoop` is armed. The 16-change hard stop is a second
   * net: if a future build switches methods for any other reason, the test
   * fails loudly instead of hanging. */
  listChanges: [] as ListMethod[],
  cashAttempts: 0,
  suppressedRepeats: 0,
  boundAboveCapLoop: false,
}));
const initialLines = fixture.cartState.lines.slice();

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
  orderType: "takeaway",
  packagingFee: 0,
  deliveryFee: 0,
  deliveryQuoteId: null,
  provider: "test",
  expiresAt: Date.now() + 3_600_000,
});

/** A ready, branch-enabled counter quote capped at ₹500 (50,000 paise). */
const cappedFees = (): CheckoutFeesState => ({
  ...defaultFees(),
  cashOnDelivery: { enabled: true, maxOrderValuePaise: 50_000 },
});

/* ── shell / framework ─────────────────────────────────────────────────── */
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
      get: (_target, key: string) => {
        const Tag: "button" | "div" = key === "button" ? "button" : "div";
        return (props: Record<string, unknown> & { children?: React.ReactNode }) => {
          const { children, ...rest } = props;
          // Keep the real list's DOM props (id, role, aria-checked, disabled,
          // onClick); drop only animation-only props the harness cannot honor.
          for (const animationProp of ["whileTap", "initial", "animate", "transition"]) {
            delete rest[animationProp];
          }
          return <Tag {...(rest as React.HTMLAttributes<HTMLElement>)}>{children}</Tag>;
        };
      },
    },
  ),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useReducedMotion: () => false,
}));
/**
 * Interactive stand-in with the same confirm/cancel affordances as the real
 * dialog. It renders only while `open`, so the existing cap cases (which never
 * raise a reprice prompt) keep their byte-for-byte DOM expectations.
 */
vi.mock("@/shared/components/common/ConfirmDialog", () => ({
  ConfirmDialog: ({
    open,
    title,
    description,
    confirmLabel,
    cancelLabel,
    onConfirm,
    onOpenChange,
  }: {
    open: boolean;
    title?: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm?: () => void;
    onOpenChange?: (open: boolean) => void;
  }) =>
    open ? (
      <div role="alertdialog" data-testid="reprice-dialog">
        <p>{title}</p>
        <p>{description}</p>
        <button type="button" onClick={() => onOpenChange?.(false)}>
          {cancelLabel ?? "Cancel"}
        </button>
        <button type="button" onClick={() => onConfirm?.()}>
          {confirmLabel ?? "Continue"}
        </button>
      </div>
    ) : null,
}));
vi.mock("@/shared/hooks/useHydrated", () => ({ useHydrated: () => true }));

/* ── connectivity / services ───────────────────────────────────────────── */
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
  toast: {
    success: fixture.appToast.success,
    error: fixture.appToast.error,
    info: fixture.appToast.info,
  },
}));
vi.mock("sonner", () => ({ toast: fixture.sonnerToast }));

/* ── cart / quote / selection stores ───────────────────────────────────── */
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
// The real repository reads the CONCRETE cart store, not the barrel above.
vi.mock("@/features/cart/state/cartStore", () => ({
  useCartStore: { getState: () => fixture.cartState },
}));
// The list imports the concrete store, not the barrel the route imports. Keep
// the real store and feed the same capped quote through it; the eligibility
// helper it calls is the untouched production function.
vi.mock("@/features/checkout", () => {
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
      (select: (s: typeof fixture.checkoutState) => unknown) =>
        select({ ...fixture.checkoutState, checkoutFees: fees() }),
      { getState: () => ({ ...fixture.checkoutState, checkoutFees: fees() }) },
    ),
    useCheckoutFees: () => ({ state: fees(), view: readyView, refresh: vi.fn(async () => fees()) }),
    deliveryQuoteView: () =>
      fees().status === "ready" ? readyView : { ...readyView, payEnabled: false },
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
    user: { id: "cust_cash_cap", name: "Test Customer", phone: "+910000000000" },
    isBootstrapped: true,
  };
  return {
    // Same-UID epoch advance is a session change for the scope fence.
    currentIdentityEpoch: () => authEpoch,
    useAuthStore: Object.assign((select: (s: typeof authState) => unknown) => select(authState), {
      getState: () => authState,
    }),
    selectIsAuthenticated: (s: { user: unknown }) => !!s.user,
  };
});
vi.mock("@/features/addresses", () => {
  const address = { id: "a1", label: "home", lat: 21.15, lng: 72.77 };
  return {
    useAddressStore: Object.assign(
      (select: (s: unknown) => unknown) => select({ selectedId: address.id }),
      { getState: () => ({ selectedId: address.id }) },
    ),
    selectAddresses: () => [address],
    selectSelectedAddress: () => address,
  };
});
/* Only the server transport is faked. The real OrderRepository and the real
 * durable pending-cash storage decide recovery, so a retired attempt cannot be
 * hidden by a `pendingCashAttempt: () => null` stub (the r1 review finding). */
vi.mock("@/features/payments/services/cashOrderService", () => ({
  CREATE_CASH_ORDER_PATH: "/orders/createCashOrder",
  createCashOrderUrl: () => "http://test/orders/createCashOrder",
  createCashOrderOnServer: fixture.cashCreateOnServer,
}));
vi.mock("@/features/orders/services/ordersService", () => ({
  ordersService: { getOrder: fixture.getOrder },
}));
// The real repository imports the online-draft transport at module load; keep
// that provider boundary faked instead of constructing a configured client.
vi.mock("@/core/network/httpClient", () => ({ httpClient: { post: vi.fn() } }));
type OrderRepositoryInstance = InstanceType<
  typeof import("@/features/orders/repositories/OrderRepository").OrderRepository
>;
vi.mock("@/features/orders", async () => {
  const { OrderRepository } = await vi.importActual<
    typeof import("@/features/orders/repositories/OrderRepository")
  >("@/features/orders/repositories/OrderRepository");
  const repo = new OrderRepository();
  fixture.realRepo = repo;
  return {
    orderRepository: {
      createCashOrder: (opts: Parameters<OrderRepositoryInstance["createCashOrder"]>[0]) =>
        fixture.createCashOrder(opts),
      // R5-B2: the resume read is a provider boundary, faked like the others.
      getOrder: (id: string) => fixture.getOrder(id),
      pendingCashAttempt: () => repo.pendingCashAttempt(),
      pendingCashOrderId: () => repo.pendingCashOrderId(),
      finalizePaidOrder: (...args: Parameters<OrderRepositoryInstance["finalizePaidOrder"]>) =>
        repo.finalizePaidOrder(...args),
      markPaymentFailed: (...args: Parameters<OrderRepositoryInstance["markPaymentFailed"]>) =>
        repo.markPaymentFailed(...args),
    },
  };
});
vi.mock("@/features/payments/components/PaymentRecoveryPanel", () => ({
  PaymentRecoveryPanel: () => null,
}));

/* ── real route + real list, with the TEST-ONLY onChange seam ─────────── */
vi.mock("@/features/payments", async () => {
  const { usePaymentStore } = await vi.importActual<
    typeof import("@/features/payments/state/paymentStore")
  >("@/features/payments/state/paymentStore");
  const { PaymentMethodList: RealPaymentMethodList } = await vi.importActual<
    typeof import("@/features/payments/components/PaymentMethodList")
  >("@/features/payments/components/PaymentMethodList");
  return {
    usePaymentStore,
    paymentRepository: {
      validateForPayment: fixture.validateForPayment,
      createPaymentOrder: fixture.createPaymentOrder,
      verifyPayment: fixture.verifyPayment,
      cancelPayment: fixture.cancelPayment,
    },
    razorpayAdapter: {
      initialize: fixture.initialize,
      openCheckout: fixture.openCheckout,
    },
    PaymentMethodList: (props: ListProps) => (
      <RealPaymentMethodList
        {...props}
        onChange={(next: ListMethod) => {
          fixture.listChanges.push(next);
          // Secondary net: any other unbounded switching fails the test.
          if (fixture.listChanges.length > 16) {
            throw new Error("Payment method switched more than 16 times; refusing to spin.");
          }
          if (next === "cash") {
            fixture.cashAttempts += 1;
            if (fixture.boundAboveCapLoop && fixture.cashAttempts > 1) {
              fixture.suppressedRepeats += 1;
              return; // bound the legacy list→cash / route→online loop
            }
          }
          props.onChange(next);
        }}
      />
    ),
    SecurePaymentBadge: () => null,
    RazorpayModalHandler: () => null,
  };
});

import type {
  CheckoutFeesReady,
  CheckoutFeesState,
} from "@/features/checkout/state/checkoutFeesTypes";
import { useCheckoutStore } from "@/features/checkout/state/checkoutStore";
import {
  cashSubmissionScope,
  captureCompletionScope,
  isCompletionScopeValid,
} from "@/features/checkout/state/checkoutCompletionScope";
import { configureAuthUidSource } from "@/features/auth/utils/scopedPersistence";
import {
  markPendingCashOrderConfirmed,
  savePendingCashOrder,
  updatePendingCashOrderAcceptedTotal,
} from "@/features/payments/services/pendingCashOrder";
import { Route as PaymentRoute } from "./payment";
import { usePaymentStore } from "@/features/payments/state/paymentStore";

const PaymentPage = (PaymentRoute as unknown as { options: { component: React.ComponentType } })
  .options.component;
const initialCheckoutFees = useCheckoutStore.getState().checkoutFees;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  authEpoch = 0;
  fixture.cartState.lines = initialLines.slice();
  fixture.calculateTotals.mockReset();
  fixture.clearCart.mockReset();
  fixture.clearCart.mockResolvedValue({ success: true });
  fixture.getOrder.mockReset();
  fixture.validateForPayment.mockReset();
  fixture.createPaymentOrder.mockReset();
  fixture.verifyPayment.mockReset();
  fixture.cancelPayment.mockReset();
  fixture.createCashOrder.mockReset();
  fixture.cashCreateOnServer.mockReset();
  fixture.initialize.mockReset();
  fixture.openCheckout.mockReset();
  fixture.calculateTotals.mockResolvedValue(totals(900));
  fixture.validateForPayment.mockResolvedValue({
    success: true,
    data: { valid: true, issues: [] },
  });
  fixture.createPaymentOrder.mockResolvedValue({
    success: true,
    data: {
      orderId: "order_cap_seam",
      amount: 900,
      currency: "INR",
      receipt: "rcpt_cap_seam",
      keyId: "rzp_test_key",
    },
  });
  // Real repository + real localStorage; only the POST below is faked.
  fixture.createCashOrder.mockImplementation((opts) => fixture.realRepo.createCashOrder(opts));
  fixture.cashCreateOnServer.mockResolvedValue({
    success: true,
    data: {
      orderId: "ord_cap",
      replayed: false,
      paymentMethod: "cod",
      paymentChannel: "cash",
      cashDuePaise: 90000,
      totals: {},
      status: { code: "PLACED", label: "Placed", kind: "upcoming", terminal: false },
    },
  });
  configureAuthUidSource({ getUid: () => "cust_cash_cap", subscribe: () => () => {} });
  localStorage.clear();
  lockState.held = false;
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    // Web Lock API fidelity: both call forms; a returned async callback holds
    // the lock until it settles (ifAvailable yields null while it is held).
    value: {
      request: async (_key: string, optionsOrClaim: any, maybeClaim?: any) => {
        const options = maybeClaim ? optionsOrClaim : undefined;
        const claim = maybeClaim ?? optionsOrClaim;
        if (options?.ifAvailable && lockState.held) return null;
        lockState.held = true;
        try {
          return await claim();
        } finally {
          lockState.held = false;
        }
      },
    },
  });
  fixture.initialize.mockResolvedValue(undefined);
  fixture.openCheckout.mockResolvedValue(undefined);

  fixture.selection.activeStore = { ...fixture.store };
  fixture.selection.fulfillment = "takeaway";
  fixture.fees = cappedFees();
  useCheckoutStore.setState({ checkoutFees: fixture.fees });
  fixture.appConfig = {
    isOnline: false,
    connectionStatusKnown: true,
    browserOnlineEvidence: false,
  };
  fixture.listChanges = [];
  fixture.cashAttempts = 0;
  fixture.suppressedRepeats = 0;
  fixture.boundAboveCapLoop = false;
  usePaymentStore.getState().reset();
  sessionStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  useCheckoutStore.setState({ checkoutFees: initialCheckoutFees });
  vi.restoreAllMocks();
});

async function mountPayment() {
  await act(async () => root.render(<PaymentPage />));
  await act(async () => {});
}

function buttonWithText(text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button")).find((b) =>
    b.textContent?.includes(text),
  );
}
function cashButton(): HTMLButtonElement | null {
  return container.querySelector<HTMLButtonElement>("#payment-option-cash");
}
function bodyText(): string {
  return container.textContent ?? "";
}

function expectNoPaymentRequest() {
  expect(fixture.createCashOrder).not.toHaveBeenCalled();
  expect(fixture.validateForPayment).not.toHaveBeenCalled();
  expect(fixture.createPaymentOrder).not.toHaveBeenCalled();
  expect(fixture.initialize).not.toHaveBeenCalled();
  expect(fixture.openCheckout).not.toHaveBeenCalled();
}

describe("payment route + real list — counter cash cap with observed offline", () => {
  it("₹900 above the ₹500 cap: no cash fallback, no offline toast, no request, honest refusal", async () => {
    fixture.boundAboveCapLoop = true; // detect the first cash attempt, then bound repeats
    // ₹900 is a real payable counter bill; both components see the SAME capped quote.

    await mountPayment();

    // No list→cash transition at all is the contract. On the R2 build the
    // first transition still reaches the route and is recorded, then the
    // harness suppresses repeats so this assertion fails instead of looping.
    expect(fixture.cashAttempts).toBe(0);
    expect(fixture.suppressedRepeats).toBe(0);
    expect(fixture.listChanges).toEqual([]);
    expect(usePaymentStore.getState().method).toBe("online");

    const cash = cashButton();
    expect(cash === null || cash.getAttribute("aria-checked") !== "true").toBe(true);
    expect(cash === null || cash.disabled).toBe(true);

    expect(fixture.sonnerToast.warning).not.toHaveBeenCalled();
    expect(fixture.sonnerToast.error).not.toHaveBeenCalled();
    expect(fixture.appToast.error).not.toHaveBeenCalled();
    expect(bodyText()).toMatch(/up to ₹500|Please pay online/i);
    expectNoPaymentRequest();
  });

  it("a stale cash selection above the cap is refused by the real action boundary", async () => {
    fixture.appConfig = {
      isOnline: true,
      connectionStatusKnown: true,
      browserOnlineEvidence: true,
    };
    await mountPayment();

    const pay = buttonWithText("Pay Online");
    expect(pay).toBeDefined();
    expect(pay!.disabled).toBe(false);

    // Written straight to the live store after render, like a restored draft.
    usePaymentStore.setState({ method: "cash" });
    await act(async () => pay!.click());
    await act(async () => {});

    expect(usePaymentStore.getState().method).toBe("online");
    expect(bodyText()).toContain("up to ₹500");
    expectNoPaymentRequest();
  });

  it("at the ₹500 cap the observed-offline counter fallback still works once", async () => {
    fixture.calculateTotals.mockResolvedValue(totals(500));

    await mountPayment();

    expect(cashButton()).not.toBeNull();
    expect(fixture.cashAttempts).toBe(1);
    expect(fixture.suppressedRepeats).toBe(0);
    expect(fixture.listChanges).toEqual(["cash"]);
    expect(usePaymentStore.getState().method).toBe("cash");
    expect(fixture.sonnerToast.warning).toHaveBeenCalledTimes(1);
    expect(fixture.sonnerToast.warning).toHaveBeenCalledWith(
      "Offline Mode Active",
      expect.anything(),
    );
    expect(bodyText()).not.toMatch(/up to ₹500/);
    expectNoPaymentRequest();
  });

  /**
   * HungerG: the server reprices a below-cap ₹400 counter bill to ₹600. The
   * customer's explicit acceptance must re-check the cap with the accepted
   * paise (not the stale displayed total) before any second cash create, and
   * must not open the gateway automatically when the cash tender is refused.
   */
  it("accepted reprice above the cap stays online with exactly one cash attempt", async () => {
    fixture.appConfig = {
      isOnline: true,
      connectionStatusKnown: true,
      browserOnlineEvidence: true,
    };
    fixture.calculateTotals.mockResolvedValue(totals(400));
    // A definitive server refusal: verified no-write, carrying the new paise.
    // Only the transport is faked; the real repository claims the attempt and
    // stores it in real localStorage before the POST.
    fixture.cashCreateOnServer.mockReset();
    fixture.cashCreateOnServer.mockResolvedValueOnce({
      success: false,
      error: {
        code: "PRICE_CHANGED",
        details: { totals: { split: { totalAmountPaise: 60_000 } } },
      },
    });

    await mountPayment();

    const cash = cashButton();
    expect(cash).not.toBeNull();
    await act(async () => cash!.click());
    await act(async () => {});
    const place = buttonWithText("Place Order");
    expect(place).toBeDefined();
    await act(async () => place!.click());
    await act(async () => {});

    expect(fixture.createCashOrder).toHaveBeenCalledTimes(1);
    expect(fixture.createCashOrder).toHaveBeenNthCalledWith(1, {});
    const pendingKeys = () =>
      Object.keys(localStorage).filter((key) => key.includes("burgonomics.pendingCashOrder.v1"));
    expect(pendingKeys()).toHaveLength(1);
    const dialog = container.querySelector('[data-testid="reprice-dialog"]');
    expect(dialog?.textContent).toContain("600");
    const proceed = Array.from(dialog?.querySelectorAll("button") ?? []).find(
      (button) => button.textContent === "Continue",
    );
    expect(proceed).toBeDefined();

    await act(async () => proceed!.click());
    await act(async () => {});

    expect(fixture.createCashOrder).toHaveBeenCalledTimes(1);
    expect(usePaymentStore.getState().method).toBe("online");
    const online = container.querySelector<HTMLButtonElement>("#payment-option-online");
    expect(online?.getAttribute("aria-checked")).toBe("true");
    expect(bodyText()).toMatch(/up to ₹500|Please pay online/i);
    expect(fixture.createPaymentOrder).not.toHaveBeenCalled();
    expect(fixture.initialize).not.toHaveBeenCalled();
    expect(fixture.openCheckout).not.toHaveBeenCalled();
    expect(pendingKeys()).toHaveLength(0);

    // The NEXT explicit online tap is the regression: with the stale attempt it
    // replays cash instead of paying online. It must now reach the gateway.
    // Keep the gateway quote equal to the displayed ₹400 bill; the default
    // ₹900 quote would re-open a reprice prompt instead of the gateway.
    fixture.createPaymentOrder.mockResolvedValue({
      success: true,
      data: {
        orderId: "rzp_after_decline",
        amount: 400,
        currency: "INR",
        receipt: "rcpt_after_decline",
        keyId: "rzp_test_key",
      },
    });
    // Pick the CTA, not the list's radio option (both say "Pay Online").
    const payOnline = Array.from(container.querySelectorAll("button")).find(
      (button) =>
        button.textContent?.includes("Pay Online") && button.getAttribute("role") !== "radio",
    );
    expect(payOnline).toBeDefined();
    await act(async () => payOnline!.click());
    await act(async () => {});

    expect(fixture.createCashOrder).toHaveBeenCalledTimes(1);
    expect(fixture.validateForPayment).toHaveBeenCalledTimes(2);
    expect(fixture.createPaymentOrder).toHaveBeenCalledTimes(1);
    expect(fixture.openCheckout).toHaveBeenCalledTimes(1);
  });

  /** r3 High 2: an unsafe retirement must not switch tender on /payment. */
  it("keeps cash selected with no payment when the decline cannot be retired", async () => {
    fixture.appConfig = {
      isOnline: true,
      connectionStatusKnown: true,
      browserOnlineEvidence: true,
    };
    fixture.calculateTotals.mockResolvedValue(totals(400));
    fixture.cashCreateOnServer.mockReset();
    fixture.cashCreateOnServer.mockResolvedValueOnce({
      success: false,
      error: {
        code: "PRICE_CHANGED",
        details: { totals: { split: { totalAmountPaise: 60_000 } } },
      },
    });
    await mountPayment();
    const cash = cashButton();
    expect(cash).not.toBeNull();
    await act(async () => cash!.click());
    await act(async () => {});
    const place = buttonWithText("Place Order");
    expect(place).toBeDefined();
    await act(async () => place!.click());
    await act(async () => {});

    expect(fixture.createCashOrder).toHaveBeenCalledTimes(1);
    const proceed = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[data-testid="reprice-dialog"] button'),
    ).find((button) => button.textContent === "Continue");
    expect(proceed).toBeDefined();

    // Newer same-id write while the dialog is open: retirement is unsafe.
    updatePendingCashOrderAcceptedTotal(60_000);

    await act(async () => proceed!.click());
    await act(async () => {});

    // r2 switches to online even though the retire failed.
    expect(usePaymentStore.getState().method).toBe("cash");
    expect(fixture.createCashOrder).toHaveBeenCalledTimes(1);
    expect(fixture.createPaymentOrder).not.toHaveBeenCalled();
    expect(fixture.openCheckout).not.toHaveBeenCalled();
    expect(
      Object.keys(localStorage).some((key) => key.includes("burgonomics.pendingCashOrder.v1")),
    ).toBe(true);
  });
});

/** R5-B1 corrections — deferred/latch regressions, real repo + fake transport. */
describe("payment route — terminal stale receipts and bound cash confirmation", () => {
  const startedSignal = () => {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => (resolve = r));
    return { promise, resolve };
  };
  const deferredResult = () => {
    let resolve!: (value: unknown) => void;
    const promise = new Promise<unknown>((r) => (resolve = r));
    return { promise, resolve };
  };
  const cashReceipt = (orderId: string, cashDuePaise: number) => ({
    success: true as const,
    data: {
      orderId,
      replayed: false,
      paymentMethod: "cod",
      paymentChannel: "cash",
      cashDuePaise,
      totals: {},
      status: { code: "PLACED", label: "Placed", kind: "upcoming", terminal: false },
    },
  });
  const posts = () => fixture.cashCreateOnServer.mock.calls.length;
  const flush = async () => {
    for (let attempt = 0; attempt < 4; attempt += 1) await act(async () => {});
  };
  const primaryCta = () =>
    Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) =>
        (button.textContent?.includes("Pay Online") ||
          button.textContent?.includes("Place Order")) &&
        button.getAttribute("role") !== "radio" &&
        !button.disabled,
    );
  const chooseCashAndPay = async () => {
    const cash = cashButton();
    expect(cash).not.toBeNull();
    await act(async () => cash!.click());
    await act(async () => {});
    const place = buttonWithText("Place Order");
    expect(place).toBeDefined();
    await act(async () => place!.click());
    await act(async () => {});
  };
  const seedConfirmedRecord = (orderId: string, zeroDueOnly: boolean) => {
    const request = {
      orderId,
      storeId: "store-A",
      orderType: "takeaway" as const,
      items: [{ productId: "p1", quantity: 1 }],
      expectedTotalPaise: zeroDueOnly ? 0 : 40_000,
      ...(zeroDueOnly ? { zeroDueOnly: true as const } : {}),
    };
    // Real durable storage computes the live basket hash and generation.
    savePendingCashOrder("att_recovered", orderId, request);
    markPendingCashOrderConfirmed(orderId);
    fixture.getOrder.mockImplementation(async (id: string) => ({
      success: true,
      data: {
        id,
        cashDuePaise: zeroDueOnly ? 0 : 40_000,
        paymentMethod: "cod",
        paymentChannel: "cash",
        totals: {},
        status: { code: "PLACED", label: "Placed", kind: "upcoming", terminal: false },
      },
    }));
  };

  it("a deferred confirmed result with an advanced session is terminal: one POST, no second order", async () => {
    fixture.appConfig = {
      isOnline: true,
      connectionStatusKnown: true,
      browserOnlineEvidence: true,
    };
    fixture.calculateTotals.mockResolvedValue(totals(400));
    const started = startedSignal();
    const reply = deferredResult();
    fixture.cashCreateOnServer.mockImplementation(async () => {
      started.resolve();
      return (await reply.promise) as never;
    });

    await mountPayment();
    const cash = cashButton();
    await act(async () => cash!.click());
    await act(async () => {});
    const place = buttonWithText("Place Order");
    expect(place).toBeDefined();
    const click = act(async () => place!.click());
    await started.promise;
    const posted = fixture.cashCreateOnServer.mock.calls[0][0] as {
      orderId: string;
      expectedTotalPaise: number;
    };
    const postedId = posted.orderId;
    fixture.getOrder.mockImplementation(async (id: string) => ({
      success: true,
      data: { id, cashDuePaise: posted.expectedTotalPaise, totals: {}, status: { code: "PLACED" } },
    }));

    authEpoch += 1; // same uid, new session lifetime while the POST is in flight
    reply.resolve(cashReceipt(postedId, posted.expectedTotalPaise));
    await click;
    await act(async () => {});

    expect(posts()).toBe(1);
    expect(bodyText()).toContain(postedId);
    expect(fixture.navigate).not.toHaveBeenCalled();
    expect(fixture.clearCart).not.toHaveBeenCalled();
    expect(usePaymentStore.getState().method).toBe("cash");

    const blockedPay = buttonWithText("Payment under review");
    expect(blockedPay).toBeDefined();
    expect(blockedPay!.disabled).toBe(true);
    await act(async () => blockedPay!.click());
    await act(async () => {});
    expect(fixture.createCashOrder).toHaveBeenCalledTimes(1);
    expect(posts()).toBe(1);
  });

  it("a basket edit while the cash reprice dialog is open blocks Continue replay", async () => {
    fixture.appConfig = {
      isOnline: true,
      connectionStatusKnown: true,
      browserOnlineEvidence: true,
    };
    fixture.calculateTotals.mockResolvedValue(totals(400));
    fixture.cashCreateOnServer.mockResolvedValueOnce({
      success: false,
      error: {
        code: "PRICE_CHANGED",
        details: { totals: { split: { totalAmountPaise: 60_000 } } },
      },
    } as never);

    await mountPayment();
    await chooseCashAndPay();
    expect(posts()).toBe(1);
    const dialog = container.querySelector('[data-testid="reprice-dialog"]');
    const proceed = Array.from(dialog?.querySelectorAll("button") ?? []).find(
      (button) => button.textContent === "Continue",
    );
    expect(proceed).toBeDefined();

    fixture.cartState.lines = [
      ...fixture.cartState.lines,
      { ...fixture.cartState.lines[0], lineId: "l2", productId: "p2" },
    ];
    await act(async () => proceed!.click());
    await act(async () => {});

    expect(posts()).toBe(1);
    expect(fixture.createCashOrder).toHaveBeenCalledTimes(1);
    expect(fixture.clearCart).not.toHaveBeenCalled();
    expect(fixture.cartState.lines).toHaveLength(2);
    expect(bodyText()).toMatch(/checkout changed/i);
  });

  it("a same-UID epoch advance while the cash reprice dialog is open blocks Continue replay", async () => {
    fixture.appConfig = {
      isOnline: true,
      connectionStatusKnown: true,
      browserOnlineEvidence: true,
    };
    fixture.calculateTotals.mockResolvedValue(totals(400));
    fixture.cashCreateOnServer.mockResolvedValueOnce({
      success: false,
      error: {
        code: "PRICE_CHANGED",
        details: { totals: { split: { totalAmountPaise: 60_000 } } },
      },
    } as never);

    await mountPayment();
    await chooseCashAndPay();
    expect(posts()).toBe(1);
    const dialog = container.querySelector('[data-testid="reprice-dialog"]');
    const proceed = Array.from(dialog?.querySelectorAll("button") ?? []).find(
      (button) => button.textContent === "Continue",
    );
    expect(proceed).toBeDefined();

    authEpoch += 1;
    await act(async () => proceed!.click());
    await act(async () => {});

    expect(posts()).toBe(1);
    expect(fixture.createCashOrder).toHaveBeenCalledTimes(1);
    expect(fixture.cartState.lines).toHaveLength(1);
    expect(bodyText()).toMatch(/checkout changed/i);
  });

  it("a matching-basket confirmed zero-due replay navigates to its exact id without clearing the cart", async () => {
    seedConfirmedRecord("ord_zero_recovered", true);
    await mountPayment();
    const pay = primaryCta();
    expect(pay).toBeDefined();

    await act(async () => pay!.click());
    await flush();

    expect(fixture.navigate).toHaveBeenCalledWith({
      to: "/order-confirmation/$orderId",
      params: { orderId: "ord_zero_recovered" },
      replace: true,
    });
    expect(fixture.clearCart).not.toHaveBeenCalled();
    expect(fixture.cartState.lines).toHaveLength(1);
    expect(posts()).toBe(0);
  });

  it("a matching-basket confirmed nonzero receipt still clears once", async () => {
    // A counter bill within the branch cap: the normal cash path stays valid.
    fixture.calculateTotals.mockResolvedValue(totals(400));
    seedConfirmedRecord("ord_cash_recovered", false);
    await mountPayment();
    const pay = primaryCta();
    expect(pay).toBeDefined();

    await act(async () => pay!.click());
    await flush();

    // One replay call, no POST and the exact confirmed id is navigated to.
    expect(fixture.createCashOrder.mock.calls).toEqual([[{}]]);
    expect(fixture.navigate).toHaveBeenCalledWith({
      to: "/order-confirmation/$orderId",
      params: { orderId: "ord_cash_recovered" },
      replace: true,
    });
    expect(fixture.clearCart).toHaveBeenCalledTimes(1);
  });

  it("a declined CASH_BUSY competitor does not erase ownership; epoch-less scope fails closed", async () => {
    const started = startedSignal();
    const reply = deferredResult();
    fixture.cashCreateOnServer.mockImplementation(async () => {
      started.resolve();
      return (await reply.promise) as never;
    });

    const first = fixture.createCashOrder({});
    await started.promise;
    const owned = cashSubmissionScope();
    expect(owned).not.toBeNull();
    expect(owned!.identityEpoch).toBe(0);

    const competitor = await fixture.createCashOrder({});
    if (competitor.success) throw new Error("expected the competing call to be declined");
    expect(competitor.error.code).toBe("CASH_BUSY");
    expect(cashSubmissionScope()).toBe(owned);

    authEpoch += 1;
    expect(isCompletionScopeValid(owned!)).toBe(false);
    expect(isCompletionScopeValid({ ...owned!, identityEpoch: undefined })).toBe(false);
    expect(captureCompletionScope().identityEpoch).toBe(1);

    reply.resolve(cashReceipt("ord_competing", 90_000));
    await first;
    expect(posts()).toBe(1);
  });
});

/** R5-B2 — deferred online replies bind to the submitting account/basket. */
describe("payment route — online completion ownership", () => {
  const signal = () => {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => (resolve = r));
    return { promise, resolve };
  };
  const deferred = () => {
    let resolve!: (value: unknown) => void;
    const promise = new Promise<unknown>((r) => (resolve = r));
    return { promise, resolve };
  };
  const verified = () => ({
    success: true as const,
    data: { verified: true, confirmedOrderId: "ord_online_b2", paymentId: "pay_b2" },
  });
  const armOnline = (stage: "verify" | "finalize" | "open" | "throwVerify" | "unknown") => {
    const started = signal();
    const reply = deferred();
    fixture.appConfig = {
      isOnline: true,
      connectionStatusKnown: true,
      browserOnlineEvidence: true,
    };
    fixture.calculateTotals.mockResolvedValue(totals(400));
    fixture.createPaymentOrder.mockResolvedValue({
      success: true,
      data: {
        orderId: "rzp_b2",
        amount: 400,
        currency: "INR",
        receipt: "rcpt_b2",
        keyId: "rzp_test_key",
      },
    });
    if (stage === "verify" || stage === "throwVerify" || stage === "unknown") {
      fixture.verifyPayment.mockImplementation(async () => {
        started.resolve();
        const result = await reply.promise;
        if (stage === "throwVerify") throw new Error("verification transport failed");
        return result as never;
      });
    } else {
      fixture.verifyPayment.mockResolvedValue(verified());
    }
    const finalize = vi.spyOn(fixture.realRepo, "finalizePaidOrder");
    if (stage === "finalize") {
      finalize.mockImplementation(async () => {
        started.resolve();
        return (await reply.promise) as never;
      });
    } else {
      // All transports stay fake: a same-account completion really calls this.
      finalize.mockResolvedValue({ success: true, data: { id: "ord_online_b2" } } as never);
    }
    if (stage === "open") {
      // Defer the gateway initialize() await itself: no modal may open for a
      // submission superseded while it is pending.
      fixture.initialize.mockImplementation(async () => {
        started.resolve();
        await reply.promise;
      });
    }
    fixture.openCheckout.mockImplementation(
      async (handlers: { onSuccess: (r: Record<string, unknown>) => Promise<void> }) => {
        await handlers.onSuccess({ orderId: "rzp_b2", paymentId: "pay_b2" });
      },
    );
    return { started, reply, finalize };
  };
  const flush = async () => {
    for (let attempt = 0; attempt < 4; attempt += 1) await act(async () => {});
  };
  const enabledCta = () =>
    Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) =>
        (button.textContent?.includes("Pay Online") ||
          button.textContent?.includes("Place Order")) &&
        button.getAttribute("role") !== "radio" &&
        !button.disabled,
    );
  const noStaleCompletion = () => {
    expect(fixture.clearCart).not.toHaveBeenCalled();
    expect(fixture.navigate).not.toHaveBeenCalled();
    expect(usePaymentStore.getState().status).not.toBe("success");
  };
  const reconKeys = () =>
    Object.keys(sessionStorage).filter((key) => key.includes("burgonomics:payment_reconciliation"));
  const terminalReceipt = (orderId: string, paymentId: string) => {
    expect(bodyText()).toContain(orderId);
    expect(bodyText()).toContain(paymentId);
    expect(usePaymentStore.getState().failure?.retryable).toBe(false);
    expect(enabledCta()).toBeUndefined();
  };

  it("a session advance during verification performs no finalize, reconcile or navigation", async () => {
    const { started, reply, finalize } = armOnline("verify");
    await mountPayment();
    const pay = enabledCta();
    expect(pay).toBeDefined();
    const click = act(async () => pay!.click());
    await started.promise;

    authEpoch += 1; // same uid, new account lifetime while verification is pending
    reply.resolve(verified());
    await click;
    await flush();

    expect(finalize).not.toHaveBeenCalled();
    noStaleCompletion();
  });

  it("a same-account basket edit during verification finalizes once into a terminal receipt", async () => {
    const { started, reply, finalize } = armOnline("verify");
    await mountPayment();
    const pay = enabledCta();
    expect(pay).toBeDefined();
    const click = act(async () => pay!.click());
    await started.promise;

    fixture.cartState.lines = [
      ...fixture.cartState.lines,
      { ...fixture.cartState.lines[0], lineId: "l_b2", productId: "p_b2" },
    ];
    reply.resolve(verified());
    await click;
    await flush();

    expect(finalize).toHaveBeenCalledTimes(1);
    noStaleCompletion();
    expect(fixture.cartState.lines).toHaveLength(2);
    terminalReceipt("ord_online_b2", "pay_b2");
    expect(reconKeys()).toHaveLength(1);
  });

  it("a session advance during finalization blocks stale success and cart clearing", async () => {
    const { started, reply, finalize } = armOnline("finalize");
    await mountPayment();
    const pay = enabledCta();
    expect(pay).toBeDefined();
    const click = act(async () => pay!.click());
    await started.promise;

    authEpoch += 1;
    reply.resolve({ success: true, data: { id: "ord_online_b2" } });
    await click;
    await flush();

    expect(finalize).toHaveBeenCalledTimes(1);
    noStaleCompletion();
  });

  it("a same-account note edit during verification keeps the newer note with a terminal receipt", async () => {
    const { started, reply, finalize } = armOnline("verify");
    await mountPayment();
    const pay = enabledCta();
    expect(pay).toBeDefined();
    const click = act(async () => pay!.click());
    await started.promise;

    useCheckoutStore.getState().setOrderNotes("Newer note before online success");
    reply.resolve(verified());
    await click;
    await flush();

    expect(finalize).toHaveBeenCalledTimes(1);
    noStaleCompletion();
    expect(useCheckoutStore.getState().orderNotes).toBe("Newer note before online success");
    terminalReceipt("ord_online_b2", "pay_b2");
  });

  it("an unknown verification outcome still reconciles after a same-account basket edit", async () => {
    const { started, reply, finalize } = armOnline("unknown");
    await mountPayment();
    const pay = enabledCta();
    expect(pay).toBeDefined();
    const click = act(async () => pay!.click());
    await started.promise;

    fixture.cartState.lines = [
      ...fixture.cartState.lines,
      { ...fixture.cartState.lines[0], lineId: "l_b2", productId: "p_b2" },
    ];
    reply.resolve({
      success: false,
      error: { code: "TRANSFER_IN_PROGRESS", message: "Still processing" },
    });
    await click;
    await flush();

    expect(finalize).not.toHaveBeenCalled();
    expect(usePaymentStore.getState().reconciliationPending).toBe(true);
    expect(reconKeys()).toHaveLength(1);
    noStaleCompletion();
    expect(fixture.cartState.lines).toHaveLength(2);
  });

  it("an account change before a verification throw writes no reconciliation", async () => {
    const { started, reply } = armOnline("throwVerify");
    await mountPayment();
    const pay = enabledCta();
    expect(pay).toBeDefined();
    const click = act(async () => pay!.click());
    await started.promise;

    authEpoch += 1;
    reply.resolve(undefined);
    await click;
    await flush();

    expect(usePaymentStore.getState().reconciliationPending).toBe(false);
    expect(reconKeys()).toHaveLength(0);
    expect(usePaymentStore.getState().failure).toBeNull();
    expect(fixture.appToast.info).not.toHaveBeenCalled();
    expect(fixture.clearCart).not.toHaveBeenCalled();
    expect(fixture.navigate).not.toHaveBeenCalled();
  });

  it("a same-account basket edit before a verification throw still reconciles", async () => {
    const { started, reply } = armOnline("throwVerify");
    await mountPayment();
    const pay = enabledCta();
    expect(pay).toBeDefined();
    const click = act(async () => pay!.click());
    await started.promise;

    fixture.cartState.lines = [
      ...fixture.cartState.lines,
      { ...fixture.cartState.lines[0], lineId: "l_b2", productId: "p_b2" },
    ];
    reply.resolve(undefined);
    await click;
    await flush();

    expect(usePaymentStore.getState().reconciliationPending).toBe(true);
    expect(reconKeys()).toHaveLength(1);
    expect(usePaymentStore.getState().failure?.retryable).toBe(false);
    noStaleCompletion();
    expect(fixture.cartState.lines).toHaveLength(2);
  });

  it("a basket edit during gateway initialize blocks the modal open", async () => {
    const { started, reply } = armOnline("open");
    await mountPayment();
    const pay = enabledCta();
    expect(pay).toBeDefined();
    const click = act(async () => pay!.click());
    await started.promise;

    fixture.cartState.lines = [
      ...fixture.cartState.lines,
      { ...fixture.cartState.lines[0], lineId: "l_b2", productId: "p_b2" },
    ];
    reply.resolve(undefined);
    await click;
    await flush();

    expect(fixture.openCheckout).not.toHaveBeenCalled();
    noStaleCompletion();
  });

  const armCallbacks = (callback: "failure" | "cancel") => {
    const started = signal();
    const reply = deferred();
    fixture.appConfig = {
      isOnline: true,
      connectionStatusKnown: true,
      browserOnlineEvidence: true,
    };
    fixture.calculateTotals.mockResolvedValue(totals(400));
    fixture.createPaymentOrder.mockResolvedValue({
      success: true,
      data: {
        orderId: "rzp_b2",
        amount: 400,
        currency: "INR",
        receipt: "rcpt_b2",
        keyId: "rzp_test_key",
      },
    });
    fixture.verifyPayment.mockResolvedValue(verified());
    fixture.openCheckout.mockImplementation(
      async (handlers: {
        onSuccess: (r: Record<string, unknown>) => Promise<void>;
        onFailure: (e: unknown) => void;
        onCancel: () => void;
        onExternalWallet?: (wallet: string) => void;
      }) => {
        started.resolve();
        await reply.promise;
        if (callback === "failure") handlers.onFailure(new Error("declined by bank"));
        else handlers.onCancel();
      },
    );
    return { started, reply };
  };

  it("a gateway failure from a superseded submission publishes nothing", async () => {
    const { started, reply } = armCallbacks("failure");
    await mountPayment();
    const pay = enabledCta();
    expect(pay).toBeDefined();
    const click = act(async () => pay!.click());
    await started.promise;

    fixture.cartState.lines = [
      ...fixture.cartState.lines,
      { ...fixture.cartState.lines[0], lineId: "l_b2", productId: "p_b2" },
    ];
    reply.resolve(undefined);
    await click;
    await flush();

    expect(usePaymentStore.getState().status).not.toBe("failed");
    expect(fixture.appToast.error).not.toHaveBeenCalled();
    expect(fixture.clearCart).not.toHaveBeenCalled();
    expect(enabledCta()).toBeDefined();
  });

  it("a gateway cancel from a superseded submission publishes nothing", async () => {
    const { started, reply } = armCallbacks("cancel");
    await mountPayment();
    const pay = enabledCta();
    expect(pay).toBeDefined();
    const click = act(async () => pay!.click());
    await started.promise;

    fixture.cartState.lines = [
      ...fixture.cartState.lines,
      { ...fixture.cartState.lines[0], lineId: "l_b2", productId: "p_b2" },
    ];
    reply.resolve(undefined);
    await click;
    await flush();

    expect(usePaymentStore.getState().status).not.toBe("cancelled");
    expect(fixture.appToast.info).not.toHaveBeenCalled();
    expect(fixture.clearCart).not.toHaveBeenCalled();
    expect(enabledCta()).toBeDefined();
  });

  it("an old cancel callback cannot release a newer gateway attempt's guard", async () => {
    const opened = [signal(), signal()];
    const replies = [deferred(), deferred()];
    const handlers: Array<{
      onSuccess: (r: Record<string, unknown>) => Promise<void>;
      onFailure: (e: unknown) => void;
      onCancel: () => void;
    }> = [];
    fixture.appConfig = {
      isOnline: true,
      connectionStatusKnown: true,
      browserOnlineEvidence: true,
    };
    fixture.calculateTotals.mockResolvedValue(totals(400));
    fixture.createPaymentOrder.mockResolvedValue({
      success: true,
      data: {
        orderId: "rzp_b4",
        amount: 400,
        currency: "INR",
        receipt: "rcpt_b4",
        keyId: "rzp_test_key",
      },
    });
    fixture.verifyPayment.mockResolvedValue(verified());
    fixture.openCheckout.mockImplementation(
      async (h: {
        onSuccess: (r: Record<string, unknown>) => Promise<void>;
        onFailure: (e: unknown) => void;
        onCancel: () => void;
      }) => {
        const index = handlers.length;
        handlers.push(h);
        opened[index].resolve();
        const outcome = await replies[index].promise;
        if (index === 0 && outcome === "failure") h.onFailure(new Error("declined by bank"));
      },
    );
    // After the first failure the main CTA reads "Retry checkout".
    const payCta = () =>
      Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
        (button) =>
          /Pay Online|Retry checkout|Place Order/.test(button.textContent ?? "") &&
          button.getAttribute("role") !== "radio",
      );

    await mountPayment();
    const firstClick = act(async () => payCta()!.click());
    await opened[0].promise;

    // The stale old failure releases ONLY attempt 1's guard.
    replies[0].resolve("failure");
    await firstClick;
    await flush();
    expect(usePaymentStore.getState().status).toBe("failed");

    // A newer deferred attempt takes the guard and opens a second gateway.
    const secondClick = act(async () => payCta()!.click());
    await opened[1].promise;
    expect(fixture.createPaymentOrder).toHaveBeenCalledTimes(2);
    expect(fixture.openCheckout).toHaveBeenCalledTimes(2);
    expect(usePaymentStore.getState().status).toBe("waiting");

    // The old cancel arrives late: it must not free the newer guard or publish.
    await act(async () => {
      handlers[0].onCancel();
    });
    expect(usePaymentStore.getState().status).toBe("waiting");
    expect(fixture.appToast.info).not.toHaveBeenCalled();
    expect(fixture.createPaymentOrder).toHaveBeenCalledTimes(2);
    expect(fixture.openCheckout).toHaveBeenCalledTimes(2);

    // Another tap cannot mint a third gateway order while the newer guard is held.
    await act(async () => {
      payCta()?.click();
    });
    expect(fixture.createPaymentOrder).toHaveBeenCalledTimes(2);
    expect(fixture.openCheckout).toHaveBeenCalledTimes(2);

    replies[1].resolve("none");
    await secondClick;
    await flush();
  });

  /** R5-B5 — a success callback superseded across a post-money await. */
  type CheckoutHandlers = {
    onSuccess: (r: Record<string, unknown>) => Promise<void>;
    onFailure: (e: unknown) => void;
    onCancel: () => void;
  };
  const paymentCta = () =>
    Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) =>
        /Pay Online|Retry checkout|Place Order/.test(button.textContent ?? "") &&
        button.getAttribute("role") !== "radio",
    );
  const startFirstAttempt = () => {
    const cta = paymentCta();
    expect(cta, "payment CTA must be present at mount").toBeDefined();
    return act(async () => cta!.click());
  };
  const armPostAwaitInterleave = (stage: "verify" | "finalize" | "throw") => {
    const opened = [signal(), signal()];
    const replies = [deferred(), deferred()];
    const handlers: CheckoutHandlers[] = [];
    const verifyStarted = signal();
    const finalizeStarted = signal();
    const finalizeReply = deferred();
    fixture.appConfig = {
      isOnline: true,
      connectionStatusKnown: true,
      browserOnlineEvidence: true,
    };
    fixture.calculateTotals.mockResolvedValue(totals(400));
    fixture.createPaymentOrder.mockResolvedValue({
      success: true,
      data: {
        orderId: "rzp_b5",
        amount: 400,
        currency: "INR",
        receipt: "rcpt_b5",
        keyId: "rzp_test_key",
      },
    });
    fixture.verifyPayment.mockImplementation(async () => {
      verifyStarted.resolve();
      if (stage === "finalize") return verified() as never;
      const outcome = await replies[0].promise;
      if (stage === "throw") throw new Error("verification transport failed");
      return outcome as never;
    });
    const finalize = vi.spyOn(fixture.realRepo, "finalizePaidOrder");
    finalize.mockImplementation(async () => {
      finalizeStarted.resolve();
      if (stage === "finalize") return (await finalizeReply.promise) as never;
      return { success: true, data: { id: "ord_online_b5" } } as never;
    });
    fixture.openCheckout.mockImplementation(async (h: CheckoutHandlers) => {
      const index = handlers.length;
      handlers.push(h);
      opened[index].resolve();
      // The old modal opens and starts success; the newer one stays deferred.
      if (index === 0) h.onSuccess({ orderId: "rzp_b5", paymentId: "pay_b5" });
      else await replies[1].promise;
    });
    return { opened, replies, handlers, verifyStarted, finalizeStarted, finalizeReply, finalize };
  };
  // Old cancel on a basket-changed submission releases its own guard; a newer
  // attempt then binds and holds a deferred gateway open.
  const handGuardToNewer = async (
    handlers: CheckoutHandlers[],
    opened: Array<ReturnType<typeof signal>>,
  ) => {
    fixture.cartState.lines = [
      ...fixture.cartState.lines,
      { ...fixture.cartState.lines[0], lineId: "l_b5", productId: "p_b5" },
    ];
    await act(async () => {
      handlers[0].onCancel();
    });
    const secondClick = act(async () => paymentCta()!.click());
    await opened[1].promise;
    expect(fixture.createPaymentOrder).toHaveBeenCalledTimes(2);
    expect(fixture.openCheckout).toHaveBeenCalledTimes(2);
    expect(usePaymentStore.getState().status).toBe("waiting");
    // Wrap the pending click so `await` on this helper does not await it.
    return { secondClick };
  };
  const noOldPostAwaitPublication = () => {
    expect(usePaymentStore.getState().status).toBe("waiting");
    expect(usePaymentStore.getState().reconciliationPending).toBe(false);
    expect(reconKeys()).toHaveLength(0);
    expect(usePaymentStore.getState().failure).toBeNull();
    expect(fixture.appToast.info).not.toHaveBeenCalled();
    noStaleCompletion();
    expect(fixture.createPaymentOrder).toHaveBeenCalledTimes(2);
    expect(fixture.openCheckout).toHaveBeenCalledTimes(2);
  };
  const noThirdGateway = async () => {
    await act(async () => {
      paymentCta()?.click();
    });
    expect(fixture.createPaymentOrder).toHaveBeenCalledTimes(2);
    expect(fixture.openCheckout).toHaveBeenCalledTimes(2);
  };

  it("an old success verifying while an old cancel binds a newer deferred attempt publishes nothing", async () => {
    const { opened, replies, handlers, verifyStarted, finalize } = armPostAwaitInterleave("verify");
    await mountPayment();
    await act(async () => {});
    const firstClick = startFirstAttempt();
    await verifyStarted.promise;

    const { secondClick } = await handGuardToNewer(handlers, opened);
    replies[1].resolve("none");
    await secondClick;

    // Old verification resolves into a newer guard: no finalize, receipt,
    // reconciliation, navigation or cart clear may escape the old callback.
    replies[0].resolve(verified());
    await firstClick;
    await flush();

    expect(finalize).not.toHaveBeenCalled();
    noOldPostAwaitPublication();
    await noThirdGateway();
  });

  it("an old success finalizing while an old cancel binds a newer deferred attempt keeps its guard", async () => {
    const { opened, replies, handlers, finalizeStarted, finalizeReply, finalize } =
      armPostAwaitInterleave("finalize");
    await mountPayment();
    await act(async () => {});
    const firstClick = startFirstAttempt();
    await finalizeStarted.promise;

    const { secondClick } = await handGuardToNewer(handlers, opened);
    replies[1].resolve("none");
    await secondClick;

    // Old finalization resolves after the newer attempt took the guard: it may
    // not clear that guard or publish its terminal receipt into the new state.
    finalizeReply.resolve({ success: true, data: { id: "ord_old_b5" } });
    await firstClick;
    await flush();

    expect(finalize).toHaveBeenCalledTimes(1);
    noOldPostAwaitPublication();
    await noThirdGateway();
  });

  it("an old success throwing after an old cancel binds a newer attempt reconciles nothing", async () => {
    const { opened, replies, handlers, verifyStarted, finalize } = armPostAwaitInterleave("throw");
    await mountPayment();
    await act(async () => {});
    const firstClick = startFirstAttempt();
    await verifyStarted.promise;

    const { secondClick } = await handGuardToNewer(handlers, opened);
    replies[1].resolve("none");
    await secondClick;

    // The verification throw lands in the old catch, after a newer attempt
    // bound: no guard release and no reconciliation for the old callback.
    replies[0].resolve(undefined);
    await firstClick;
    await flush();

    expect(finalize).not.toHaveBeenCalled();
    noOldPostAwaitPublication();
    await noThirdGateway();
  });

  it("a create-order throw after a basket edit releases busy without publishing", async () => {
    const started = signal();
    const reply = deferred();
    fixture.appConfig = {
      isOnline: true,
      connectionStatusKnown: true,
      browserOnlineEvidence: true,
    };
    fixture.calculateTotals.mockResolvedValue(totals(400));
    fixture.createPaymentOrder.mockImplementation(async () => {
      started.resolve();
      await reply.promise;
      throw new Error("gateway create failed");
    });
    await mountPayment();
    const pay = enabledCta();
    expect(pay).toBeDefined();
    const click = act(async () => pay!.click());
    await started.promise;

    fixture.cartState.lines = [
      ...fixture.cartState.lines,
      { ...fixture.cartState.lines[0], lineId: "l_b2", productId: "p_b2" },
    ];
    reply.resolve(undefined);
    await click;
    await flush();

    expect(usePaymentStore.getState().status).not.toBe("failed");
    expect(fixture.appToast.error).not.toHaveBeenCalled();
    expect(enabledCta()).toBeDefined();
    expect(fixture.cartState.lines).toHaveLength(2);
  });
});

/** R5-B2 — an existing-order resume read must not publish into a newer session. */
describe("payment route — existing-order resume ownership", () => {
  const searchHook = PaymentRoute as unknown as { useSearch?: () => { orderId?: unknown } };
  const previousUseSearch = searchHook.useSearch;
  afterEach(() => {
    if (previousUseSearch === undefined) delete searchHook.useSearch;
    else searchHook.useSearch = previousUseSearch;
  });

  const unpaidOrder = () => ({
    id: "ord_resume_b2",
    status: { code: "PLACED", label: "Order placed", kind: "upcoming", terminal: false },
    fulfillment: "takeaway",
    store: { ...fixture.store, addressLine1: "1 Test Street", city: "Surat", area: "Vesu" },
    items: fixture.cartState.lines,
    totals: { grandTotal: 400 },
    payment: { method: "online", status: "pending" },
  });

  it("a session advance during the order read keeps the old order unpublished", async () => {
    let started!: () => void;
    const startedPromise = new Promise<void>((r) => (started = r));
    let resolve!: (value: unknown) => void;
    const reply = new Promise<unknown>((r) => (resolve = r));
    searchHook.useSearch = () => ({ orderId: "ord_resume_b2" });
    fixture.getOrder.mockImplementation(async () => {
      started();
      return (await reply) as never;
    });

    await mountPayment();
    await startedPromise;
    expect(bodyText()).not.toContain("Pay Online");

    authEpoch += 1; // logout + login as the same uid advances the fence
    resolve({ success: true, data: unpaidOrder() });
    for (let attempt = 0; attempt < 4; attempt += 1) await act(async () => {});

    expect(fixture.navigate).not.toHaveBeenCalled();
    expect(fixture.clearCart).not.toHaveBeenCalled();
    expect(bodyText()).not.toContain("Pay Online");
  });

  it("an unchanged session still shows the resumed payable order", async () => {
    searchHook.useSearch = () => ({ orderId: "ord_resume_b2" });
    fixture.getOrder.mockResolvedValue({ success: true, data: unpaidOrder() });

    await mountPayment();
    await flushResume();

    expect(fixture.getOrder).toHaveBeenCalledWith("ord_resume_b2");
    expect(bodyText()).toContain("Pay Online");
  });

  async function flushResume() {
    for (let attempt = 0; attempt < 4; attempt += 1) await act(async () => {});
  }
});
