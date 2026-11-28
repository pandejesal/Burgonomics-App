/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
const lockState = { held: false, throwNext: false };

const fixture = vi.hoisted(() => {
  const lines = [
    {
      lineId: "l1",
      productId: "burger_1",
      name: "Test Burger",
      quantity: 1,
      unitPrice: 249,
      notes: undefined as string | undefined,
      customizations: undefined as
        | Array<{
            groupId: string;
            groupName: string;
            optionId: string;
            name: string;
            price: number;
          }>
        | undefined,
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
    // The real selector disables its cash radio from this sentence. Surface
    // the sentence here so the route's delivery-only wiring is observable
    // without dragging component internals into a route test.
    PaymentMethodSelector: ({ cashDisabledReason }: { cashDisabledReason?: string | null }) => (
      <div data-testid="cash-availability">{cashDisabledReason ?? "cash available"}</div>
    ),
    ReviewItemsList: () => null,
  };
});
vi.mock("@/features/checkout/components/QuickAuthSheet", () => ({ QuickAuthSheet: () => null }));
let authEpoch = 0;
vi.mock("@/features/auth/state/authStore", () => {
  const authState = {
    user: { id: "cust_fulfill", name: "Test Customer", phone: "+910000000000" },
    isBootstrapped: true,
  };
  return {
    currentIdentityEpoch: () => authEpoch,
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
import type {
  CheckoutFeesReady,
  CheckoutFeesState,
} from "@/features/checkout/state/checkoutFeesTypes";
vi.mock("@/features/checkout/services/checkoutQuote", () => ({
  quoteCheckoutFees: vi.fn(async () => ({ status: "ready" })),
}));
import { useCheckoutStore } from "@/features/checkout";
import {
  cashSubmissionScope,
  captureCompletionScope,
  isCompletionScopeValid,
} from "@/features/checkout/state/checkoutCompletionScope";
import { usePaymentStore } from "@/features/payments/state/paymentStore";
import { PaymentRepository } from "@/features/payments/repositories/PaymentRepository";
import { OrderRepository } from "@/features/orders/repositories/OrderRepository";
import { ordersService } from "@/features/orders/services/ordersService";
import { readPendingOnlineDraft } from "@/features/payments/services/pendingOnlineDraft";
import {
  PENDING_CASH_ORDER_BASE_KEY,
  updatePendingCashOrderAcceptedTotal,
} from "@/features/payments/services/pendingCashOrder";
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
function readyQuoteFor(fulfillment: Fulfillment): CheckoutFeesReady {
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
  fixture.cartState.lines = fixture.lines;
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
  sessionStorage.clear();
  lockState.held = false;
  lockState.throwNext = false;
  authEpoch = 0;
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    // Web Lock API fidelity: both call forms; a returned async callback holds
    // the lock until it settles (ifAvailable yields null while it is held).
    value: {
      request: async (_key: string, optionsOrClaim: any, maybeClaim?: any) => {
        const options = maybeClaim ? optionsOrClaim : undefined;
        const claim = maybeClaim ?? optionsOrClaim;
        if (lockState.throwNext) {
          lockState.throwNext = false;
          throw new Error("lock unavailable");
        }
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

/** Only the cash creator counts — the online draft shares this HTTP double. */
function cashCreationCalls() {
  return fixture.postCash.mock.calls.filter(([url]) =>
    String(url).endsWith("/orders/createCashOrder"),
  );
}

function cashAvailabilityText(): string {
  return container.querySelector('[data-testid="cash-availability"]')?.textContent ?? "";
}

function mockOnlineSuccess() {
  fixture.createPaymentOrder.mockResolvedValue({
    success: true,
    data: {
      orderId: "order_rzp_delivery",
      amount: 500,
      currency: "INR",
      receipt: "rcpt_delivery",
      keyId: "rzp_test_key",
    },
  });
}

/** A stale quote from the retired COD policy: branch flag on, no ceiling. */
function legacyCashQuote(fulfillment: Fulfillment): CheckoutFeesState {
  return {
    ...readyQuoteFor(fulfillment),
    cashOnDelivery: { enabled: true, maxOrderValuePaise: null },
  };
}

/** A ready counter quote capped at ₹500 (50,000 paise). */
function cappedCashQuote(fulfillment: Fulfillment): CheckoutFeesState {
  return {
    ...readyQuoteFor(fulfillment),
    cashOnDelivery: { enabled: true, maxOrderValuePaise: 50_000 },
  };
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

  it("blocks the cash path with a banked legacy tip while no mode is chosen", async () => {
    usePaymentStore.getState().setMethod("cash");
    useCheckoutStore.getState().setTipAmount(40);
    useCheckoutStore.getState().setOrderNotes("Keep the note");

    await mount();

    // Owner decision 2026-11-25 (#1): a legacy banked tip is never SHOWN, but
    // the block this case exists for is unchanged — no mode, no order.
    expect(container.textContent).not.toContain("Delivery Partner Tip");
    expect(payButton().disabled).toBe(true);
    await act(async () => payButton().click());
    await act(async () => {});

    expect(fixture.createOrder).not.toHaveBeenCalled();
    // The persisted checkout selection is untouched by the blocked attempt.
    expect(useCheckoutStore.getState().orderNotes).toBe("Keep the note");
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
    // This case submits 10,900 paise; its receipt must use that amount and the
    // generated order id (the default fixture's 50,000 is for other cases).
    fixture.postCash.mockImplementation(async (_url: string, request: { orderId: string }) => ({
      data: {
        orderId: request.orderId,
        paymentMethod: "cod",
        paymentChannel: "cash",
        cashDuePaise: 10_900,
        totals: {},
        status: { code: "PLACED", label: "Placed", kind: "upcoming", terminal: false },
      },
    }));
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
      // Owner decision 2026-11-25 #3: consent is sent EXPLICITLY (the deployed
      // server defaults a missing key to true), and is false when unticked.
      whatsappOptIn: false,
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
    fixture.postCash
      .mockRejectedValueOnce({
        response: {
          status: 409,
          data: { code: "PRICE_CHANGED", totals: { split: { totalAmountPaise: 51000 } } },
        },
      })
      // The accepted reconfirmation is a fresh 51,000-paise create; the receipt
      // must acknowledge that amount and the ORIGINAL submitted order id.
      .mockImplementationOnce(async (_url: string, request: { orderId: string }) => ({
        data: {
          orderId: request.orderId,
          paymentMethod: "cod",
          paymentChannel: "cash",
          cashDuePaise: 51_000,
          totals: {},
          status: { code: "PLACED", label: "Placed", kind: "upcoming", terminal: false },
        },
      }));
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
    expect(useCheckoutStore.getState().orderNotes).toBe("");
  });

  /**
   * HungerG: the server reprices a below-cap ₹400 counter bill to ₹600. Accepting
   * the dialog's authoritative paise must re-run the cash guard against THOSE
   * paise, not the stale displayed bill; otherwise the retry writes a second
   * cash order the branch would never have admitted.
   */
  it("refuses an accepted ₹600 reprice above the ₹500 cap without a second cash order", async () => {
    usePaymentStore.getState().setMethod("cash");
    fixture.cart.calculateTotals.mockResolvedValue(totals(400, 400));
    seedSelection("takeaway", store);
    useCheckoutStore.setState({ checkoutFees: cappedCashQuote("takeaway") });
    fixture.postCash.mockRejectedValueOnce({
      response: {
        status: 409,
        data: { code: "PRICE_CHANGED", totals: { split: { totalAmountPaise: 60_000 } } },
      },
    });
    await mount();
    await act(async () => payButton().click());
    await act(async () => {});

    // The first, legitimate attempt priced the displayed ₹400 bill.
    expect(cashCreationCalls()).toHaveLength(1);
    expect(cashCreationCalls()[0][1]).toMatchObject({ expectedTotalPaise: 40_000 });
    const dialog = document.querySelector('[role="alertdialog"], [role="dialog"]');
    expect(dialog?.textContent).toContain("600");
    const proceed = Array.from(dialog?.querySelectorAll("button") ?? []).find(
      (button) => button.textContent === "Continue",
    );
    expect(proceed).toBeDefined();

    // A definitive PRICE_CHANGED is a verified no-write, but the attempt is
    // durably claimed BEFORE the POST and is still on disk at this point.
    const pendingKeys = () =>
      Object.keys(localStorage).filter((key) => key.includes(PENDING_CASH_ORDER_BASE_KEY));
    expect(pendingKeys()).toHaveLength(1);

    await act(async () => proceed?.click());
    await act(async () => {});

    // The accepted ₹600 is over the counter ceiling: no second cash order,
    // an explicit online switch with a visible reason, and no gateway/draft.
    expect(cashCreationCalls()).toHaveLength(1);
    expect(usePaymentStore.getState().method).toBe("upi");
    expect(container.textContent).toMatch(/up to ₹500|Please pay online/i);
    expect(fixture.createOrder).not.toHaveBeenCalled();
    expect(fixture.createPaymentOrder).not.toHaveBeenCalled();
    expect(fixture.openCheckout).not.toHaveBeenCalled();
    expect(fixture.cart.clear).not.toHaveBeenCalled();

    // The declined attempt must be RETIRED, not left behind for the next tap.
    expect(pendingKeys()).toHaveLength(0);

    // An explicit online tap now follows the online path all the way to the
    // gateway; total cash creates remain exactly one. The gateway quote must
    // match the displayed ₹400 bill (beforeEach's ₹109 would reprice again).
    fixture.gatewayCreate.mockResolvedValue({
      success: true,
      data: {
        id: "rzp_after_decline",
        orderId: "rzp_after_decline",
        amount: 400,
        currency: "INR",
        receipt: "rcpt_after_decline",
        keyId: "rzp_test_key",
      },
    });
    const realPayments = new PaymentRepository({ createOrder: fixture.gatewayCreate } as never);
    fixture.paymentRepository.createPaymentOrder =
      realPayments.createPaymentOrder.bind(realPayments);
    await act(async () => payButton().click());
    await act(async () => {});

    expect(cashCreationCalls()).toHaveLength(1);
    const onlineDrafts = fixture.postCash.mock.calls.filter(([url]) =>
      String(url).endsWith("/orders/createOnlineDraft"),
    );
    expect(onlineDrafts).toHaveLength(1);
    expect(fixture.gatewayCreate).toHaveBeenCalledTimes(1);
    expect(fixture.openCheckout).toHaveBeenCalledTimes(1);
  });

  /**
   * r3 High 2: if the declined attempt cannot be safely retired (a newer
   * generation was written while the dialog was open), the route must keep
   * safe recovery instead of switching tender into a possible replay.
   */
  it("keeps the cash tender and safe recovery when the decline cannot be retired", async () => {
    usePaymentStore.getState().setMethod("cash");
    fixture.cart.calculateTotals.mockResolvedValue(totals(400, 400));
    seedSelection("takeaway", store);
    useCheckoutStore.setState({ checkoutFees: cappedCashQuote("takeaway") });
    fixture.postCash.mockRejectedValueOnce({
      response: {
        status: 409,
        data: { code: "PRICE_CHANGED", totals: { split: { totalAmountPaise: 60_000 } } },
      },
    });
    await mount();
    await act(async () => payButton().click());

    expect(cashCreationCalls()).toHaveLength(1);
    const dialog = document.querySelector('[role="alertdialog"], [role="dialog"]');
    const proceed = Array.from(dialog?.querySelectorAll("button") ?? []).find(
      (button) => button.textContent === "Continue",
    );
    expect(proceed).toBeDefined();

    // A newer same-id write invalidates the pre-send proof before acceptance.
    updatePendingCashOrderAcceptedTotal(60_000);

    await act(async () => proceed?.click());
    await act(async () => {});

    // r2 switches to upi on a failed retirement; r3 must fail closed.
    expect(usePaymentStore.getState().method).toBe("cash");
    expect(cashCreationCalls()).toHaveLength(1);
    expect(fixture.createOrder).not.toHaveBeenCalled();
    expect(fixture.createPaymentOrder).not.toHaveBeenCalled();
    expect(fixture.openCheckout).toHaveBeenCalledTimes(0);
    expect(Object.keys(localStorage).some((key) => key.includes(PENDING_CASH_ORDER_BASE_KEY))).toBe(
      true,
    );
  });

  /** r4 Medium: a rejecting retirement promise must not strand PAY behind busy. */
  it("keeps PAY usable when retirement rejects, with the pending attempt preserved", async () => {
    usePaymentStore.getState().setMethod("cash");
    fixture.cart.calculateTotals.mockResolvedValue(totals(400, 400));
    seedSelection("takeaway", store);
    useCheckoutStore.setState({ checkoutFees: cappedCashQuote("takeaway") });
    fixture.postCash.mockRejectedValueOnce({
      response: {
        status: 409,
        data: { code: "PRICE_CHANGED", totals: { split: { totalAmountPaise: 60_000 } } },
      },
    });
    await mount();
    await act(async () => payButton().click());

    expect(cashCreationCalls()).toHaveLength(1);
    const dialog = document.querySelector('[role="alertdialog"], [role="dialog"]');
    const proceed = Array.from(dialog?.querySelectorAll("button") ?? []).find(
      (button) => button.textContent === "Continue",
    );
    expect(proceed).toBeDefined();

    lockState.throwNext = true; // Web Lock rejection on the retirement call.
    await act(async () => proceed?.click());
    await act(async () => {});

    expect(container.textContent).toMatch(
      /couldn't safely update your payment method|check your orders and try again/i,
    );
    expect(usePaymentStore.getState().method).toBe("cash");
    expect(cashCreationCalls()).toHaveLength(1);
    expect(fixture.createOrder).not.toHaveBeenCalled();
    expect(fixture.createPaymentOrder).not.toHaveBeenCalled();
    expect(fixture.openCheckout).not.toHaveBeenCalled();
    expect(Object.keys(localStorage).some((key) => key.includes(PENDING_CASH_ORDER_BASE_KEY))).toBe(
      true,
    );

    // Busy/in-flight was released: PAY is clickable and gives honest recovery.
    const retry = payButton();
    expect(retry.disabled).toBe(false);
    await act(async () => retry.click());
    await act(async () => {});
    expect(cashCreationCalls()).toHaveLength(1);
    expect(container.textContent).toMatch(/Finish your previous checkout|review/i);
    expect(fixture.createPaymentOrder).not.toHaveBeenCalled();
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
    // Hydration of the posted zero-due receipt must report zero at that same id.
    vi.spyOn(ordersService, "getOrder").mockImplementation(
      async (id: string) =>
        ({
          success: true as const,
          data: {
            id,
            cashDuePaise: 0,
            status: { code: "PLACED", label: "Placed", kind: "upcoming", terminal: false },
          },
        }) as never,
    );
    // The server confirms zero due against the EXACT generated order id.
    fixture.postCash.mockImplementation(async (_url: string, request: { orderId: string }) => ({
      data: {
        orderId: request.orderId,
        paymentMethod: "cod",
        paymentChannel: "cash",
        cashDuePaise: 0,
        totals: {},
        status: { code: "PLACED", label: "Placed", kind: "upcoming", terminal: false },
      },
    }));
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
    const postedZeroId = (fixture.postCash.mock.calls[0][1] as { orderId: string }).orderId;
    expect(fixture.gatewayCreate).not.toHaveBeenCalled();
    expect(fixture.createPaymentOrder).not.toHaveBeenCalled();
    expect(fixture.toast.error).not.toHaveBeenCalled();
    expect(fixture.navigate).toHaveBeenCalledWith({
      to: "/orders/$orderId/track",
      params: { orderId: postedZeroId },
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

  it("still places counter cash with a legacy enabled quote", async () => {
    usePaymentStore.getState().setMethod("cash");
    seedSelection("takeaway", store);
    useCheckoutStore.setState({ checkoutFees: legacyCashQuote("takeaway") });
    await mount();

    expect(cashAvailabilityText()).toBe("cash available");
    expect(payButton().disabled).toBe(false);
    await act(async () => payButton().click());
    await act(async () => {});

    expect(cashCreationCalls()).toHaveLength(1);
    expect(cashCreationCalls()[0][1]).toMatchObject({
      orderType: "takeaway",
      expectedTotalPaise: 50000,
    });
    expect(fixture.createOrder).not.toHaveBeenCalled();
  });
});

describe("checkout — delivery is paid online only", () => {
  it("refuses a restored cash selection backed by a legacy enabled delivery quote", async () => {
    usePaymentStore.getState().setMethod("cash");
    seedSelection("delivery", store);
    useCheckoutStore.setState({ checkoutFees: legacyCashQuote("delivery") });
    mockOnlineSuccess();
    await mount();

    expect(cashAvailabilityText()).toContain("paid online only");
    expect(usePaymentStore.getState().method).toBe("upi");
    expect(container.textContent).toContain("1. Delivery Details");

    await act(async () => payButton().click());
    await act(async () => {});

    expect(cashCreationCalls()).toHaveLength(0);
    expect(fixture.createPaymentOrder).toHaveBeenCalledTimes(1);
    expect(fixture.openCheckout).toHaveBeenCalledTimes(1);
  });

  it("does not send a cash request when no quote has arrived", async () => {
    usePaymentStore.getState().setMethod("cash");
    seedSelection("delivery", store);
    useCheckoutStore.setState({ checkoutFees: { status: "idle" } });
    await mount();

    expect(cashAvailabilityText()).toContain("paid online only");
    expect(usePaymentStore.getState().method).toBe("upi");
    // A disabled button still gets a defensive click: no hidden cash path.
    await act(async () => {
      payButton().dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await act(async () => {});

    expect(cashCreationCalls()).toHaveLength(0);
  });

  it("refuses a counter cash selection after the mode switches to delivery", async () => {
    usePaymentStore.getState().setMethod("cash");
    seedSelection("takeaway", store);
    mockOnlineSuccess();
    await mount();

    await act(async () => {
      useStoreSelection.getState().setFulfillment("delivery");
      useCheckoutStore.setState({ checkoutFees: legacyCashQuote("delivery") });
    });
    await act(async () => {});

    expect(cashAvailabilityText()).toContain("paid online only");
    expect(usePaymentStore.getState().method).toBe("upi");
    await act(async () => payButton().click());
    await act(async () => {});

    expect(cashCreationCalls()).toHaveLength(0);
  });
});

describe("checkout — zero-due is server-verified, never a guessed capture", () => {
  it("still places a server-verified zero-due delivery order through zeroDueOnly", async () => {
    usePaymentStore.getState().setMethod("upi");
    // Keep a bankable subtotal so the repository's minimum-order check passes;
    // only the final payable is zero after the server's discount.
    fixture.cart.calculateTotals.mockResolvedValue(totals(500, 0));
    seedSelection("delivery", store);
    vi.spyOn(ordersService, "getOrder").mockImplementation(
      async (id: string) =>
        ({
          success: true as const,
          data: {
            id,
            cashDuePaise: 0,
            status: { code: "PLACED", label: "Placed", kind: "upcoming", terminal: false },
          },
        }) as never,
    );
    fixture.postCash.mockImplementation(async (_url: string, request: { orderId: string }) => ({
      data: {
        orderId: request.orderId,
        paymentMethod: "cod",
        paymentChannel: "cash",
        cashDuePaise: 0,
        totals: {},
        status: { code: "PLACED", label: "Placed", kind: "upcoming", terminal: false },
      },
    }));
    await mount();
    await act(async () => payButton().click());
    await act(async () => {});

    expect(cashCreationCalls()).toHaveLength(1);
    expect(cashCreationCalls()[0][1]).toMatchObject({
      orderType: "delivery",
      expectedTotalPaise: 0,
      zeroDueOnly: true,
    });
    const postedDeliveryZeroId = (cashCreationCalls()[0][1] as { orderId: string }).orderId;
    expect(fixture.gatewayCreate).not.toHaveBeenCalled();
    expect(fixture.toast.success).toHaveBeenCalledWith("No payment due", expect.anything());
    expect(fixture.navigate).toHaveBeenCalledWith({
      to: "/orders/$orderId/track",
      params: { orderId: postedDeliveryZeroId },
      replace: true,
    });
  });

  it("does not record a stale zero-due bill as paid when the server says cash is due", async () => {
    usePaymentStore.getState().setMethod("upi");
    fixture.cart.calculateTotals.mockResolvedValue(totals(500, 0));
    seedSelection("delivery", store);
    fixture.postCash.mockResolvedValue({
      data: {
        orderId: "ord_stale_zero",
        cashDuePaise: 10900,
        totals: {},
        status: { code: "PLACED", label: "Placed", kind: "upcoming", terminal: false },
      },
    });
    await mount();
    await act(async () => payButton().click());
    await act(async () => {});

    expect(cashCreationCalls()).toHaveLength(1);
    expect(cashCreationCalls()[0][1]).toMatchObject({ zeroDueOnly: true });
    expect(fixture.toast.success).not.toHaveBeenCalled();
    expect(fixture.navigate).not.toHaveBeenCalled();
    expect(fixture.cart.clear).not.toHaveBeenCalled();
    expect(usePaymentStore.getState().status).not.toBe("success");
    // The repository refuses the stale zero-due receipt before the route can
    // claim a capture; no success copy is shown.
    expect(container.textContent).toContain("Something went wrong");
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
        // Owner decision 2026-11-25 (#1): the legacy banked tip is part of NO
        // billed figure, so the server total equals the visible ₹500 — a ₹525
        // fixture would now (correctly) raise the reprice prompt instead.
        amount: 500,
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
        amount: 500,
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

/** R5-B1 — ownership binds the delayed cash result to the live submission. */
describe("checkout — submitted basket/draft/session ownership", () => {
  const startedSignal = () => {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => (resolve = r));
    return { promise, resolve };
  };
  const deferredResult = () => {
    let resolve!: (value: unknown) => void;
    const promise = new Promise((r) => (resolve = r));
    return { promise, resolve };
  };
  const armPendingCash = () => {
    const started = startedSignal();
    const reply = deferredResult();
    fixture.cart.calculateTotals.mockResolvedValue(totals(109, 109));
    fixture.postCash.mockImplementation(async (url: string, request: { orderId: string }) => {
      if (String(url).endsWith("/orders/createCashOrder")) {
        started.resolve();
        return (await reply.promise) as never;
      }
      return { data: { orderId: request.orderId } } as never;
    });
    return { started, reply };
  };
  const receipt = (orderId: string) => ({
    success: true,
    data: {
      orderId,
      paymentMethod: "cod",
      paymentChannel: "cash",
      cashDuePaise: 10900,
      totals: {},
      status: { code: "PLACED", label: "Placed", kind: "upcoming", terminal: false },
    },
  });

  it("a new cart line during the pending result survives with no stale cleanup", async () => {
    usePaymentStore.getState().setMethod("cash");
    seedSelection("takeaway", store);
    const { started, reply } = armPendingCash();
    await mount();
    const click = act(async () => payButton().click());
    await started.promise;
    const postedId = (fixture.postCash.mock.calls[0][1] as { orderId: string }).orderId;
    const original = fixture.cartState.lines;
    fixture.cartState.lines = [...original, { ...original[0], lineId: "l2", productId: "p2" }];
    reply.resolve(receipt(postedId));
    await click;
    await act(async () => {});
    expect(fixture.cart.clear).not.toHaveBeenCalled();
    expect(fixture.navigate).not.toHaveBeenCalled();
    expect(fixture.cartState.lines).toHaveLength(2);
  });

  it("a session ending during the pending result suppresses stale effects", async () => {
    usePaymentStore.getState().setMethod("cash");
    seedSelection("takeaway", store);
    const { started, reply } = armPendingCash();
    await mount();
    const click = act(async () => payButton().click());
    await started.promise;
    const postedId = (fixture.postCash.mock.calls[0][1] as { orderId: string }).orderId;
    authEpoch += 1; // logout/re-login advances the existing identity fence
    reply.resolve(receipt(postedId));
    await click;
    await act(async () => {});
    expect(fixture.cart.clear).not.toHaveBeenCalled();
    expect(fixture.navigate).not.toHaveBeenCalled();
    expect(fixture.toast.success).not.toHaveBeenCalled();
  });

  it("a note revision during the pending result survives with no stale cleanup", async () => {
    usePaymentStore.getState().setMethod("cash");
    seedSelection("takeaway", store);
    const { started, reply } = armPendingCash();
    await mount();
    const click = act(async () => payButton().click());
    await started.promise;
    const postedId = (fixture.postCash.mock.calls[0][1] as { orderId: string }).orderId;
    useCheckoutStore.getState().setOrderNotes("A newer note");
    reply.resolve(receipt(postedId));
    await click;
    await act(async () => {});
    expect(fixture.cart.clear).not.toHaveBeenCalled();
    expect(fixture.navigate).not.toHaveBeenCalled();
    expect(useCheckoutStore.getState().orderNotes).toBe("A newer note");
  });

  it("a genuine zero-due result does not clean a cart edited while it was pending", async () => {
    usePaymentStore.getState().setMethod("upi");
    seedSelection("takeaway", store);
    const started = startedSignal();
    const reply = deferredResult();
    fixture.cart.calculateTotals.mockResolvedValue(totals(0, 0));
    fixture.postCash.mockImplementation(async (url: string, request: { orderId: string }) => {
      if (String(url).endsWith("/orders/createCashOrder")) {
        started.resolve();
        return (await reply.promise) as never;
      }
      return { data: { orderId: request.orderId } } as never;
    });
    await mount();
    const click = act(async () => payButton().click());
    await started.promise;
    const postedId = (fixture.postCash.mock.calls[0][1] as { orderId: string }).orderId;
    fixture.cartState.lines = [
      ...fixture.cartState.lines,
      { ...fixture.cartState.lines[0], lineId: "l2", productId: "p2" },
    ];
    reply.resolve({
      success: true,
      data: {
        orderId: postedId,
        paymentMethod: "cod",
        paymentChannel: "cash",
        cashDuePaise: 0,
        totals: {},
        status: { code: "PLACED", label: "Placed", kind: "upcoming", terminal: false },
      },
    });
    await click;
    await act(async () => {});
    expect(fixture.gatewayCreate).not.toHaveBeenCalled();
    expect(fixture.cart.clear).not.toHaveBeenCalled();
    expect(fixture.navigate).not.toHaveBeenCalled();
    expect(fixture.cartState.lines).toHaveLength(2);
  });
});

/** R5-B1 corrections — deferred/latch regressions on the corrected code. */
describe("checkout — terminal stale receipts and original-scope confirmation", () => {
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
  const receipt = (orderId: string) => ({
    success: true as const,
    data: {
      orderId,
      paymentMethod: "cod",
      paymentChannel: "cash",
      cashDuePaise: 10_900,
      totals: {},
      status: { code: "PLACED", label: "Placed", kind: "upcoming", terminal: false },
    },
  });
  const armCash = () => {
    const started = startedSignal();
    const reply = deferredResult();
    fixture.cart.calculateTotals.mockResolvedValue(totals(109, 109));
    fixture.postCash.mockImplementation(async (url: string, request: { orderId: string }) => {
      if (String(url).endsWith("/orders/createCashOrder")) {
        started.resolve();
        return (await reply.promise) as never;
      }
      return { data: { orderId: request.orderId } } as never;
    });
    return { started, reply };
  };
  const armReprice = () => {
    fixture.cart.calculateTotals.mockResolvedValue(totals(109, 109));
    fixture.postCash.mockRejectedValueOnce({
      response: {
        status: 409,
        data: { code: "PRICE_CHANGED", totals: { split: { totalAmountPaise: 51_000 } } },
      },
    });
  };
  const continueButton = () => {
    const dialog = document.querySelector('[role="alertdialog"], [role="dialog"]');
    const proceed = Array.from(dialog?.querySelectorAll("button") ?? []).find(
      (button) => button.textContent === "Continue",
    );
    expect(proceed).toBeDefined();
    return proceed as HTMLButtonElement;
  };

  it("a session advance during the pending result is terminal with exactly one POST", async () => {
    usePaymentStore.getState().setMethod("cash");
    seedSelection("takeaway", store);
    const { started, reply } = armCash();
    await mount();
    const click = act(async () => payButton().click());
    await started.promise;
    const postedId = cashCreationCalls()[0][1].orderId as string;

    authEpoch += 1;
    reply.resolve(receipt(postedId));
    await click;
    await act(async () => {});

    expect(container.textContent).toContain(postedId);
    expect(fixture.cart.clear).not.toHaveBeenCalled();
    expect(fixture.navigate).not.toHaveBeenCalled();
    expect(payButton().disabled).toBe(true);
    await act(async () => payButton().click());
    await act(async () => {});
    expect(cashCreationCalls()).toHaveLength(1);
  });

  it("a same product/quantity line swap during the pending result is terminal", async () => {
    usePaymentStore.getState().setMethod("cash");
    seedSelection("takeaway", store);
    const { started, reply } = armCash();
    await mount();
    const click = act(async () => payButton().click());
    await started.promise;
    const postedId = cashCreationCalls()[0][1].orderId as string;

    fixture.cartState.lines = [{ ...fixture.cartState.lines[0], lineId: "l2" }];
    reply.resolve(receipt(postedId));
    await click;
    await act(async () => {});

    expect(container.textContent).toContain(postedId);
    expect(fixture.cart.clear).not.toHaveBeenCalled();
    expect(fixture.navigate).not.toHaveBeenCalled();
    expect(fixture.cartState.lines[0].lineId).toBe("l2");
    expect(cashCreationCalls()).toHaveLength(1);
  });

  it("a customization edit during the pending result is terminal", async () => {
    fixture.cartState.lines = [
      {
        ...fixture.cartState.lines[0],
        customizations: [
          { groupId: "size", groupName: "Size", optionId: "large", name: "Large", price: 0 },
        ],
      },
    ];
    usePaymentStore.getState().setMethod("cash");
    seedSelection("takeaway", store);
    const { started, reply } = armCash();
    await mount();
    const click = act(async () => payButton().click());
    await started.promise;
    const postedId = cashCreationCalls()[0][1].orderId as string;

    fixture.cartState.lines = [
      {
        ...fixture.cartState.lines[0],
        customizations: [
          { groupId: "size", groupName: "Size", optionId: "small", name: "Small", price: 0 },
        ],
      },
    ];
    reply.resolve(receipt(postedId));
    await click;
    await act(async () => {});

    expect(container.textContent).toContain(postedId);
    expect(fixture.cart.clear).not.toHaveBeenCalled();
    expect(fixture.navigate).not.toHaveBeenCalled();
    expect(cashCreationCalls()).toHaveLength(1);
  });

  it("a note edit while the reprice dialog is open blocks Continue replay", async () => {
    usePaymentStore.getState().setMethod("cash");
    seedSelection("takeaway", store);
    armReprice();
    await mount();
    await act(async () => payButton().click());
    await act(async () => {});
    expect(cashCreationCalls()).toHaveLength(1);

    useCheckoutStore.getState().setOrderNotes("A newer note");
    await act(async () => continueButton().click());
    await act(async () => {});

    expect(cashCreationCalls()).toHaveLength(1);
    expect(fixture.cart.clear).not.toHaveBeenCalled();
    expect(useCheckoutStore.getState().orderNotes).toBe("A newer note");
    expect(container.textContent).toMatch(/checkout changed/i);
  });

  it("a customization edit while the reprice dialog is open blocks Continue replay", async () => {
    fixture.cartState.lines = [
      {
        ...fixture.cartState.lines[0],
        customizations: [
          { groupId: "size", groupName: "Size", optionId: "large", name: "Large", price: 0 },
        ],
      },
    ];
    usePaymentStore.getState().setMethod("cash");
    seedSelection("takeaway", store);
    armReprice();
    await mount();
    await act(async () => payButton().click());
    await act(async () => {});
    expect(cashCreationCalls()).toHaveLength(1);

    fixture.cartState.lines = [
      {
        ...fixture.cartState.lines[0],
        customizations: [
          { groupId: "size", groupName: "Size", optionId: "small", name: "Small", price: 0 },
        ],
      },
    ];
    await act(async () => continueButton().click());
    await act(async () => {});

    expect(cashCreationCalls()).toHaveLength(1);
    expect(fixture.cart.clear).not.toHaveBeenCalled();
    expect(container.textContent).toMatch(/checkout changed/i);
  });

  it("a same-UID epoch advance while the reprice dialog is open blocks Continue replay", async () => {
    usePaymentStore.getState().setMethod("cash");
    seedSelection("takeaway", store);
    armReprice();
    await mount();
    await act(async () => payButton().click());
    await act(async () => {});
    expect(cashCreationCalls()).toHaveLength(1);

    authEpoch += 1;
    await act(async () => continueButton().click());
    await act(async () => {});

    expect(cashCreationCalls()).toHaveLength(1);
    expect(fixture.cart.clear).not.toHaveBeenCalled();
    expect(container.textContent).toMatch(/checkout changed/i);
  });

  it("a CASH_BUSY competitor does not erase ownership and an epoch advance fences it", async () => {
    seedSelection("takeaway", store);
    const { started, reply } = armCash();
    const repo = new OrderRepository();
    const first = repo.createCashOrder();
    await started.promise;
    const owned = cashSubmissionScope();
    expect(owned).not.toBeNull();
    expect(owned!.identityEpoch).toBe(0);

    const competitor = await repo.createCashOrder();
    if (competitor.success) throw new Error("expected the competing call to be declined");
    expect(competitor.error.code).toBe("CASH_BUSY");
    expect(cashSubmissionScope()).toBe(owned);

    authEpoch += 1;
    expect(isCompletionScopeValid(owned!)).toBe(false);
    expect(captureCompletionScope().identityEpoch).toBe(1);

    reply.resolve(receipt(cashCreationCalls()[0][1].orderId as string));
    await first;
    expect(cashCreationCalls()).toHaveLength(1);
  });
});

/** R5-B1r3 — the two re-review holes, proven with fake transport + start latches. */
describe("checkout — older receipts and deferred replay scope", () => {
  const startedSignal = () => {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => (resolve = r));
    return { promise, resolve };
  };
  const deferredResult = () => {
    let resolve!: (value: unknown) => void;
    const promise = new Promise((r) => (resolve = r));
    return { promise, resolve };
  };
  const receipt = (orderId: string, cashDuePaise = 10_900) => ({
    success: true as const,
    data: {
      orderId,
      paymentMethod: "cod",
      paymentChannel: "cash",
      cashDuePaise,
      totals: {},
      status: { code: "PLACED", label: "Placed", kind: "upcoming", terminal: false },
    },
  });
  const pendingKey = () =>
    Object.keys(localStorage).find((key) => key.includes(PENDING_CASH_ORDER_BASE_KEY)) ?? null;
  const armConfirmed = (orderId: string, basketHash: string) => {
    const now = Date.now();
    localStorage.setItem(
      `${PENDING_CASH_ORDER_BASE_KEY}::cust_fulfill`,
      JSON.stringify({
        uid: "cust_fulfill",
        attemptId: "att_confirmed",
        orderId,
        request: {
          orderId,
          orderType: "takeaway",
          items: [{ productId: "burger_old", quantity: 1 }],
          expectedTotalPaise: 10_900,
        },
        confirmed: true,
        createdAtMs: now - 1_000,
        updatedAtMs: now - 1_000,
        basketHash,
        generation: 3,
        sent: true,
      }),
    );
  };
  const armReprice = () => {
    fixture.cart.calculateTotals.mockResolvedValue(totals(109, 109));
    fixture.postCash.mockRejectedValueOnce({
      response: {
        status: 409,
        data: { code: "PRICE_CHANGED", totals: { split: { totalAmountPaise: 51_000 } } },
      },
    });
  };
  const continueButton = () => {
    const dialog = document.querySelector('[role="alertdialog"], [role="dialog"]');
    const proceed = Array.from(dialog?.querySelectorAll("button") ?? []).find(
      (button) => button.textContent === "Continue",
    );
    expect(proceed).toBeDefined();
    return proceed as HTMLButtonElement;
  };
  const newerLine = () => ({ ...fixture.lines[0], lineId: "l2", productId: "p2" });

  it("an older confirmed nonzero receipt with a newer basket only navigates to its own order", async () => {
    usePaymentStore.getState().setMethod("cash");
    seedSelection("takeaway", store);
    fixture.cartState.lines = [...fixture.lines, newerLine()];
    useCheckoutStore.getState().setOrderNotes("Newer checkout note");
    armConfirmed("ord_older", "older_basket");
    const before = localStorage.getItem(pendingKey()!);
    await mount();

    await act(async () => payButton().click());
    await act(async () => {});

    expect(fixture.navigate).toHaveBeenCalledWith({
      to: "/orders/$orderId/track",
      params: { orderId: "ord_older" },
      replace: true,
    });
    expect(cashCreationCalls()).toHaveLength(0);
    expect(fixture.cart.clear).not.toHaveBeenCalled();
    expect(fixture.cartState.lines).toHaveLength(2);
    expect(useCheckoutStore.getState().orderNotes).toBe("Newer checkout note");
    expect(localStorage.getItem(pendingKey()!)).toBe(before);
    expect(usePaymentStore.getState().method).toBe("cash");
  });

  it("a confirmed receipt for the same basket finishes with exactly one cleanup", async () => {
    usePaymentStore.getState().setMethod("cash");
    seedSelection("takeaway", store);
    const liveBasket = new OrderRepository().currentBasketHash();
    expect(liveBasket).not.toBeNull();
    armConfirmed("ord_same", liveBasket!);
    await mount();

    await act(async () => payButton().click());
    await act(async () => {});

    expect(fixture.navigate).toHaveBeenCalledWith({
      to: "/orders/$orderId/track",
      params: { orderId: "ord_same" },
      replace: true,
    });
    expect(cashCreationCalls()).toHaveLength(0);
    expect(fixture.cart.clear).toHaveBeenCalledTimes(1);
    expect(pendingKey()).toBeNull();
  });

  it("a confirmed same-basket receipt with a newer note keeps the note and still cleans the basket", async () => {
    usePaymentStore.getState().setMethod("cash");
    seedSelection("takeaway", store);
    // Basket identity excludes notes, so the receipt still matches this cart
    // even though the note was written for this checkout, not that old order.
    const liveBasket = new OrderRepository().currentBasketHash();
    expect(liveBasket).not.toBeNull();
    armConfirmed("ord_same_note", liveBasket!);
    useCheckoutStore.getState().setOrderNotes("Newer note before PAY");
    expect(localStorage.getItem(pendingKey()!)).not.toBeNull();
    await mount();

    await act(async () => payButton().click());
    await act(async () => {});

    expect(fixture.navigate).toHaveBeenCalledTimes(1);
    expect(fixture.navigate).toHaveBeenCalledWith({
      to: "/orders/$orderId/track",
      params: { orderId: "ord_same_note" },
      replace: true,
    });
    expect(cashCreationCalls()).toHaveLength(0);
    expect(fixture.cart.clear).toHaveBeenCalledTimes(1);
    expect(pendingKey()).toBeNull();
    expect(useCheckoutStore.getState().orderNotes).toBe("Newer note before PAY");
  });

  it("a cart edit during the Continue preflight blocks the deferred replay", async () => {
    usePaymentStore.getState().setMethod("cash");
    seedSelection("takeaway", store);
    armReprice();
    await mount();
    await act(async () => payButton().click());
    await act(async () => {});
    expect(cashCreationCalls()).toHaveLength(1);

    const preflightStarted = startedSignal();
    const preflight = deferredResult();
    fixture.cart.validateCart.mockImplementationOnce(() => {
      preflightStarted.resolve();
      return preflight.promise as never;
    });
    const click = act(async () => continueButton().click());
    await preflightStarted.promise;
    expect(fixture.cart.validateCart).toHaveBeenCalledTimes(2);

    fixture.cartState.lines = [...fixture.lines, newerLine()];
    preflight.resolve({ success: true, data: { valid: true, issues: [] } });
    await click;
    await act(async () => {});

    expect(cashCreationCalls()).toHaveLength(1);
    expect(fixture.cart.clear).not.toHaveBeenCalled();
    expect(fixture.cartState.lines).toHaveLength(2);
    expect(container.textContent).toMatch(/checkout changed/i);
  });

  it("a note edit after the Continue POST is terminal and preserves the newer note", async () => {
    usePaymentStore.getState().setMethod("cash");
    seedSelection("takeaway", store);
    armReprice();
    await mount();
    await act(async () => payButton().click());
    await act(async () => {});
    expect(cashCreationCalls()).toHaveLength(1);

    const started = startedSignal();
    const reply = deferredResult();
    fixture.postCash.mockImplementationOnce(async () => {
      started.resolve();
      return (await reply.promise) as never;
    });
    const click = act(async () => continueButton().click());
    await started.promise;
    const replayId = cashCreationCalls()[1][1].orderId as string;

    useCheckoutStore.getState().setOrderNotes("Note typed after replay");
    reply.resolve(receipt(replayId, 51_000));
    await click;
    await act(async () => {});

    expect(cashCreationCalls()).toHaveLength(2);
    expect(container.textContent).toContain(replayId);
    expect(fixture.cart.clear).not.toHaveBeenCalled();
    expect(fixture.navigate).not.toHaveBeenCalled();
    expect(useCheckoutStore.getState().orderNotes).toBe("Note typed after replay");
  });
});

/** R5-B2 — online replies are bound to the live submitted checkout. */
describe("checkout — online completion ownership", () => {
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
  const onlineOrder = () => ({
    success: true as const,
    data: {
      orderId: "order_rzp_b2",
      amount: 500,
      currency: "INR",
      receipt: "rcpt_b2",
      keyId: "rzp_test_key",
    },
  });
  const verified = () => ({
    success: true as const,
    data: { verified: true, confirmedOrderId: "ord_paid_b2", paymentId: "pay_b2" },
  });
  /**
   * `stage` picks which fake transport is deferred. All provider/repository
   * boundaries remain fake; no order, gateway call or network is real.
   */
  const armOnline = (
    stage: "create" | "verify" | "finalize" | "open" | "throwVerify" | "unknown",
  ) => {
    const started = signal();
    const reply = deferred();
    if (stage === "create") {
      fixture.createPaymentOrder.mockImplementation(async () => {
        started.resolve();
        return (await reply.promise) as never;
      });
    } else {
      fixture.createPaymentOrder.mockResolvedValue(onlineOrder());
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
    }
    if (stage === "finalize") {
      fixture.finalizePaidOrder.mockImplementation(async () => {
        started.resolve();
        return (await reply.promise) as never;
      });
    } else {
      fixture.finalizePaidOrder.mockResolvedValue({ success: true, data: { id: "ord_paid_b2" } });
    }
    if (stage === "open") {
      // Defer the gateway initialize() await itself; no modal may open for a
      // submission superseded while this promise is pending.
      fixture.initializeRazorpay.mockImplementation(async () => {
        started.resolve();
        await reply.promise;
      });
    }
    fixture.openCheckout.mockImplementation(
      async (handlers: { onSuccess: (r: Record<string, unknown>) => Promise<void> }) => {
        await handlers.onSuccess({ orderId: "order_rzp_b2", paymentId: "pay_b2" });
      },
    );
    return { started, reply };
  };
  const reconKeys = () =>
    Object.keys(sessionStorage).filter((key) => key.includes("burgonomics:payment_reconciliation"));
  const terminalReceipt = (orderId: string, paymentId: string) => {
    expect(container.textContent).toContain(orderId);
    expect(container.textContent).toContain(paymentId);
    expect(container.textContent).toContain("Payment under review");
    expect(usePaymentStore.getState().failure?.retryable).toBe(false);
    // A terminal receipt keeps PAY disabled ("do not pay again") rather than
    // re-arming it for the newer basket.
    expect(container.querySelector('button[title*="do not pay again"]')).not.toBeNull();
  };
  const startOnline = async () => {
    usePaymentStore.getState().setMethod("online");
    seedSelection("delivery", store);
    await mount();
  };
  const noStaleCompletion = () => {
    expect(fixture.cart.clear).not.toHaveBeenCalled();
    expect(fixture.navigate).not.toHaveBeenCalled();
    expect(fixture.toast.success).not.toHaveBeenCalled();
    expect(usePaymentStore.getState().status).not.toBe("success");
  };

  it("a cart edit during createPaymentOrder blocks the stale gateway open", async () => {
    const { started, reply } = armOnline("create");
    await startOnline();
    const click = act(async () => payButton().click());
    await started.promise;

    const original = fixture.cartState.lines;
    fixture.cartState.lines = [...original, { ...original[0], lineId: "l2", productId: "p2" }];
    reply.resolve(onlineOrder());
    await click;
    await act(async () => {});

    expect(fixture.openCheckout).not.toHaveBeenCalled();
    noStaleCompletion();
    expect(fixture.cartState.lines).toHaveLength(2);
  });

  it("a same-account cart edit during verification finalizes once into a terminal receipt", async () => {
    const { started, reply } = armOnline("verify");
    await startOnline();
    const click = act(async () => payButton().click());
    await started.promise;

    const original = fixture.cartState.lines;
    fixture.cartState.lines = [...original, { ...original[0], lineId: "l2", productId: "p2" }];
    reply.resolve(verified());
    await click;
    await act(async () => {});

    expect(fixture.finalizePaidOrder).toHaveBeenCalledTimes(1);
    noStaleCompletion();
    expect(fixture.cartState.lines).toHaveLength(2);
    terminalReceipt("ord_paid_b2", "pay_b2");
    expect(reconKeys()).toHaveLength(1);
  });

  it("a same-account note edit during verification keeps the newer note with a terminal receipt", async () => {
    const { started, reply } = armOnline("verify");
    await startOnline();
    const click = act(async () => payButton().click());
    await started.promise;

    useCheckoutStore.getState().setOrderNotes("Newer note before online success");
    reply.resolve(verified());
    await click;
    await act(async () => {});

    expect(fixture.finalizePaidOrder).toHaveBeenCalledTimes(1);
    noStaleCompletion();
    expect(useCheckoutStore.getState().orderNotes).toBe("Newer note before online success");
    terminalReceipt("ord_paid_b2", "pay_b2");
  });

  it("a session advance during verification publishes no reconciliation or success", async () => {
    const { started, reply } = armOnline("verify");
    await startOnline();
    const click = act(async () => payButton().click());
    await started.promise;

    authEpoch += 1; // same uid, new account lifetime while verification is pending
    reply.resolve(verified());
    await click;
    await act(async () => {});

    expect(fixture.finalizePaidOrder).not.toHaveBeenCalled();
    noStaleCompletion();
  });

  it("a session advance during finalization blocks reconciliation clear and navigation", async () => {
    const { started, reply } = armOnline("finalize");
    await startOnline();
    const click = act(async () => payButton().click());
    await started.promise;

    useCheckoutStore.getState().setOrderNotes("Newer note before finalize");
    authEpoch += 1;
    reply.resolve({ success: true, data: { id: "ord_paid_b2" } });
    await click;
    await act(async () => {});

    noStaleCompletion();
    expect(useCheckoutStore.getState().orderNotes).toBe("Newer note before finalize");
    expect(usePaymentStore.getState().reconciliationPending).toBe(false);
  });

  it("an unchanged same-account online result still cleans only its own data", async () => {
    const { started, reply } = armOnline("finalize");
    await startOnline();
    useCheckoutStore.getState().setOrderNotes("My own online note");
    const click = act(async () => payButton().click());
    await started.promise;
    reply.resolve({ success: true, data: { id: "ord_paid_b2" } });
    await click;
    await act(async () => {});

    expect(fixture.finalizePaidOrder).toHaveBeenCalledTimes(1);
    expect(fixture.cart.clear).toHaveBeenCalledTimes(1);
    expect(fixture.navigate).toHaveBeenCalledWith({
      to: "/orders/$orderId/track",
      params: { orderId: "ord_paid_b2" },
      replace: true,
    });
    expect(usePaymentStore.getState().status).toBe("success");
    expect(useCheckoutStore.getState().orderNotes).toBe("");
  });

  it("an unknown verification outcome still reconciles after a same-account cart edit", async () => {
    const { started, reply } = armOnline("unknown");
    await startOnline();
    const click = act(async () => payButton().click());
    await started.promise;

    const original = fixture.cartState.lines;
    fixture.cartState.lines = [...original, { ...original[0], lineId: "l2", productId: "p2" }];
    reply.resolve({
      success: false,
      error: { code: "TRANSFER_IN_PROGRESS", message: "Still processing" },
    });
    await click;
    await act(async () => {});

    expect(fixture.finalizePaidOrder).not.toHaveBeenCalled();
    expect(usePaymentStore.getState().reconciliationPending).toBe(true);
    expect(reconKeys()).toHaveLength(1);
    noStaleCompletion();
    expect(fixture.cartState.lines).toHaveLength(2);
  });

  it("an account change before a verification throw writes no reconciliation", async () => {
    const { started, reply } = armOnline("throwVerify");
    await startOnline();
    const click = act(async () => payButton().click());
    await started.promise;

    authEpoch += 1;
    reply.resolve(undefined);
    await click;
    await act(async () => {});

    expect(usePaymentStore.getState().reconciliationPending).toBe(false);
    expect(reconKeys()).toHaveLength(0);
    expect(usePaymentStore.getState().failure).toBeNull();
    expect(fixture.toast.info).not.toHaveBeenCalled();
    expect(fixture.cart.clear).not.toHaveBeenCalled();
    expect(fixture.navigate).not.toHaveBeenCalled();
  });

  it("a same-account cart edit before a verification throw still reconciles", async () => {
    const { started, reply } = armOnline("throwVerify");
    await startOnline();
    const click = act(async () => payButton().click());
    await started.promise;

    const original = fixture.cartState.lines;
    fixture.cartState.lines = [...original, { ...original[0], lineId: "l2", productId: "p2" }];
    reply.resolve(undefined);
    await click;
    await act(async () => {});

    expect(usePaymentStore.getState().reconciliationPending).toBe(true);
    expect(reconKeys()).toHaveLength(1);
    expect(usePaymentStore.getState().failure?.retryable).toBe(false);
    noStaleCompletion();
    expect(fixture.cartState.lines).toHaveLength(2);
  });

  it("a cart edit during gateway initialize blocks the modal open", async () => {
    const { started, reply } = armOnline("open");
    await startOnline();
    const click = act(async () => payButton().click());
    await started.promise;

    const original = fixture.cartState.lines;
    fixture.cartState.lines = [...original, { ...original[0], lineId: "l2", productId: "p2" }];
    reply.resolve(undefined);
    await click;
    await act(async () => {});

    expect(fixture.openCheckout).not.toHaveBeenCalled();
    noStaleCompletion();
  });

  const armCallbacks = (callback: "failure" | "cancel") => {
    const started = signal();
    const reply = deferred();
    fixture.createPaymentOrder.mockResolvedValue(onlineOrder());
    fixture.verifyPayment.mockResolvedValue(verified());
    fixture.finalizePaidOrder.mockResolvedValue({ success: true, data: { id: "ord_paid_b2" } });
    fixture.openCheckout.mockImplementation(
      async (handlers: {
        onSuccess: (r: Record<string, unknown>) => Promise<void>;
        onFailure: (e: unknown) => void;
        onCancel: () => void;
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
    await startOnline();
    const click = act(async () => payButton().click());
    await started.promise;

    const original = fixture.cartState.lines;
    fixture.cartState.lines = [...original, { ...original[0], lineId: "l2", productId: "p2" }];
    reply.resolve(undefined);
    await click;
    await act(async () => {});

    expect(usePaymentStore.getState().status).not.toBe("failed");
    expect(fixture.toast.error).not.toHaveBeenCalled();
    expect(fixture.cart.clear).not.toHaveBeenCalled();
    expect(fixture.navigate).not.toHaveBeenCalled();
    expect(payButton().disabled).toBe(false);
  });

  it("a gateway cancel from a superseded submission publishes nothing", async () => {
    const { started, reply } = armCallbacks("cancel");
    await startOnline();
    const click = act(async () => payButton().click());
    await started.promise;

    const original = fixture.cartState.lines;
    fixture.cartState.lines = [...original, { ...original[0], lineId: "l2", productId: "p2" }];
    reply.resolve(undefined);
    await click;
    await act(async () => {});

    expect(usePaymentStore.getState().status).not.toBe("cancelled");
    expect(fixture.toast.info).not.toHaveBeenCalled();
    expect(fixture.cart.clear).not.toHaveBeenCalled();
    expect(fixture.navigate).not.toHaveBeenCalled();
    expect(payButton().disabled).toBe(false);
  });

  it("an old cancel callback cannot release a newer attempt's guard", async () => {
    const opened = [signal(), signal()];
    const replies = [deferred(), deferred()];
    const handlers: Array<{
      onSuccess: (r: Record<string, unknown>) => Promise<void>;
      onFailure: (e: unknown) => void;
      onCancel: () => void;
    }> = [];
    fixture.createPaymentOrder.mockResolvedValue(onlineOrder());
    fixture.verifyPayment.mockResolvedValue(verified());
    fixture.finalizePaidOrder.mockResolvedValue({ success: true, data: { id: "ord_paid_b2" } });
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
    await startOnline();
    const firstClick = act(async () => payButton().click());
    await opened[0].promise;

    // The stale old failure releases ONLY attempt 1's guard.
    replies[0].resolve("failure");
    await firstClick;
    await act(async () => {});
    expect(usePaymentStore.getState().status).toBe("failed");
    expect(payButton().disabled).toBe(false);

    // A newer deferred attempt takes the guard and opens a second gateway.
    const secondClick = act(async () => payButton().click());
    await opened[1].promise;
    expect(fixture.createPaymentOrder).toHaveBeenCalledTimes(2);
    expect(fixture.openCheckout).toHaveBeenCalledTimes(2);
    expect(usePaymentStore.getState().status).toBe("waiting");

    // The old cancel arrives late: newer guard and status stay held.
    await act(async () => {
      handlers[0].onCancel();
    });
    expect(usePaymentStore.getState().status).toBe("waiting");
    expect(fixture.toast.info).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Processing Order...");
    expect(fixture.createPaymentOrder).toHaveBeenCalledTimes(2);
    expect(fixture.openCheckout).toHaveBeenCalledTimes(2);

    replies[1].resolve("none");
    await secondClick;
    await act(async () => {});
  });

  it("a create-order throw after a cart edit releases busy without publishing", async () => {
    const started = signal();
    const reply = deferred();
    fixture.createPaymentOrder.mockImplementation(async () => {
      started.resolve();
      await reply.promise;
      throw new Error("gateway create failed");
    });
    await startOnline();
    const click = act(async () => payButton().click());
    await started.promise;

    const original = fixture.cartState.lines;
    fixture.cartState.lines = [...original, { ...original[0], lineId: "l2", productId: "p2" }];
    reply.resolve(undefined);
    await click;
    await act(async () => {});

    expect(usePaymentStore.getState().status).not.toBe("failed");
    expect(fixture.toast.error).not.toHaveBeenCalled();
    expect(payButton().disabled).toBe(false);
    expect(fixture.cartState.lines).toHaveLength(2);
  });
});
