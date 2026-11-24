/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const fixture = vi.hoisted(() => {
  const lines = [
    {
      lineId: "l1",
      productId: "burger_1",
      name: "Test Burger",
      quantity: 1,
      unitPrice: 249,
      notes: undefined as string | undefined,
    },
  ];
  const cartState = { lines, promo: null, priceLockExpiresAt: null };
  return {
    lines,
    cartState,
    cart: {
      calculateTotals: vi.fn(),
      validateCart: vi.fn(),
      prepareCheckout: vi.fn(async () => ({
        success: true,
        data: { checkoutToken: "checkout_token_ui" },
      })),
      clear: vi.fn(async () => ({ success: true })),
    },
    createOrder: vi.fn(),
    postCash: vi.fn(),
    finalizePaidOrder: vi.fn(),
    createPaymentOrder: vi.fn(),
    gatewayCreate: vi.fn(),
    paymentRepository: {} as any,
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
    useAddressStore: Object.assign(
      (select: (s: unknown) => unknown) =>
        select({ items: [address], selectedId: address.id, select: vi.fn() }),
      { getState: () => ({ items: [address], selectedId: address.id }) },
    ),
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
vi.mock("@/features/cart/repositories/CartRepository", () => ({ cartRepository: fixture.cart }));
vi.mock("@/features/cart/state/cartStore", () => ({
  useCartStore: { getState: () => fixture.cartState },
}));
vi.mock("@/core/network/httpClient", () => ({ httpClient: { post: fixture.postCash } }));
vi.mock("@/features/auth/utils/scopedPersistence", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/auth/utils/scopedPersistence")>()),
  currentScopedUid: () => "cust_fulfill",
}));
vi.mock("@/features/orders/services/ordersService", () => ({
  ordersService: {
    getOrder: async (id: string) => ({
      success: true,
      data: {
        id,
        status: { code: "PLACED", kind: "upcoming", terminal: false },
        ...(id === "ord_zero_due" ? { cashDuePaise: 0 } : {}),
      },
    }),
  },
}));
vi.mock("@/features/orders", async () => {
  const { OrderRepository } = await import("@/features/orders/repositories/OrderRepository");
  return {
    orderRepository: Object.assign(new OrderRepository(), {
      createOnlineDraft: fixture.createOrder,
      finalizePaidOrder: fixture.finalizePaidOrder,
      markPaymentFailed: vi.fn(async () => ({ success: true })),
    }),
  };
});
vi.mock("@/features/payments", async () => {
  const { usePaymentStore } = await vi.importActual<
    typeof import("@/features/payments/state/paymentStore")
  >("@/features/payments/state/paymentStore");
  const paymentRepository = {
    createPaymentOrder: fixture.createPaymentOrder,
    verifyPayment: fixture.verifyPayment,
    validateForPayment: vi.fn(async () => ({ success: true, data: { valid: true, issues: [] } })),
    cancelPayment: vi.fn(async () => ({ success: true })),
  };
  fixture.paymentRepository = paymentRepository;
  return {
    usePaymentStore,
    paymentRepository,
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
import type { CheckoutFeesState } from "@/features/checkout/state/checkoutFeesTypes";
vi.mock("@/features/checkout/services/checkoutQuote", () => ({
  quoteCheckoutFees: vi.fn(async () => ({ status: "ready" })),
}));
import { useCheckoutStore } from "@/features/checkout";
import { usePaymentStore } from "@/features/payments/state/paymentStore";
import { PaymentRepository } from "@/features/payments/repositories/PaymentRepository";
import { OrderRepository } from "@/features/orders/repositories/OrderRepository";
import { readPendingOnlineDraft } from "@/features/payments/services/pendingOnlineDraft";
import { PENDING_CASH_ORDER_BASE_KEY } from "@/features/payments/services/pendingCashOrder";
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

// Optional hermetic bridge to the Backend handler/KOT tests. Only these
// synthetic request bodies are written; never export headers or live data.
async function exportCookingNoteRequest(name: string, url: string, body: unknown) {
  const directory = process.env.C9_COOKING_NOTE_FIXTURES;
  if (!directory) return;
  const { writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  await writeFile(join(directory, `${name}.json`), JSON.stringify({ url, body }));
}

let container: HTMLDivElement;
let root: Root;

/**
 * R8/D3: PAY is gated on a quote for the SELECTED fulfillment. The old fixture
 * seeded one ready DELIVERY quote for every case (and the checkoutQuote mock
 * never replaces it), so a takeaway case was "ready" on a courier fare the
 * server never quoted — the exact defect D3 fixes. Build the fixture per mode;
 * the mismatch-negative case below seeds the wrong mode explicitly.
 */
function readyQuoteFor(fulfillment: Fulfillment): CheckoutFeesState {
  const base = {
    status: "ready" as const,
    packagingFee: 0,
    deliveryFee: 0,
    provider: fulfillment === "delivery" ? "test" : null,
    expiresAt: fulfillment === "delivery" ? Date.now() + 3_600_000 : null,
  };
  return fulfillment === "delivery"
    ? { ...base, orderType: "delivery", deliveryQuoteId: "q_test" }
    : { ...base, orderType: fulfillment, deliveryQuoteId: null };
}

function seedSelection(fulfillment: Fulfillment | null, activeStore: Store | null) {
  useStoreSelection.setState({
    activeStore,
    fulfillment,
    fulfillmentStatus: fulfillment ? "selected" : "none",
    isHydrated: true,
  });
  // Keep the seeded quote in step with the mode under test.
  if (fulfillment) useCheckoutStore.setState({ checkoutFees: readyQuoteFor(fulfillment) });
}

beforeEach(() => {
  vi.clearAllMocks();
  fixture.lines[0].notes = undefined;
  fixture.cart.calculateTotals.mockReset();
  fixture.cart.validateCart.mockReset();
  fixture.createOrder.mockReset();
  fixture.postCash.mockReset();
  fixture.postCash.mockImplementation(
    async (url: string, request: { orderId: string; attemptId?: string }) => ({
      data: url.endsWith("/orders/createOnlineDraft")
        ? {
            orderId: request.orderId,
            attemptId: request.attemptId,
            replayed: false,
            amountPaise: 50000,
            totals: {},
            status: { code: "PLACED", label: "Placed", kind: "upcoming", terminal: false },
          }
        : {
            orderId: request.orderId,
            paymentMethod: "cod",
            paymentChannel: "cash",
            cashDuePaise: 50000,
            totals: {},
            status: { code: "PLACED", label: "Placed", kind: "upcoming", terminal: false },
          },
    }),
  );
  localStorage.clear();
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: { request: async (_key: string, callback: () => unknown) => callback() },
  });
  fixture.finalizePaidOrder.mockReset();
  fixture.createPaymentOrder.mockReset();
  fixture.paymentRepository.createPaymentOrder = fixture.createPaymentOrder;
  fixture.gatewayCreate.mockReset().mockResolvedValue({
    success: true,
    data: {
      id: "rzp_ui_order",
      orderId: "rzp_ui_order",
      amount: 109,
      currency: "INR",
      receipt: "rcpt_ui",
      keyId: "rzp_test_ui",
    },
  });
  fixture.verifyPayment.mockReset();
  fixture.openCheckout.mockReset();
  fixture.initializeRazorpay.mockReset();
  fixture.cart.clear.mockClear();
  fixture.cart.calculateTotals.mockResolvedValue(totals(500, 500));
  fixture.cart.validateCart.mockResolvedValue({ success: true, data: { valid: true, issues: [] } });
  fixture.createOrder.mockResolvedValue({ success: true, data: { id: "ord_fulfill" } });
  usePaymentStore.getState().reset();
  useCheckoutStore.getState().reset();
  // R8: these cases test order/cleanup behaviour, not the quote state machine;
  // seed a live ready quote so PAY is gated on the flow under test. No mode is
  // selected yet, so the delivery quote below is replaced as soon as a case
  // picks a mode (see seedSelection).
  useCheckoutStore.setState({ checkoutFees: readyQuoteFor("delivery") });
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
    return (
      /fulfillment/i.test(text) ||
      /^pay\b/i.test(text.trim()) ||
      text.includes("PAYMENT UNDER REVIEW")
    );
  });
  expect(button).toBeDefined();
  return button as HTMLButtonElement;
}

describe("checkout — null fulfillment is an honest, blocking state", () => {
  it("shows the unselected chooser and disables PAY before any preflight can run", async () => {
    await mount();

    expect(container.textContent).toContain("Choose how you'd like your order");
    expect(container.textContent).not.toContain("1. Delivery Details");
    expect(payButton().disabled).toBe(true);
    expect(payButton().getAttribute("aria-disabled")).toBe("true");
    expect(payButton().textContent).toContain("Choose fulfillment");
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

  it("refuses a persisted unsupported mode instead of silently choosing the supported one", async () => {
    seedSelection("delivery", {
      ...store,
      supports: { delivery: false, takeaway: true, dineIn: false },
    });
    await mount();

    expect(container.querySelector('input[value="delivery"]')).toBeNull();
    expect(container.querySelector('input[value="dinein"]')).toBeNull();
    expect(container.textContent).toContain("This outlet is not offering");
    expect(payButton().disabled).toBe(true);
    await act(async () => payButton().click());
    expect(fixture.createOrder).not.toHaveBeenCalled();
    expect(fixture.createPaymentOrder).not.toHaveBeenCalled();
  });

  it("unblocks PAY when the menu/store flow supplies an explicit supported choice", async () => {
    await mount();
    expect(payButton().disabled).toBe(true);

    await act(async () => useStoreSelection.getState().setFulfillment("takeaway"));
    // Fixture only: the quote must belong to the mode just selected (D3). The
    // real hook re-quotes on the mode change; this suite mocks it out.
    await act(async () => useCheckoutStore.setState({ checkoutFees: readyQuoteFor("takeaway") }));
    await act(async () => {});

    // Real store selection now holds the explicit choice; no default was guessed.
    expect(useStoreSelection.getState().fulfillment).toBe("takeaway");
    expect(container.textContent).toContain("1. Pickup Location");
    expect(payButton().disabled).toBe(false);
  });

  it("keeps PAY blocked while the ready quote belongs to another mode", async () => {
    // The mismatch-negative the old fixture hid: a delivery quote is still in
    // the store while takeaway is selected, and it must NOT unlock payment.
    seedSelection("takeaway", store);
    useCheckoutStore.setState({ checkoutFees: readyQuoteFor("delivery") });
    await mount();

    expect(payButton().disabled).toBe(true);
    await act(async () => payButton().click());
    await act(async () => {});

    expect(fixture.createOrder).not.toHaveBeenCalled();
    expect(fixture.createPaymentOrder).not.toHaveBeenCalled();
    expect(fixture.cart.validateCart).not.toHaveBeenCalled();
  });
});

describe("checkout — normal modes keep their order behaviour", () => {
  /**
   * Cycle 10 (2026-11-24): the deployed bundle's shared HttpClient merged its
   * lowercase `content-type` default with the checkout services' capital
   * `Content-Type`, and Fetch joined them into `application/json,
   * application/json`. This drives the REAL screen and the REAL HttpClient —
   * no mocked `httpClient.post` — and asserts the request that leaves the app
   * carries exactly one JSON media type. It also writes the wire capture the
   * backend route suite consumes when CHECKOUT_WIRE_FIXTURES is set.
   */
  it.each(["cash", "online", "zero"] as const)(
    "serializes %s checkout through HttpClient with one JSON media type",
    async (lane) => {
      const { HttpClient } = await vi.importActual<typeof import("@/core/network/httpClient")>(
        "@/core/network/httpClient",
      );
      const client = new HttpClient();
      fixture.postCash.mockImplementation(client.post.bind(client));
      const requests: Request[] = [];
      const fetch = vi.fn(async (url: string, init: RequestInit) => {
        const req = new Request(url, init);
        requests.push(req);
        const body = await req.clone().json();
        return Response.json({
          orderId: lane === "zero" ? "ord_zero_due" : body.orderId,
          attemptId: body.attemptId,
          paymentChannel: "cash",
          paymentMethod: "cod",
          amountPaise: 10900,
          cashDuePaise: lane === "zero" ? 0 : 10900,
          totals: {},
          status: { code: "PLACED", label: "Placed", kind: "upcoming", terminal: false },
        });
      });
      vi.stubGlobal("fetch", fetch);
      try {
        usePaymentStore.getState().setMethod(lane === "cash" ? "cash" : "upi");
        fixture.cart.calculateTotals.mockResolvedValue(totals(109, lane === "zero" ? 0 : 109));
        if (lane === "zero") fixture.cartState.promo = { code: "FREE" } as never;
        if (lane === "online") {
          const payments = new PaymentRepository({ createOrder: fixture.gatewayCreate } as never);
          fixture.paymentRepository.createPaymentOrder = payments.createPaymentOrder.bind(payments);
        }
        seedSelection("takeaway", store);
        await mount();
        await act(async () => payButton().click());
        expect(requests).toHaveLength(1);

        const [request] = requests;
        const route = lane === "online" ? "createOnlineDraft" : "createCashOrder";
        expect(new URL(request.url).pathname.endsWith(`/orders/${route}`)).toBe(true);

        const body = await request.text();
        const contentType = request.headers.get("content-type");
        // A joined value ("a, b") is the deployed defect: express.json() then
        // skips the body and the route answers a field-level 400.
        expect(contentType).toBe("application/json");

        const dir = process.env.CHECKOUT_WIRE_FIXTURES;
        if (dir) {
          const { writeFile } = await import("node:fs/promises");
          const { join } = await import("node:path");
          await writeFile(join(dir, `${lane}.json`), JSON.stringify({ contentType, body }));
        }

        expect(JSON.parse(body)).toMatchObject({
          orderType: "takeaway",
          items: [{ productId: "burger_1", quantity: 1 }],
          ...(lane === "zero" ? { zeroDueOnly: true, expectedTotalPaise: 0 } : {}),
        });
      } finally {
        fixture.cartState.promo = null;
        vi.unstubAllGlobals();
      }
    },
  );

  it("still places a takeaway cash order after an explicit selection", async () => {
    usePaymentStore.getState().setMethod("cash");
    fixture.cart.calculateTotals.mockResolvedValue(totals(109, 109));
    seedSelection("takeaway", store);
    await mount();

    expect(container.textContent).toContain("1. Pickup Location");
    expect(payButton().disabled).toBe(false);
    await act(async () => payButton().click());
    await act(async () => {});

    expect(fixture.cart.validateCart).toHaveBeenCalledTimes(1);
    expect(fixture.postCash).toHaveBeenCalledTimes(1);
    const [url, body] = fixture.postCash.mock.calls[0];
    expect(url).toMatch(/\/orders\/createCashOrder$/);
    expect(body).toEqual({
      orderId: expect.stringMatching(/^ord_/),
      attemptId: expect.any(String),
      orderType: "takeaway",
      storeId: store.id,
      items: [{ productId: "burger_1", quantity: 1 }],
      expectedTotalPaise: 10900,
    });
    expect(fixture.createOrder).not.toHaveBeenCalled();
    expect(fixture.createPaymentOrder).not.toHaveBeenCalled();
    expect(fixture.navigate).toHaveBeenCalledWith({
      to: "/orders/$orderId/track",
      params: { orderId: (body as { orderId: string }).orderId },
      replace: true,
    });
  });

  it("reuses the cash attempt and original notes only after explicit price confirmation", async () => {
    usePaymentStore.getState().setMethod("cash");
    useCheckoutStore.getState().setOrderNotes("No onions");
    useCheckoutStore.getState().setPickupInstructions("Counter B");
    seedSelection("takeaway", store);
    fixture.postCash.mockRejectedValueOnce({
      response: {
        status: 409,
        data: { code: "PRICE_CHANGED", totals: { split: { totalAmountPaise: 51000 } } },
      },
    });
    await mount();
    await act(async () => payButton().click());

    expect(fixture.postCash).toHaveBeenCalledTimes(1);
    const first = fixture.postCash.mock.calls[0][1];
    expect(first).toMatchObject({
      expectedTotalPaise: 50000,
      notes: "No onions",
      fulfillmentInstructions: "Counter B",
    });
    const pendingKey = Object.keys(localStorage).find((k) => k.includes("pendingCashOrder"));
    expect(pendingKey).toBeDefined();
    expect(localStorage.getItem(pendingKey!)).not.toMatch(/No onions|Counter B/);
    expect(fixture.cart.clear).not.toHaveBeenCalled();
    const dialog = document.querySelector('[role="alertdialog"], [role="dialog"]');
    expect(dialog?.textContent).toContain("510");
    const proceed = Array.from(dialog?.querySelectorAll("button") ?? []).find(
      (button) => button.textContent === "Continue",
    );
    expect(proceed).toBeDefined();
    await act(async () => proceed?.click());

    expect(fixture.postCash).toHaveBeenCalledTimes(2);
    expect(fixture.postCash.mock.calls[1][1]).toEqual({ ...first, expectedTotalPaise: 51000 });
    expect(fixture.cart.clear).toHaveBeenCalledTimes(1);
  });

  it("sends the real online UI checkout through the server draft and payment handler", async () => {
    usePaymentStore.getState().setMethod("upi");
    fixture.cart.calculateTotals.mockResolvedValue(totals(109, 109));
    fixture.postCash.mockImplementation(
      async (url: string, request: { orderId: string; attemptId?: string }) => ({
        data: {
          orderId: request.orderId,
          attemptId: request.attemptId,
          replayed: false,
          amountPaise: 10900,
          totals: {},
          status: { code: "PLACED", label: "Placed", kind: "upcoming", terminal: false },
        },
      }),
    );
    const realPayments = new PaymentRepository({ createOrder: fixture.gatewayCreate } as never);
    fixture.paymentRepository.createPaymentOrder =
      realPayments.createPaymentOrder.bind(realPayments);
    seedSelection("takeaway", store);
    await mount();
    await act(async () => payButton().click());

    expect(fixture.postCash).toHaveBeenCalledTimes(1);
    const [url, body] = fixture.postCash.mock.calls[0];
    expect(url).toMatch(/\/orders\/createOnlineDraft$/);
    expect(body).toMatchObject({
      orderType: "takeaway",
      storeId: store.id,
      items: [{ productId: "burger_1", quantity: 1 }],
    });
    expect(body).not.toHaveProperty("total");
    expect(body).not.toHaveProperty("pricing");
    expect(body).not.toHaveProperty("payment");
    expect(fixture.gatewayCreate).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: body.orderId, amount: 109 }),
    );
    expect(fixture.createPaymentOrder).not.toHaveBeenCalled();
    expect(fixture.openCheckout).toHaveBeenCalledTimes(1);
  });

  it("routes a zero-due online bill through the server zero-due cash path", async () => {
    usePaymentStore.getState().setMethod("upi");
    fixture.cart.calculateTotals.mockResolvedValue(totals(0, 0));
    fixture.postCash.mockResolvedValue({
      data: {
        orderId: "ord_zero_due",
        paymentMethod: "cod",
        paymentChannel: "cash",
        cashDuePaise: 0,
        totals: {},
        status: { code: "PLACED", label: "Placed", kind: "upcoming", terminal: false },
      },
    });
    seedSelection("takeaway", store);
    await mount();
    await act(async () => payButton().click());

    expect(fixture.postCash).toHaveBeenCalledTimes(1);
    expect(fixture.postCash.mock.calls[0][0]).toMatch(/\/orders\/createCashOrder$/);
    expect(fixture.postCash.mock.calls[0][1]).toMatchObject({
      orderType: "takeaway",
      expectedTotalPaise: 0,
      zeroDueOnly: true,
    });
    expect(fixture.gatewayCreate).not.toHaveBeenCalled();
    expect(fixture.createPaymentOrder).not.toHaveBeenCalled();
    expect(fixture.toast.error).not.toHaveBeenCalled();
    expect(fixture.navigate).toHaveBeenCalledWith({
      to: "/orders/$orderId/track",
      params: { orderId: "ord_zero_due" },
      replace: true,
    });
  });

  it("clears a rejected coupon only after the server fences that attempt; the corrected coupon gets a fresh draft", async () => {
    seedSelection("takeaway", store);
    const repo = new OrderRepository();
    fixture.postCash.mockRejectedValueOnce({
      response: { status: 400, data: { code: "COUPON_INACTIVE" } },
    });
    fixture.postCash.mockImplementationOnce(async (_url, body) => ({
      data: { retired: true, orderId: body.orderId, attemptId: body.attemptId },
    }));
    expect(await repo.createOnlineDraft()).toMatchObject({
      success: false,
      error: { code: "COUPON_INACTIVE" },
    });
    const first = fixture.postCash.mock.calls[0][1];
    expect(fixture.postCash.mock.calls[1]?.[1]).toMatchObject({
      operation: "retire",
      attemptId: first.attemptId,
    });
    expect(readPendingOnlineDraft()).toBeNull();
    const previous = fixture.cartState.promo;
    fixture.cartState.promo = { code: "CORRECTED" } as never;
    try {
      expect(await repo.createOnlineDraft()).toMatchObject({ success: true });
      expect(fixture.postCash.mock.calls[2][1]).toMatchObject({ couponCode: "CORRECTED" });
      expect(fixture.postCash.mock.calls[2][1].orderId).not.toBe(first.orderId);
    } finally {
      fixture.cartState.promo = previous;
    }
  });

  it("sends cooking notes after an online POST fails before writing and a new repository retries", async () => {
    seedSelection("takeaway", store);
    fixture.lines[0].notes = "Toast both sides";
    // Simulate transport failing before it reaches the handler. The claim
    // exists, but this retry is the first request that can create the draft.
    fixture.postCash.mockRejectedValueOnce(new Error("disconnected before send"));
    const first = await new OrderRepository().createOnlineDraft();
    expect(first.success).toBe(false);
    expect(fixture.postCash.mock.calls[0][1].items[0]).toMatchObject({ notes: "Toast both sides" });
    expect(JSON.stringify(readPendingOnlineDraft())).not.toContain("Toast both sides");
    const second = await new OrderRepository().createOnlineDraft();
    expect(second.success).toBe(true);
    const [url, body] = fixture.postCash.mock.calls[1];
    expect(body).toMatchObject({
      orderId: fixture.postCash.mock.calls[0][1].orderId,
      attemptId: fixture.postCash.mock.calls[0][1].attemptId,
    });
    await exportCookingNoteRequest("online-retry", url, body);
    expect(body.items[0]).toMatchObject({ notes: "Toast both sides" });
    expect(JSON.stringify(readPendingOnlineDraft())).not.toContain("Toast both sides");
  });

  it.each([false, true])(
    "sends cooking notes on the cash transport (zeroDueOnly: %s) without saving them in the attempt",
    async (zeroDueOnly) => {
      seedSelection("takeaway", store);
      fixture.lines[0].notes = "Toast both sides";
      fixture.cart.calculateTotals.mockResolvedValue(totals(109, zeroDueOnly ? 0 : 109));
      if (zeroDueOnly) fixture.cartState.promo = { code: "FREE" } as never;
      // Keep the pending record available for assertions by losing the reply.
      fixture.postCash.mockRejectedValueOnce(new Error("unknown cash outcome"));
      try {
        const result = await new OrderRepository().createCashOrder(
          zeroDueOnly ? { zeroDueOnly: true } : {},
        );
        expect(result.success).toBe(false);
        const [url, body] = fixture.postCash.mock.calls[0];
        expect(url).toMatch(/\/orders\/createCashOrder$/);
        expect(body.expectedTotalPaise).toBe(zeroDueOnly ? 0 : 10900);
        expect(body.zeroDueOnly).toBe(zeroDueOnly || undefined);
        const keys = Object.keys(localStorage).filter((key) =>
          key.includes(PENDING_CASH_ORDER_BASE_KEY),
        );
        expect(keys).toHaveLength(1);
        const raw = localStorage.getItem(keys[0])!;
        expect(JSON.parse(raw).request.items).toEqual([{ productId: "burger_1", quantity: 1 }]);
        expect(raw).not.toContain("Toast both sides");
        await exportCookingNoteRequest(zeroDueOnly ? "zero-due" : "cash", url, body);
        expect(body.items[0]).toMatchObject({ notes: "Toast both sides" });
      } finally {
        fixture.cartState.promo = null;
      }
    },
  );

  it("still places a delivery cash order with a selected address", async () => {
    usePaymentStore.getState().setMethod("cash");
    seedSelection("delivery", store);
    await mount();

    expect(container.textContent).toContain("1. Delivery Details");
    expect(payButton().disabled).toBe(false);
    await act(async () => payButton().click());
    await act(async () => {});

    expect(fixture.postCash).toHaveBeenCalledWith(
      expect.stringMatching(/\/orders\/createCashOrder$/),
      expect.objectContaining({
        orderType: "delivery",
        addressId: "addr_fulfill",
        deliveryQuoteId: "q_test",
      }),
      expect.anything(),
    );
    expect(fixture.createOrder).not.toHaveBeenCalled();
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
