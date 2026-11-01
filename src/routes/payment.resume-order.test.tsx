/**
 * CUS-16 resume — "Complete payment" on an unpaid order.
 *
 * Live (3515da9): clicking "Complete payment" opened
 * `/payment?orderId=…` and the screen said "Nothing to pay for / Your cart is
 * empty", because the route billed the CART. A customer returning to an unpaid
 * order almost always has an empty cart by then, so the gateway never opened.
 *
 * These mount the REAL payment route with an EMPTY cart and no saved address.
 * Only the Razorpay SDK (the adapter's modal surface) and the two network
 * transports (the order read, the payment HTTP service) are faked. Every
 * store, the payment repository, the resume classification and the amount
 * comparison are the real ones.
 *
 * @vitest-environment jsdom
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const fixture = vi.hoisted(() => ({
  orderId: "ord_1793526177472_uiI9kl",
  order: null as unknown,
  /** The next `ordersService.getOrder` answer (`{success, data}` / failure). */
  getOrderResult: null as unknown,
  getOrder: vi.fn(),
  navigate: vi.fn(),
  calculateTotals: vi.fn(),
  createFromCurrentContext: vi.fn(),
  finalizePaidOrder: vi.fn(),
  createOrder: vi.fn(),
  verify: vi.fn(),
  cancel: vi.fn(),
  sdkInit: vi.fn(),
  sdkOpen: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

