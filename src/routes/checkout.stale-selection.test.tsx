/**
 * T2.2 follow-up — the checkout handler must re-read the LIVE store selection
 * before any preflight/order/gateway call. The rendered bill and `isDelivery`
 * closure belong to the render that produced them; if the outlet or mode
 * changes between render and tap, running the old closure against new state
 * would authorise the wrong order.
 *
 * The store mock intentionally does NOT notify subscribers, so mutations after
 * mount reproduce the stale-render window exactly.
 */
/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const fixture = vi.hoisted(() => {
  const lines = [{ lineId: "l1", name: "Test Burger", quantity: 1, unitPrice: 249 }];
  const cartState = { lines, promo: null, priceLockExpiresAt: null };
  const store = {
    id: "store-A",
    name: "Surat Vesu",
    address: "1 Main Road",
    city: "Surat",
    area: "Vesu",
    lat: 21.15,
    lng: 72.77,
    phone: "+919876543210",
    imageUrl: null,
    hours: null,
    isOpen: true,
    isBusy: false,
    isRecentlyOpened: false,
    supports: { delivery: true, takeaway: true, dineIn: true },
    etaMinutes: 25,
    pickupEtaMinutes: 15,
    pricing: {},
  };
  const selection: {
    activeStore: typeof store | null;
    fulfillment: "delivery" | "takeaway" | "dinein" | null;
  } = { activeStore: store, fulfillment: "delivery" };
  return {
    lines,
    cartState,
    store,
    selection,
    cart: {
      calculateTotals: vi.fn(),
      validateCart: vi.fn(),
      clear: vi.fn(async () => ({ success: true })),
    },
    createOrder: vi.fn(),
    createPaymentOrder: vi.fn(),
    navigate: vi.fn(),
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  };
});

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
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/features/cart", () => ({
  cartRepository: fixture.cart,
  useCartStore: Object.assign(
    (select: (s: typeof fixture.cartState) => unknown) => select(fixture.cartState),
    { getState: () => fixture.cartState },
  ),
  selectItemCount: (s: { lines: unknown[] }) => s.lines.length,
  PromoInput: () => null,
}));
vi.mock("@/features/checkout", async () => {
  const actual = await vi.importActual<typeof import("@/features/checkout")>("@/features/checkout");
  return {
    ...actual,
    AddressSelector: () => null,
    FulfillmentDetailsCard: () => null,
    PaymentMethodSelector: () => null,
    ReviewItemsList: () => null,
  };
});
vi.mock("@/features/checkout/components/QuickAuthSheet", () => ({ QuickAuthSheet: () => null }));
// Plain selector + getState, deliberately without subscription: a mutation
// after mount does not re-render the tree.
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
    if (mode === "delivery") return store.supports?.delivery === true;
    if (mode === "takeaway") return store.supports?.takeaway === true;
    if (mode === "dinein") return store.supports?.dineIn === true;
    return false;
  },
}));
vi.mock("@/features/auth/state/authStore", () => {
  const authState = {
    user: { id: "cust_stale", name: "Test Customer", phone: "+910000000000" },
    isBootstrapped: true,
  };
  return {
    useAuthStore: Object.assign((select: (s: typeof authState) => unknown) => select(authState), {
      getState: () => authState,
      subscribe: () => () => {},
    }),
    selectIsAuthenticated: (s: { user: unknown }) => !!s.user,
  };
});
vi.mock("@/features/addresses", () => {
  const address = {
    id: "addr_stale",
    label: "home",
    line1: "1 Test Street",
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
vi.mock("@/features/loyalty/state/loyaltyStore", () => ({
  useLoyaltyStore: Object.assign(
    (select: (s: { balance: number }) => unknown) => select({ balance: 0 }),
    { getState: () => ({ balance: 0, refreshFromServer: vi.fn(async () => {}) }) },
  ),
}));
vi.mock("@/features/orders", () => ({
  orderRepository: {
    createFromCurrentContext: fixture.createOrder,
    finalizePaidOrder: vi.fn(),
    markPaymentFailed: vi.fn(async () => ({ success: true })),
  },
}));
vi.mock("@/features/payments", async () => {
  const { usePaymentStore } = await vi.importActual<
    typeof import("@/features/payments/state/paymentStore")
  >("@/features/payments/state/paymentStore");
  return {
    usePaymentStore,
    paymentRepository: {
      createPaymentOrder: fixture.createPaymentOrder,
      verifyPayment: vi.fn(),
      validateForPayment: vi.fn(async () => ({ success: true, data: { valid: true, issues: [] } })),
      cancelPayment: vi.fn(async () => ({ success: true })),
    },
    razorpayAdapter: { initialize: vi.fn(async () => {}), openCheckout: vi.fn() },
  };
});
vi.mock("@/features/payments/components/PaymentRecoveryPanel", () => ({
  PaymentRecoveryPanel: () => null,
}));

import { useCheckoutStore } from "@/features/checkout";
import { usePaymentStore } from "@/features/payments/state/paymentStore";
import { Route as CheckoutRoute } from "./checkout";

const CheckoutPage = (CheckoutRoute as unknown as { options: { component: React.ComponentType } })
  .options.component;

const totals = {
  success: true as const,
  data: {
    subtotal: 500,
    taxes: 0,
    packingFee: 0,
    deliveryFee: 0,
    promoDiscount: 0,
    loyaltyDiscount: 0,
    grandTotal: 500,
  },
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  fixture.cart.calculateTotals.mockReset();
  fixture.cart.validateCart.mockReset();
  fixture.createOrder.mockReset();
  fixture.createPaymentOrder.mockReset();
  fixture.cart.calculateTotals.mockResolvedValue(totals);
  fixture.cart.validateCart.mockResolvedValue({ success: true, data: { valid: true, issues: [] } });
  fixture.createOrder.mockResolvedValue({ success: true, data: { id: "ord_stale" } });
  fixture.selection.activeStore = fixture.store;
  fixture.selection.fulfillment = "delivery";
  usePaymentStore.getState().reset();
  useCheckoutStore.getState().reset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

function payButton(): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find((b) =>
    b.textContent?.includes("PAY"),
  );
  expect(button).toBeDefined();
  return button as HTMLButtonElement;
}

async function mount() {
  await act(async () => root.render(<CheckoutPage />));
}

async function clickPay() {
  await act(async () => payButton().click());
  await act(async () => {});
}

function expectNoOrderStarted() {
  expect(fixture.cart.validateCart).not.toHaveBeenCalled();
  expect(fixture.createOrder).not.toHaveBeenCalled();
  expect(fixture.createPaymentOrder).not.toHaveBeenCalled();
}

describe("checkout — stale render must not authorise the new selection", () => {
  it("mode changed after mount (still valid): blocks with a review message", async () => {
    await mount();
    expect(payButton().disabled).toBe(false);

    fixture.selection.fulfillment = "takeaway";
    await clickPay();

    expectNoOrderStarted();
    expect(container.textContent).toContain("checkout details changed");
    // The guard returns before setBusy/placeOrderInFlight, so the CTA is not
    // stuck in a processing state while the customer reviews the change.
    expect(payButton().textContent).not.toContain("Processing Order");
  });

  it("outlet changed to another valid outlet after mount: blocks", async () => {
    await mount();

    fixture.selection.activeStore = {
      ...fixture.store,
      id: "store-B",
      name: "Other Outlet",
    };
    await clickPay();

    expectNoOrderStarted();
    expect(container.textContent).toContain("checkout details changed");
  });

  it("mode removed/unsupported after mount: blocks with the choose-mode message", async () => {
    await mount();

    fixture.selection.activeStore = {
      ...fixture.store,
      supports: { delivery: false, takeaway: true, dineIn: false },
    };
    await clickPay();

    expectNoOrderStarted();
    expect(container.textContent).toContain("Choose how you'd like your order");
  });
});
