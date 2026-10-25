/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const fixture = vi.hoisted(() => {
  const lines = [{ lineId: "l1", name: "Test Burger", quantity: 1, unitPrice: 199 }];
  const cartState = { lines, promo: null, priceLockExpiresAt: null };
  return {
    lines,
    cartState,
    cart: {
      calculateTotals: vi.fn(),
      validateCart: vi.fn(),
      clear: vi.fn(async () => ({ success: true })),
    },
    createOrder: vi.fn(),
    finalizePaidOrder: vi.fn(),
    createPaymentOrder: vi.fn(),
    verifyPayment: vi.fn(),
    initializeRazorpay: vi.fn(async () => {}),
    openCheckout: vi.fn(),
    navigate: vi.fn(),
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
    refreshLoyalty: vi.fn(async () => {}),
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
  PromoInput: ({ onChanged }: { onChanged: () => void }) => (
    <button type="button" onClick={() => onChanged()}>
      Refresh bill
    </button>
  ),
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
vi.mock("@/features/stores/state/storeStore", () => ({
  useStoreSelection: (select: (s: unknown) => unknown) =>
    select({
      activeStore: {
        id: "store-A",
        name: "Surat Vesu",
        lat: 21.15,
        lng: 72.77,
        pricing: {},
        isOpen: true,
        etaMinutes: 20,
      },
      fulfillment: "delivery",
      setFulfillment: vi.fn(),
    }),
}));
vi.mock("@/features/auth/state/authStore", () => {
  const authState = {
    user: { id: "cust_reset", name: "Test Customer", phone: "+910000000000" },
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
    id: "addr_reset",
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
    (select: (s: { balance: number }) => unknown) => select({ balance: 100 }),
    { getState: () => ({ balance: 100, refreshFromServer: fixture.refreshLoyalty }) },
  ),
}));
vi.mock("@/features/orders", () => ({
  orderRepository: {
    createFromCurrentContext: fixture.createOrder,
    finalizePaidOrder: fixture.finalizePaidOrder,
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
      verifyPayment: fixture.verifyPayment,
      validateForPayment: vi.fn(async () => ({ success: true, data: { valid: true, issues: [] } })),
      cancelPayment: vi.fn(async () => ({ success: true })),
    },
    razorpayAdapter: {
      initialize: fixture.initializeRazorpay,
      openCheckout: fixture.openCheckout,
    },
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

const totals = (subtotal: number, grandTotal: number) => ({
  success: true as const,
  data: {
    subtotal,
    taxes: 0,
    packingFee: 0,
    deliveryFee: 0,
    promoDiscount: Math.max(0, subtotal - grandTotal),
    loyaltyDiscount: 0,
    grandTotal,
  },
});

function seedSelections() {
  const store = useCheckoutStore.getState();
  store.setOrderNotes("Extra napkins please");
  store.setTipAmount(20);
  store.setLoyaltyPointsToRedeem(100);
}

function expectSelectionsCleared() {
  const state = useCheckoutStore.getState();
  expect(state.orderNotes).toBe("");
  expect(state.tipAmount).toBe(0);
  expect(state.loyaltyPointsToRedeem).toBe(0);
  expect(state.deliveryInstructions).toBe("");
  expect(state.pickupInstructions).toBe("");
  expect(state.diningNotes).toBe("");
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  fixture.cart.calculateTotals.mockReset();
  fixture.createOrder.mockReset();
  fixture.finalizePaidOrder.mockReset();
  fixture.createPaymentOrder.mockReset();
  fixture.verifyPayment.mockReset();
  fixture.openCheckout.mockReset();
  fixture.cart.calculateTotals.mockResolvedValue(totals(500, 500));
  fixture.cart.validateCart.mockResolvedValue({ success: true, data: { valid: true, issues: [] } });
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

async function mount() {
  await act(async () => root.render(<CheckoutPage />));
}

function payButton(): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find((b) =>
    b.textContent?.includes("PAY"),
  );
  expect(button).toBeDefined();
  return button as HTMLButtonElement;
}

async function placeOrder() {
  const pay = payButton();
  expect(pay.disabled).toBe(false);
  await act(async () => {
    pay.click();
  });
  await act(async () => {});
}

describe("checkout selections reset after every successful order path", () => {
  it("clears tip, redeemed points and notes after a cash order", async () => {
    usePaymentStore.getState().setMethod("cash");
    fixture.createOrder.mockResolvedValue({ success: true, data: { id: "ord_cash_reset" } });
    seedSelections();

    await mount();
    await placeOrder();

    expect(fixture.createOrder).toHaveBeenCalledTimes(1);
    expectSelectionsCleared();
  });

  it("clears them after a zero-payable free order and records a pending, unpaid marker", async () => {
    usePaymentStore.getState().setMethod("online");
    fixture.cart.calculateTotals.mockResolvedValue(totals(500, 0));
    fixture.createOrder.mockResolvedValue({ success: true, data: { id: "ord_free_reset" } });
    seedSelections();

    await mount();
    await placeOrder();

    expect(fixture.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ paymentMethod: "online", paymentStatus: "pending" }),
    );
    expect(fixture.createPaymentOrder).not.toHaveBeenCalled();
    expectSelectionsCleared();
  });

  it("clears them after a verified online payment", async () => {
    usePaymentStore.getState().setMethod("online");
    fixture.cart.calculateTotals.mockResolvedValue(totals(500, 500));
    fixture.createPaymentOrder.mockResolvedValue({
      success: true,
      data: {
        orderId: "order_rzp_reset",
        amount: 420,
        currency: "INR",
        receipt: "rcpt_reset",
        keyId: "rzp_test_key",
      },
    });
    fixture.verifyPayment.mockResolvedValue({
      success: true,
      data: { verified: true, confirmedOrderId: "ord_paid_reset", paymentId: "pay_reset" },
    });
    fixture.finalizePaidOrder.mockResolvedValue({
      success: true,
      data: { id: "ord_paid_reset" },
    });
    fixture.openCheckout.mockImplementation(
      async (handlers: { onSuccess: (r: Record<string, unknown>) => Promise<void> }) => {
        await handlers.onSuccess({ orderId: "order_rzp_reset", paymentId: "pay_reset" });
      },
    );
    seedSelections();

    await mount();
    await placeOrder();
    await act(async () => {});

    expect(fixture.finalizePaidOrder).toHaveBeenCalledTimes(1);
    expectSelectionsCleared();
  });
});