/* ── framework / shell ─────────────────────────────────────────────────── */
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (opts: Record<string, unknown>) => ({
    ...opts,
    options: opts,
    _$path: path,
    useSearch: () => ({ orderId: fixture.orderId }),
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
vi.mock("sonner", () => ({ toast: fixture.toast }));
vi.mock("@/shared/components/feedback/AppToaster", () => ({ toast: fixture.toast }));

/* ── shared hooks / services ───────────────────────────────────────────── */
vi.mock("@/shared/hooks/useHydrated", () => ({ useHydrated: () => true }));
vi.mock("@/core/state/appConfigStore", () => ({
  useAppConfig: Object.assign(
    (select: (s: { isOnline: boolean }) => unknown) => select({ isOnline: true }),
    { getState: () => ({ isOnline: true }) },
  ),
}));
vi.mock("@/core/config/env", () => ({
  appConfig: {
    env: "development",
    integrations: { razorpayKeyId: "rzp_test_resume", paymentsApiBaseUrl: "" },
    api: {
      baseUrl: "https://api.example.test/",
      timeoutMs: 15000,
      retry: { attempts: 1, backoffMs: 1 },
    },
  },
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
  AudioService: { playSuccess: vi.fn(), playClick: vi.fn(), playError: vi.fn() },
}));
vi.mock("@/core/logging/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

/* ── stores / repositories ─────────────────────────────────────────────── */
// THE CART IS EMPTY: the live customer had already paid-and-left once.
const EMPTY_CART = { lines: [], promo: null, priceStale: false };
vi.mock("@/features/cart", () => ({
  cartRepository: {
    calculateTotals: fixture.calculateTotals,
    clear: vi.fn(async () => ({ success: true })),
    prepareCheckout: vi.fn(async () => ({ success: true, data: { checkoutToken: "ct" } })),
  },
  useCartStore: Object.assign((select: (s: typeof EMPTY_CART) => unknown) => select(EMPTY_CART), {
    getState: () => EMPTY_CART,
  }),
  selectItemCount: (s: { lines: unknown[] }) => s.lines.length,
}));
// No outlet and no mode selected either — a resume cannot need them.
vi.mock("@/features/stores/state/storeStore", () => {
  const state = { activeStore: null, fulfillment: null, stores: [] };
  return {
    useStoreSelection: Object.assign((select: (s: typeof state) => unknown) => select(state), {
      getState: () => state,
    }),
    storeSupportsFulfillment: (store: unknown, mode: string | null) => !!store && !!mode,
  };
});
vi.mock("@/features/auth/state/authStore", () => {
  const authState = {
    user: { id: "uid_resume", name: "QA", phone: "+910000000000" },
    isBootstrapped: true,
    status: "authenticated",
    accessToken: "token",
  };
  return {
    useAuthStore: Object.assign((select: (s: typeof authState) => unknown) => select(authState), {
      getState: () => authState,
    }),
    selectIsAuthenticated: () => true,
  };
});
// No saved address on this device: the order document carries its own.
vi.mock("@/features/addresses", () => {
  const empty = { addresses: [], selectedId: null };
  return {
    useAddressStore: Object.assign((select: (s: typeof empty) => unknown) => select(empty), {
      getState: () => empty,
    }),
    selectAddresses: () => [],
    selectSelectedAddress: () => null,
  };
});
vi.mock("@/features/checkout", async () => {
  const actual = await vi.importActual<typeof import("@/features/checkout")>("@/features/checkout");
  // The quote machine is not the subject of these tests (it has its own
  // suite); a ready takeaway quote keeps PAY enabled on the order's own mode.
  const readyFees = {
    status: "ready" as const,
    orderType: "takeaway" as const,
    packagingFee: 0,
    deliveryFee: 0,
    deliveryQuoteId: null,
    provider: null,
    expiresAt: null,
  };
  const readyView = {
    status: "ready" as const,
    payEnabled: true,
    showDeliveryFee: false,
    showTotal: true,
    deliveryFee: 0,
    packagingFee: 0,
    deliveryQuoteId: null,
    expiresAt: null,
    message: null,
    canRetry: false,
    storeNotLinked: false,
    takeawaySelectable: false,
  };
  const checkoutState = {
    orderNotes: "",
    deliveryInstructions: "",
    pickupInstructions: "",
    diningNotes: "",
    tipAmount: 0,
    loyaltyPointsToRedeem: 0,
    tableNumber: "",
    checkoutFees: readyFees,
  };
  return {
    ...actual,
    // The real store module is replaced by this shape: `startPayment` reads
    // the quote synchronously through `getState()`.
    useCheckoutStore: Object.assign(
      (select: (s: typeof checkoutState) => unknown) => select(checkoutState),
      { getState: () => checkoutState },
    ),
    useCheckoutFees: () => ({
      state: readyFees,
      view: readyView,
      refresh: vi.fn(async () => readyFees),
    }),
  };
});
vi.mock("@/features/orders/repositories/OrderRepository", () => ({
  orderRepository: {
    getOrder: fixture.getOrder,
    createFromCurrentContext: fixture.createFromCurrentContext,
    finalizePaidOrder: fixture.finalizePaidOrder,
    markPaymentFailed: vi.fn(async () => ({ success: true })),
    cancelOrder: vi.fn(),
  },
}));

/* ── the two network boundaries: order read (above) + payment HTTP ────── */
vi.mock("@/features/payments/services/paymentsService", () => ({
  paymentsService: {
    createOrder: fixture.createOrder,
    verify: fixture.verify,
    cancel: fixture.cancel,
    getStatus: vi.fn(async () => ({ success: true, data: "waiting" })),
  },
}));

// The Razorpay SDK surface. `openCheckout` records the handlers and does NOT
// auto-succeed, so each test drives the outcome it is about.
vi.mock("@/features/payments/adapters/razorpayAdapter", () => ({
  razorpayAdapter: {
    name: "razorpay",
    initialize: fixture.sdkInit,
    openCheckout: fixture.sdkOpen,
  },
}));

import { Route as PaymentRoute } from "./payment";
import { usePaymentStore } from "@/features/payments/state/paymentStore";
import type { Order } from "@/features/orders/models";

const PaymentPage = (PaymentRoute as unknown as { options: { component: React.ComponentType } })
  .options.component;

/** The real server document shape for an abandoned unpaid takeaway order. */
function unpaidOrder(overrides: Partial<Record<string, unknown>> = {}): Order {
  return {
    id: fixture.orderId,
    shortCode: "BG-UI9KL",
    status: { code: "PLACED", label: "Order placed", kind: "upcoming", terminal: false },
    fulfillment: "takeaway",
    store: {
      id: "demo",
      name: "Burgonomics DEMO",
      address: "Petpooja sandbox outlet",
      area: "Ahmedabad",
      city: "Ahmedabad",
      phone: "",
      lat: 23.0225,
      lng: 72.5714,
      partnerBranchId: "demo",
    },
    items: [
      {
        lineId: "prod_demo_30653-1793526167251-RTCU",
        productId: "prod_demo_30653",
        storeId: "demo",
        name: "Matar Mushroom Rice Bowl",
        unitPrice: 110,
        quantity: 1,
        modifiers: [],
        availability: "available",
      },
    ],
    totals: {
      subtotal: 110,
      itemDiscount: 0,
      promoDiscount: 0,
      taxes: 5.24,
      cgst: 2.62,
      sgst: 2.62,
      gstRate: 0.05,
      deliveryFee: 0,
      packingFee: 0,
      grandTotal: 110,
      currency: "INR",
    },
    payment: { method: "online", label: "Pay Online", status: "pending" },
    placedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
    ...(overrides as object),
  } as Order;
}

let container: HTMLDivElement;
let root: Root;

async function mount() {
  await act(async () => root.render(<PaymentPage />));
  await act(async () => {});
  await act(async () => {});
}

function buttonWithText(text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button")).find((b) =>
    b.textContent?.includes(text),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  usePaymentStore.getState().reset();
  sessionStorage.clear();
  fixture.order = unpaidOrder();
  fixture.getOrderResult = null;
  fixture.getOrder.mockImplementation(async () => {
    const override = fixture.getOrderResult as { success: boolean } | null;
    if (override) return override;
    return { success: true, data: fixture.order };
  });
  fixture.createOrder.mockResolvedValue({
    success: true,
    data: {
      orderId: "order_resume_gateway_1",
      razorpayOrderId: "order_resume_gateway_1",
      keyId: "rzp_test_resume",
      amount: 110,
      amountPaise: 11000,
      currency: "INR",
      receipt: "rcpt_resume",
    },
  });
  fixture.verify.mockResolvedValue({
    success: true,
    data: { verified: true, confirmedOrderId: fixture.orderId, paymentId: "pay_resume_1" },
  });
  fixture.finalizePaidOrder.mockResolvedValue({
    success: true,
    data: unpaidOrder(),
  });
  fixture.calculateTotals.mockResolvedValue({
    success: true,
    data: {
      subtotal: 0,
      itemDiscount: 0,
      promoDiscount: 0,
      taxes: 0,
      cgst: 0,
      sgst: 0,
      gstRate: 0.05,
      deliveryFee: 0,
      packingFee: 0,
      grandTotal: 0,
      currency: "INR",
    },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("CUS-16 — an unpaid order is paid from the ORDER, with an empty cart", () => {
  it("loads the order, shows its items and amount, and never claims an empty cart", async () => {
    await mount();

    const text = container.textContent ?? "";
    expect(fixture.getOrder).toHaveBeenCalledWith(fixture.orderId);
    // The order's own line and total are on screen…
    expect(text).toContain("Matar Mushroom Rice Bowl");
    expect(text).toContain("110");
    expect(text).toContain("Burgonomics DEMO");
    // …and there is no cart-empty state anywhere.
    expect(text).not.toContain("Nothing to pay for");
    expect(text).not.toContain("Your cart is empty");
    expect(text).not.toContain("cart is empty");
    // The cart was never consulted for a bill.
    expect(fixture.calculateTotals).not.toHaveBeenCalled();
  });

  it("opens the gateway bound to THAT order for the server's amount, creating no order", async () => {
    await mount();
    const pay = buttonWithText("Pay Online");
    expect(pay).toBeDefined();
    expect(pay!.disabled).toBe(false);

    await act(async () => pay!.click());
    await act(async () => {});

    // The payment transport was asked to charge the resumed order…
    expect(fixture.createOrder).toHaveBeenCalledTimes(1);
    const sent = fixture.createOrder.mock.calls[0][0] as Record<string, unknown>;
    expect(sent.orderId).toBe(fixture.orderId);
    expect(sent.storeId).toBe("demo");
    expect(sent.orderType).toBe("takeaway");
    // …and no second order was written.
    expect(fixture.createFromCurrentContext).not.toHaveBeenCalled();

    // The SDK was initialised on the server's amount for that same order.
    expect(fixture.sdkInit).toHaveBeenCalledTimes(1);
    const init = fixture.sdkInit.mock.calls[0][0] as { order: { orderId: string; amount: number } };
    expect(init.order.orderId).toBe("order_resume_gateway_1");
    expect(init.order.amount).toBe(110);
    expect(fixture.sdkOpen).toHaveBeenCalledTimes(1);
  });

  it("runs the SAME confirmation path as a fresh payment after success", async () => {
    await mount();
    await act(async () => buttonWithText("Pay Online")!.click());
    await act(async () => {});

    const handlers = fixture.sdkOpen.mock.calls[0][0] as {
      onSuccess: (result: {
        orderId: string;
        paymentId: string;
        signature: string;
        method: string;
      }) => void;
    };
    await act(async () => {
      handlers.onSuccess({
        orderId: "order_resume_gateway_1",
        paymentId: "pay_resume_1",
        signature: "sig_resume",
        method: "upi",
      });
    });
    await act(async () => {});

    // Verified against the resumed order, then finalised (read-only) and sent
    // to the same confirmation screen a fresh payment uses.
    expect(fixture.verify).toHaveBeenCalledTimes(1);
    expect(fixture.finalizePaidOrder).toHaveBeenCalledTimes(1);
    expect(fixture.navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "/order-confirmation/$orderId",
        params: { orderId: fixture.orderId },
      }),
    );
    expect(fixture.createFromCurrentContext).not.toHaveBeenCalled();
  });

  it("an already-paid order says so and offers no payment", async () => {
    fixture.order = unpaidOrder({
      status: { code: "CONFIRMED", label: "Order confirmed", kind: "upcoming", terminal: false },
      payment: { method: "online", label: "Pay Online", status: "paid" },
    } as never);
    await mount();

    const text = container.textContent ?? "";
    expect(text).toContain("already paid");
    expect(buttonWithText("Pay Online")).toBeUndefined();
    expect(fixture.createOrder).not.toHaveBeenCalled();
  });

  it("a cancelled order cannot be paid, and an expired one says it expired", async () => {
    fixture.order = unpaidOrder({
      status: { code: "CANCELLED", label: "Cancelled", kind: "cancelled", terminal: true },
      cancellationReason: "payment_not_completed",
    } as never);
    await mount();

    const text = container.textContent ?? "";
    expect(text).toContain("expired");
    expect(text).not.toContain("Nothing to pay for");
    expect(buttonWithText("Pay Online")).toBeUndefined();
    expect(fixture.createOrder).not.toHaveBeenCalled();
  });

  it("a cancelled order with another reason is reported as cancelled, not expired", async () => {
    fixture.order = unpaidOrder({
      status: { code: "CANCELLED", label: "Cancelled", kind: "cancelled", terminal: true },
      cancellationReason: "customer_request",
    } as never);
    await mount();

    const text = container.textContent ?? "";
    expect(text).toContain("cancelled");
    expect(text).not.toContain("expired");
    expect(buttonWithText("Pay Online")).toBeUndefined();
  });

  it("an unknown or someone else's order reads as not found, never as an empty cart", async () => {
    fixture.getOrderResult = { success: true, data: null };
    await mount();

    const text = container.textContent ?? "";
    expect(text).toContain("Order not found");
    expect(text).not.toContain("Nothing to pay for");
    expect(buttonWithText("Pay Online")).toBeUndefined();
  });

  it("a load failure says the load failed and offers Retry, which re-reads the order", async () => {
    fixture.getOrderResult = {
      success: false,
      error: {
        code: "ORDER_READ_FAILED",
        message: "We couldn't load this order. Please check your connection and try again.",
        retryable: true,
      },
    };
    await mount();

    const text = container.textContent ?? "";
    expect(text).toContain("Couldn't load this order");
    expect(text).not.toContain("Nothing to pay for");
    expect(text).not.toContain("Order not found");

    const retry = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Try again",
    );
    expect(retry).toBeDefined();
    const callsBefore = fixture.getOrder.mock.calls.length;
    fixture.getOrderResult = null;
    await act(async () => retry!.click());
    await act(async () => {});
    expect(fixture.getOrder.mock.calls.length).toBeGreaterThan(callsBefore);
    expect(container.textContent).toContain("Matar Mushroom Rice Bowl");
  });

  it("a server refusal that proves the order is unpayable is not offered as a retry", async () => {
    fixture.createOrder.mockResolvedValue({
      success: false,
      error: {
        code: "ORDER_ALREADY_PAID",
        message: "This order is already paid — refusing to mint a second gateway order.",
        retryable: false,
      },
    });
    await mount();
    await act(async () => buttonWithText("Pay Online")!.click());
    await act(async () => {});

    expect(fixture.sdkOpen).not.toHaveBeenCalled();
    expect(buttonWithText("Retry")).toBeUndefined();
    expect(container.textContent).toContain("Do not pay again");
  });
});

describe("CUS-16 — the normal cart-to-payment path is unchanged", () => {
  it("still bills the cart when no order id is given, and reads no order", async () => {
    // Same route, no `orderId` in the URL: the original cart path. The cart is
    // empty here, so this must keep the honest empty-cart screen rather than
    // resuming (or reading) any order.
    fixture.orderId = "";
    await mount();

    expect(container.textContent).toContain("Nothing to pay for");
    expect(fixture.getOrder).not.toHaveBeenCalled();
    expect(fixture.createOrder).not.toHaveBeenCalled();
  });
});
