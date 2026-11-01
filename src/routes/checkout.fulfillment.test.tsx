/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const fixture = vi.hoisted(() => {
  const lines = [{ lineId: "l1", name: "Test Burger", quantity: 1, unitPrice: 249 }];
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
    setFulfillmentSpy: vi.fn(),
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
    PaymentMethodSelector: () => null,
    ReviewItemsList: () => null,
  };
});
vi.mock("@/features/checkout/components/QuickAuthSheet", () => ({ QuickAuthSheet: () => null }));
vi.mock("@/features/auth/state/authStore", () => {
  const authState = {
    user: { id: "cust_fulfill", name: "Test Customer", phone: "+910000000000" },
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
    id: "addr_fulfill",
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

import type { Fulfillment, Store } from "@/features/stores/models/Store";
import { useStoreSelection } from "@/features/stores/state/storeStore";
import { useCheckoutStore } from "@/features/checkout";
import { usePaymentStore } from "@/features/payments/state/paymentStore";
import { Route as CheckoutRoute } from "./checkout";

const CheckoutPage = (CheckoutRoute as unknown as { options: { component: React.ComponentType } })
  .options.component;

const store: Store = {
  id: "str_fulfill",
  name: "Vesu Outlet",
  address: "1 Main Road, Vesu",
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

const totals = (subtotal: number, grandTotal: number) => ({
  success: true as const,
  data: {
    subtotal,
    taxes: 0,
    packingFee: 0,
    deliveryFee: 0,
    promoDiscount: 0,
    loyaltyDiscount: 0,
    grandTotal,
  },
});

let container: HTMLDivElement;
let root: Root;

function seedSelection(fulfillment: Fulfillment | null, activeStore: Store | null) {
  useStoreSelection.setState({
    activeStore,
    fulfillment,
    fulfillmentStatus: fulfillment ? "selected" : "none",
    isHydrated: true,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fixture.cart.calculateTotals.mockReset();
  fixture.cart.validateCart.mockReset();
  fixture.createOrder.mockReset();
  fixture.finalizePaidOrder.mockReset();
  fixture.createPaymentOrder.mockReset();
  fixture.verifyPayment.mockReset();
  fixture.openCheckout.mockReset();
  fixture.initializeRazorpay.mockReset();
  fixture.cart.clear.mockClear();
  fixture.cart.calculateTotals.mockResolvedValue(totals(500, 500));
  fixture.cart.validateCart.mockResolvedValue({ success: true, data: { valid: true, issues: [] } });
  fixture.createOrder.mockResolvedValue({ success: true, data: { id: "ord_fulfill" } });
  usePaymentStore.getState().reset();
  useCheckoutStore.getState().reset();
  seedSelection(null, store);
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
  const button = Array.from(container.querySelectorAll("button")).find((b) => {
    const text = b.textContent ?? "";
    return text.includes("PAY") || text.includes("FULFILLMENT") || text.includes("PAYMENT UNDER REVIEW");
  });
  expect(button).toBeDefined();
  return button as HTMLButtonElement;
}

function radio(value: Fulfillment): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>(`input[type="radio"][value="${value}"]`);
  expect(input).not.toBeNull();
  return input!;
}

describe("checkout — null fulfillment is an honest, blocking state", () => {
  it("shows the unselected chooser and disables PAY before any preflight can run", async () => {
    await mount();

    expect(container.textContent).toContain("Choose how you'd like your order");
    expect(container.textContent).not.toContain("1. Delivery Details");
    expect(payButton().disabled).toBe(true);
    expect(payButton().getAttribute("aria-disabled")).toBe("true");
    expect(payButton().textContent).toContain("CHOOSE FULFILLMENT");
    expect(payButton().title).toContain("fulfillment");

    // Belt-and-braces: even a programmatic activation must not reach cart
    // validation, order creation, or the payment gateway.
    await act(async () => {
      payButton().dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await act(async () => {});

    expect(fixture.cart.validateCart).not.toHaveBeenCalled();
    expect(fixture.createOrder).not.toHaveBeenCalled();
    expect(fixture.createPaymentOrder).not.toHaveBeenCalled();
  });

  it("blocks the cash path with a banked tip while no mode is chosen", async () => {
    usePaymentStore.getState().setMethod("cash");
    useCheckoutStore.getState().setTipAmount(40);
    useCheckoutStore.getState().setOrderNotes("Keep the tip");

    await mount();

    expect(container.textContent).toContain("Delivery Partner Tip");
    expect(payButton().disabled).toBe(true);
    await act(async () => payButton().click());
    await act(async () => {});

    expect(fixture.createOrder).not.toHaveBeenCalled();
    // The persisted checkout selection is untouched by the blocked attempt.
    expect(useCheckoutStore.getState().tipAmount).toBe(40);
    expect(useCheckoutStore.getState().orderNotes).toBe("Keep the tip");
  });

  it("does not claim a persisted mode when the outlet is unknown", async () => {
    seedSelection("delivery", null);
    await mount();

    expect(container.textContent).toContain("Select an outlet");
    expect(container.textContent).not.toContain("1. Delivery Details");
    expect(payButton().disabled).toBe(true);
    await act(async () => payButton().click());
    await act(async () => {});

    expect(fixture.cart.validateCart).not.toHaveBeenCalled();
    expect(fixture.createOrder).not.toHaveBeenCalled();
  });

  it("fails closed, without crashing, for a legacy cached store with no supports metadata", async () => {
    seedSelection("delivery", { ...store, supports: undefined } as unknown as Store);
    await mount();

    // Honest unavailable state + the same outlet exit, never a guessed mode.
    expect(container.textContent).toContain("This outlet is not offering");
    expect(container.textContent).toContain("Choose Outlet");
    expect(payButton().disabled).toBe(true);
    await act(async () => payButton().click());
    await act(async () => {});

    expect(fixture.cart.validateCart).not.toHaveBeenCalled();
    expect(fixture.createOrder).not.toHaveBeenCalled();
    expect(fixture.createPaymentOrder).not.toHaveBeenCalled();
  });

  it("never offers a mode the outlet does not support", async () => {
    seedSelection(null, { ...store, supports: { delivery: false, takeaway: true, dineIn: false } });
    await mount();

    expect(container.querySelector('input[value="delivery"]')).toBeNull();
    expect(container.querySelector('input[value="dinein"]')).toBeNull();
    expect(radio("takeaway")).not.toBeNull();
    expect(payButton().disabled).toBe(true);
  });

  it("wires an explicit supported choice through setFulfillment and unblocks PAY", async () => {
    await mount();
    expect(payButton().disabled).toBe(true);

    await act(async () => radio("takeaway").click());
    await act(async () => {});

    // Real store selection now holds the explicit choice; no default was guessed.
    expect(useStoreSelection.getState().fulfillment).toBe("takeaway");
    expect(container.textContent).toContain("1. Pickup Location");
    expect(payButton().disabled).toBe(false);
  });
});

describe("checkout — normal modes keep their order behaviour", () => {
  it("still places a takeaway cash order after an explicit selection", async () => {
    usePaymentStore.getState().setMethod("cash");
    seedSelection("takeaway", store);
    await mount();

    expect(container.textContent).toContain("1. Pickup Location");
    expect(payButton().disabled).toBe(false);
    await act(async () => payButton().click());
    await act(async () => {});

    expect(fixture.cart.validateCart).toHaveBeenCalledTimes(1);
    expect(fixture.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ paymentMethod: "cash", paymentStatus: "PAY_AT_STORE" }),
    );
  });

  it("still places a delivery cash order with a selected address", async () => {
    usePaymentStore.getState().setMethod("cash");
    seedSelection("delivery", store);
    await mount();

    expect(container.textContent).toContain("1. Delivery Details");
    expect(payButton().disabled).toBe(false);
    await act(async () => payButton().click());
    await act(async () => {});

    expect(fixture.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ paymentMethod: "cash", paymentStatus: "CASH_PENDING" }),
    );
  });
});

describe("checkout — completion owns cleanup, not the receipt screen", () => {
  it("clears on a verified success and builds a fresh intent for the next order", async () => {
    usePaymentStore.getState().setMethod("online");
    seedSelection("delivery", store);
    useCheckoutStore.getState().setTipAmount(25);
    useCheckoutStore.getState().setOrderNotes("First order notes");

    fixture.createPaymentOrder.mockResolvedValueOnce({
      success: true,
      data: {
        orderId: "order_rzp_first",
        amount: 525,
        currency: "INR",
        receipt: "rcpt_first",
        keyId: "rzp_test_key",
      },
    });
    fixture.verifyPayment.mockResolvedValue({
      success: true,
      data: { verified: true, confirmedOrderId: "ord_paid_first", paymentId: "pay_first" },
    });
    fixture.finalizePaidOrder.mockResolvedValue({
      success: true,
      data: { id: "ord_paid_first" },
    });
    fixture.openCheckout.mockImplementation(
      async (handlers: { onSuccess: (r: Record<string, unknown>) => Promise<void> }) => {
        await handlers.onSuccess({ orderId: "order_rzp_first", paymentId: "pay_first" });
      },
    );

    await mount();
    await act(async () => payButton().click());
    await act(async () => {});

    expect(fixture.createPaymentOrder).toHaveBeenCalledTimes(1);
    expect(fixture.cart.clear).toHaveBeenCalledTimes(1);
    expect(useCheckoutStore.getState().tipAmount).toBe(0);
    expect(useCheckoutStore.getState().orderNotes).toBe("");
    const payment = usePaymentStore.getState();
    expect(payment.reconciliationPending).toBe(false);
    expect(payment.internalOrderId).toBeNull();
    expect(payment.gatewayOrderId).toBeNull();

    // A brand-new order session: the previous success left nothing that can
    // block or reuse it, and the old receipt was never involved.
    await act(async () => root.unmount());
    root = createRoot(container);
    useCheckoutStore.getState().setTipAmount(10);
    useCheckoutStore.getState().setOrderNotes("Second order notes");
    fixture.createPaymentOrder.mockResolvedValueOnce({
      success: true,
      data: {
        orderId: "order_rzp_second",
        amount: 510,
        currency: "INR",
        receipt: "rcpt_second",
        keyId: "rzp_test_key",
      },
    });

    await mount();
    expect(payButton().disabled).toBe(false);
    await act(async () => payButton().click());
    await act(async () => {});

    expect(fixture.createPaymentOrder).toHaveBeenCalledTimes(2);
    expect(fixture.cart.clear).toHaveBeenCalledTimes(2);
    expect(useCheckoutStore.getState().tipAmount).toBe(0);
    expect(useCheckoutStore.getState().orderNotes).toBe("");
  });
});
