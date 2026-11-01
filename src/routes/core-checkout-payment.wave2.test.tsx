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
    // R8: a ready server quote so these CUS-06/07/08/09 flows are not gated by
    // the quote state machine (which has its own suite).
    checkoutFees: {
      status: "ready" as const,
      orderType: "delivery" as const,
      packagingFee: 20,
      deliveryFee: 0,
      deliveryQuoteId: "q_wave2",
      provider: "borzo",
      expiresAt: 9_999_999_999_999,
    },
    setOrderNotes: vi.fn(),
    setTableNumber: vi.fn(),
    setLoyaltyPointsToRedeem: vi.fn(),
  };
  const noop = vi.fn();
  const quote = {
    status: "ready" as string,
    payEnabled: true,
    showDeliveryFee: true,
    showTotal: true,
    deliveryFee: 0,
    packagingFee: 20,
    deliveryQuoteId: "q_wave2",
    expiresAt: 9_999_999_999_999,
    message: null as string | null,
    canRetry: false,
    storeNotLinked: false,
    takeawaySelectable: true,
  };
  return {
    lines,
    cartState,
    checkoutState,
    quote,
    fulfillment: "delivery" as "delivery" | "takeaway" | "dinein",
    refreshQuote: vi.fn(async () => checkoutState.checkoutFees),
    createFromCurrentContext: vi.fn(async () => ({ success: true, data: { id: "ord_1" } })),
    cart: {
      calculateTotals: vi.fn(),
      validateCart: vi.fn(async () => ({
        success: true,
        data: { valid: true, issues: [] },
      })),
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
vi.mock("@/features/checkout", () => {
  return {
    useCheckoutStore: Object.assign(
      (select: (s: typeof fixture.checkoutState) => unknown) => select(fixture.checkoutState),
      { getState: () => fixture.checkoutState },
    ),
    // R8: these flows run against a live server quote; its own state machine is
    // covered by tests/checkout/delivery-quote.test.ts.
    useCheckoutFees: () => ({
      state: fixture.checkoutState.checkoutFees,
      view: fixture.quote,
      refresh: fixture.refreshQuote,
    }),
    deliveryQuoteView: () => fixture.quote,
    isDeliveryQuoteRefusal: (code: string | null | undefined) =>
      code === "DELIVERY_QUOTE_EXPIRED" || code === "DELIVERY_QUOTE_REQUIRED",
    AddressSelector: () => null,
    FulfillmentDetailsCard: () => null,
    PaymentMethodSelector: () => null,
    ReviewItemsList: () => null,
    calculateHaversineKm: () => 0,
  };
});
vi.mock("@/features/checkout/components/QuickAuthSheet", () => ({ QuickAuthSheet: () => null }));
vi.mock("@/features/stores/state/storeStore", () => {
  const state = {
    activeStore: { id: "store-A", name: "Surat Vesu", lat: 21.15, lng: 72.77 },
    fulfillment: fixture.fulfillment,
    setFulfillment: fixture.setFulfillment,
  };
  return {
    useStoreSelection: Object.assign((select: (s: typeof state) => unknown) => select(state), {
      getState: () => state,
    }),
    storeSupportsFulfillment: () => true,
  };
});
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
vi.mock("@/features/addresses", () => {
  const address = {
    id: "addr_1",
    label: "Home",
    line1: "1 Test Road",
    line2: "",
    city: "Surat",
    state: "Gujarat",
    pincode: "395007",
    lat: 21.15,
    lng: 72.77,
    contactName: "Test Customer",
    contactPhone: "+910000000000",
  };
  return {
    useAddressStore: (select: (s: unknown) => unknown) =>
      select({ items: [address], selectedId: address.id }),
    selectAddresses: () => [address],
    selectSelectedAddress: () => address,
  };
});
vi.mock("@/features/loyalty/state/loyaltyStore", () => ({
  useLoyaltyStore: Object.assign(
    (select: (s: { balance: number }) => unknown) => select({ balance: 0 }),
    {
      getState: () => ({ refreshFromServer: vi.fn() }),
    },
  ),
}));
vi.mock("@/features/orders", () => ({
  orderRepository: {
    createFromCurrentContext: fixture.createFromCurrentContext,
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
  fixture.refreshQuote.mockClear();
  fixture.createFromCurrentContext.mockClear();
  // R8: every test starts from a live, ready quote unless it overrides it.
  fixture.quote.status = "ready";
  fixture.quote.payEnabled = true;
  fixture.quote.showDeliveryFee = true;
  fixture.quote.showTotal = true;
  fixture.quote.deliveryFee = 0;
  fixture.quote.packagingFee = 20;
  fixture.quote.message = null;
  fixture.quote.canRetry = false;
  fixture.quote.storeNotLinked = false;
  fixture.quote.takeawaySelectable = true;
  fixture.fulfillment = "delivery";
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

/**
 * CUS-07 — after CUS-06 the persist failure is gone, but the investigator's
 * unproven hypothesis was that the Pay button then wedges: `payInFlight` is
 * set synchronously before the preflight, and it was only released by a
 * TERMINAL payment status. A preflight that REJECTS (instead of returning a
 * typed failure) therefore left status "preparing" + guard held forever, and
 * every later tap returned silently at the guard.
 */
describe("CUS-07 — a failing preflight never wedges the Pay button", () => {
  it("releases the re-entry guard when validateForPayment rejects, so the customer can retry", async () => {
    const preflightLog = vi.spyOn(console, "error").mockImplementation(() => {});
    fixture.cart.calculateTotals.mockResolvedValue(okTotals(199));
    // A genuine rejection (not a typed ApiResult failure): repository/store
    // read threw. This is the documented wedge window.
    fixture.validateForPayment.mockRejectedValue(new Error("preflight blew up"));

    await mount(PaymentPage);
    const pay = buttonWithText("Pay Online");
    expect(pay?.disabled).toBe(false);
    await act(async () => pay!.click());
    await act(async () => {});

    // The screen must leave the busy state and offer the retry affordance …
    expect(usePaymentStore.getState().status).toBe("failed");
    const retryButton = buttonWithText("Retry checkout");
    expect(retryButton).toBeDefined();
    expect(retryButton?.disabled).toBe(false);

    // … and the next tap must actually re-run the preflight (guard released),
    // instead of returning silently at `if (payInFlight.current) return`.
    await act(async () => retryButton!.click());
    await act(async () => {});
    expect(fixture.validateForPayment).toHaveBeenCalledTimes(2);
    expect(preflightLog).toHaveBeenCalled();
  });

  it("still blocks a second tap while a payment is genuinely in flight", async () => {
    fixture.cart.calculateTotals.mockResolvedValue(okTotals(199));
    fixture.validateForPayment.mockResolvedValue({
      success: true,
      data: { valid: true, issues: [] },
    });
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    fixture.createPaymentOrder.mockReturnValue(
      gate.then(() => ({
        success: false as const,
        error: { code: "TEST_STOP", message: "stop here" },
      })),
    );

    await mount(PaymentPage);
    const pay = buttonWithText("Pay Online");
    expect(pay?.disabled).toBe(false);
    // Two taps in the same tick: React has not re-rendered the busy button yet,
    // so the DOM still delivers the second click to startPayment.
    await act(async () => {
      pay!.click();
      pay!.click();
    });
    expect(fixture.createPaymentOrder).toHaveBeenCalledTimes(1);

    release?.();
    await act(async () => {});
  });
});

/**
 * CUS-09 — the last link before Razorpay.
 *
 * Live run 3: the order was created and createPaymentOrder returned a Razorpay
 * order for 26 against a displayed 30. The customer accepted the new total and
 * the acceptance path re-ran the place-order flow, which wrote the SAME
 * `orders/{id}` again — an update, denied by firestore.rules — so the client
 * reported PERSIST_FAILED and Razorpay never opened.
 *
 * Acceptance must CONTINUE from the order that already exists: one
 * createPaymentOrder (one internal doc, one gateway order), one openCheckout,
 * on the SERVER's amount.
 */
describe("CUS-09 — accepting a reprice continues with the already-created order", () => {
  const serverOrder = {
    orderId: "order_rzp_created",
    razorpayOrderId: "order_rzp_created",
    amount: 26,
    currency: "INR" as const,
    receipt: "rcpt_cus09",
    keyId: "rzp_test_cus09",
  };

  beforeEach(() => {
    fixture.cart.calculateTotals.mockResolvedValue(okTotals(30));
    fixture.validateForPayment.mockResolvedValue({
      success: true,
      data: { valid: true, issues: [] },
    });
    fixture.createPaymentOrder.mockResolvedValue({ success: true, data: serverOrder });
    fixture.openCheckout.mockResolvedValue(undefined);
  });

  function dialogButton(text: string): HTMLButtonElement | undefined {
    return Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.includes(text),
    );
  }

  async function raiseRepricePrompt() {
    await mount(PaymentPage);
    const pay = buttonWithText("Pay Online");
    expect(pay?.disabled).toBe(false);
    await act(async () => pay!.click());
    await act(async () => {});
    expect(document.body.textContent).toContain("Continue with the updated amount?");
  }

  it("does not re-run the create path: one createPaymentOrder, one openCheckout on the server amount", async () => {
    await raiseRepricePrompt();
    expect(fixture.createPaymentOrder).toHaveBeenCalledTimes(1);
    expect(fixture.openCheckout).not.toHaveBeenCalled();

    const cont = dialogButton("Continue");
    expect(cont).toBeDefined();
    await act(async () => cont!.click());
    await act(async () => {});

    // No second place-order (no second orders/{id} write) and no second
    // Razorpay order.
    expect(fixture.createPaymentOrder).toHaveBeenCalledTimes(1);
    expect(fixture.openCheckout).toHaveBeenCalledTimes(1);
    // Opened on the EXISTING gateway order and the SERVER's amount (26), never
    // the stale displayed total (30).
    const init = (fixture.initializeRazorpay.mock.calls as unknown[][])[0]?.[0] as {
      order: { orderId: string; amount: number };
    };
    expect(init.order.orderId).toBe("order_rzp_created");
    expect(init.order.amount).toBe(26);
    expect(usePaymentStore.getState().status).toBe("waiting");
  });

  it("declining leaves the customer able to retry, and retrying re-prompts without a second order", async () => {
    await raiseRepricePrompt();

    const cancel = dialogButton("Cancel");
    expect(cancel).toBeDefined();
    await act(async () => cancel!.click());
    await act(async () => {});

    // No stuck guard: the prompt is closed, nothing opened, Pay is usable.
    expect(document.body.textContent).not.toContain("Continue with the updated amount?");
    expect(usePaymentStore.getState().status).toBe("idle");
    expect(fixture.openCheckout).not.toHaveBeenCalled();
    const payAgain = buttonWithText("Pay Online");
    expect(payAgain?.disabled).toBe(false);

    // Tapping Pay again must NOT create a second order/gateway order — it
    // re-offers the same server total.
    await act(async () => payAgain!.click());
    await act(async () => {});
    expect(fixture.createPaymentOrder).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain("Continue with the updated amount?");

    // Accepting now opens the one existing order exactly once.
    await act(async () => dialogButton("Continue")!.click());
    await act(async () => {});
    expect(fixture.createPaymentOrder).toHaveBeenCalledTimes(1);
    expect(fixture.openCheckout).toHaveBeenCalledTimes(1);
  });

  it("a second tap on Continue does not open a second checkout", async () => {
    await raiseRepricePrompt();

    const cont = dialogButton("Continue")!;
    await act(async () => {
      cont.click();
      cont.click();
    });
    await act(async () => {});

    expect(fixture.openCheckout).toHaveBeenCalledTimes(1);
    expect(fixture.createPaymentOrder).toHaveBeenCalledTimes(1);
  });

  it("a genuine first-attempt persist failure still surfaces PERSIST_FAILED", async () => {
    const message =
      "We couldn't save your order, so the kitchen never received it. " +
      "Please try again — no duplicate order will be created.";
    fixture.createPaymentOrder.mockResolvedValue({
      success: false,
      error: { code: "PERSIST_FAILED", message, retryable: true },
    });

    await mount(PaymentPage);
    await act(async () => buttonWithText("Pay Online")!.click());
    await act(async () => {});

    expect(usePaymentStore.getState().status).toBe("failed");
    expect(usePaymentStore.getState().failure?.code).toBe("PERSIST_FAILED");
    expect(container.textContent).toContain("We couldn't save your order");
    expect(fixture.openCheckout).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("Continue with the updated amount?");
  });
});

/**
 * D-01 — the server refuses to open a gateway order for an outlet that is not
 * linked to a partner branch (HTTP 409, code STORE_NOT_LINKED). The customer
 * must see the server's own sentence and must NOT be invited to keep retrying
 * payment, and the failure must not be dressed up as "payment received".
 */
describe("D-01 — STORE_NOT_LINKED is shown honestly and is not retryable", () => {
  const serverMessage = "This outlet isn't taking online orders yet.";

  beforeEach(() => {
    fixture.cart.calculateTotals.mockResolvedValue(okTotals(199));
    fixture.validateForPayment.mockResolvedValue({
      success: true,
      data: { valid: true, issues: [] },
    });
    fixture.createPaymentOrder.mockResolvedValue({
      success: false,
      error: { code: "STORE_NOT_LINKED", message: serverMessage, retryable: false },
    });
  });

  it("payment screen: server copy, no Retry, pay button stays disabled", async () => {
    await mount(PaymentPage);
    const pay = buttonWithText("Pay Online");
    expect(pay?.disabled).toBe(false);
    await act(async () => pay!.click());
    await act(async () => {});

    expect(container.textContent).toContain(serverMessage);
    expect(container.textContent).not.toContain(
      "The payment couldn't be started. Please try again.",
    );
    // Never claim money was received: nothing was charged and no gateway order
    // exists for a refused create.
    expect(container.textContent).not.toContain("Payment received");
    const retry = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Retry",
    );
    expect(retry, "a retryable CTA must not be offered").toBeUndefined();
    expect(fixture.openCheckout).not.toHaveBeenCalled();
    const unavailable = buttonWithText("Ordering unavailable");
    expect(unavailable?.disabled).toBe(true);
  });

  it("checkout screen: server copy, PAY disabled, no retry invite", async () => {
    await mount(CheckoutPage);
    const pay = buttonWithText("PAY");
    expect(pay?.disabled).toBe(false);
    await act(async () => pay!.click());
    await act(async () => {});

    expect(container.textContent).toContain(serverMessage);
    expect(fixture.openCheckout).not.toHaveBeenCalled();
    const after = buttonWithText("ONLINE ORDERING UNAVAILABLE");
    expect(after?.disabled).toBe(true);
  });

  it("clears the online refusal when the customer switches to cash", async () => {
    await mount(CheckoutPage);
    await act(async () => buttonWithText("PAY")!.click());
    await act(async () => {});
    expect(buttonWithText("ONLINE ORDERING UNAVAILABLE")?.disabled).toBe(true);

    // A different payment method is a new path to place the order; the online
    // refusal must not keep the button dead forever.
    await act(async () => {
      usePaymentStore.getState().setMethod("cash");
    });

    const after = buttonWithText("PAY");
    expect(after, "PAY should be offered again for cash").toBeDefined();
    expect(after?.disabled).toBe(false);
    expect(buttonWithText("ONLINE ORDERING UNAVAILABLE")).toBeUndefined();

    // Switching back to online may re-attempt: the server answers 409 again.
    await act(async () => {
      usePaymentStore.getState().setMethod("online");
    });
    expect(buttonWithText("PAY")?.disabled).toBe(false);
    await act(async () => buttonWithText("PAY")!.click());
    await act(async () => {});
    expect(fixture.createPaymentOrder).toHaveBeenCalledTimes(2);
    expect(buttonWithText("ONLINE ORDERING UNAVAILABLE")?.disabled).toBe(true);
  });
});

/**
 * CUS-11 — after accepting the server's reprice the To Pay bar behind the
 * Razorpay sheet must show the accepted server amount, not the stale client
 * estimate (live: bar 30.00, Razorpay 26.00).
 */
describe("CUS-11 — accepted server amount replaces the stale To Pay bar", () => {
  const serverOrder = {
    orderId: "order_rzp_26",
    razorpayOrderId: "order_rzp_26",
    amount: 26,
    currency: "INR" as const,
    receipt: "rcpt_cus11",
    keyId: "rzp_test_cus11",
  };

  beforeEach(() => {
    fixture.cart.calculateTotals.mockResolvedValue(okTotals(30));
    fixture.validateForPayment.mockResolvedValue({
      success: true,
      data: { valid: true, issues: [] },
    });
    fixture.createPaymentOrder.mockResolvedValue({ success: true, data: serverOrder });
    fixture.openCheckout.mockResolvedValue(undefined);
  });

  function toPayBar(): HTMLElement | undefined {
    const label = Array.from(container.querySelectorAll("span")).find(
      (el) => el.textContent?.trim() === "To Pay",
    );
    return label?.parentElement ?? undefined;
  }

  it("shows the accepted 26.00, not the 30.00 estimate", async () => {
    await mount(PaymentPage);
    expect(toPayBar()?.textContent).toContain("30.00");

    const pay = buttonWithText("Pay Online");
    expect(pay?.disabled).toBe(false);
    await act(async () => pay!.click());
    await act(async () => {});
    expect(document.body.textContent).toContain("Continue with the updated amount?");

    const cont = Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Continue"),
    );
    expect(cont).toBeDefined();
    await act(async () => cont!.click());
    await act(async () => {});

    expect(fixture.openCheckout).toHaveBeenCalledTimes(1);
    expect(toPayBar()?.textContent).toContain("26.00");
    expect(toPayBar()?.textContent).not.toContain("30.00");
  });

  it("checkout bar also switches to the accepted amount behind Razorpay", async () => {
    await mount(CheckoutPage);
    const checkoutBar = () => {
      const label = Array.from(container.querySelectorAll("p")).find(
        (el) => el.textContent?.trim() === "To Pay",
      );
      return label?.parentElement ?? undefined;
    };
    expect(checkoutBar()?.textContent).toContain("30.00");

    const pay = buttonWithText("PAY");
    expect(pay?.disabled).toBe(false);
    await act(async () => pay!.click());
    await act(async () => {});
    expect(document.body.textContent).toContain("Continue with the updated amount?");

    const cont = Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Continue"),
    );
    expect(cont).toBeDefined();
    await act(async () => cont!.click());
    await act(async () => {});

    expect(fixture.openCheckout).toHaveBeenCalledTimes(1);
    expect(checkoutBar()?.textContent).toContain("26.00");
    expect(checkoutBar()?.textContent).not.toContain("30.00");
  });
});

/**
 * R8 — payment is gated on a LIVE server delivery quote. The quote state
 * machine itself is unit-tested in tests/checkout/delivery-quote.test.ts; this
 * block proves the route wiring: no payment starts on a stale quote, a 409
 * re-quotes and surfaces the new figure, and cash follows the same gate.
 */
describe("R8 — payment is gated on a live delivery quote", () => {
  const serverOrder = {
    orderId: "order_rzp_r8",
    razorpayOrderId: "order_rzp_r8",
    amount: 30,
    currency: "INR" as const,
    receipt: "rcpt_r8",
    keyId: "rzp_test_r8",
  };

  beforeEach(() => {
    fixture.cart.calculateTotals.mockResolvedValue(okTotals(30));
    fixture.validateForPayment.mockResolvedValue({
      success: true,
      data: { valid: true, issues: [] },
    });
    fixture.createPaymentOrder.mockResolvedValue({ success: true, data: serverOrder });
    fixture.openCheckout.mockResolvedValue(undefined);
  });

  it("does not start a payment when the quote expired while the screen sat open", async () => {
    await mount(PaymentPage);
    expect(buttonWithText("Pay Online")?.disabled).toBe(false);

    // The quote lapses before the tap. The handler must read the CURRENT state,
    // not the one rendered a minute ago.
    fixture.quote.status = "loading";
    fixture.quote.payEnabled = false;
    fixture.quote.message = "Getting delivery price";

    await act(async () => buttonWithText("Pay Online")!.click());
    await act(async () => {});

    expect(fixture.createPaymentOrder).not.toHaveBeenCalled();
    expect(fixture.openCheckout).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Getting delivery price");
    expect(fixture.refreshQuote).toHaveBeenCalled();
  });

  it("re-quotes after 409 DELIVERY_QUOTE_EXPIRED and shows the updated price dialog", async () => {
    fixture.cart.calculateTotals
      .mockResolvedValueOnce(okTotals(30))
      .mockResolvedValue(okTotals(36));
    fixture.createPaymentOrder.mockResolvedValue({
      success: false,
      error: {
        code: "DELIVERY_QUOTE_EXPIRED",
        message: "Delivery quote expired.",
        retryable: true,
      },
    });

    await mount(PaymentPage);
    await act(async () => buttonWithText("Pay Online")!.click());
    await act(async () => {});

    // Re-quoted once, nothing opened on the stale amount, new total surfaced.
    expect(fixture.refreshQuote).toHaveBeenCalledTimes(1);
    expect(fixture.createPaymentOrder).toHaveBeenCalledTimes(1);
    expect(fixture.openCheckout).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Continue with the updated amount?");
    expect(document.body.textContent).toContain("36.00");
    expect(usePaymentStore.getState().status).toBe("idle");

    // Accepting the re-quoted figure starts ONE create against the new quote
    // and opens the gateway on the server's amount.
    fixture.createPaymentOrder.mockResolvedValue({
      success: true,
      data: { ...serverOrder, amount: 36 },
    });
    const cont = Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Continue"),
    );
    expect(cont).toBeDefined();
    await act(async () => cont!.click());
    await act(async () => {});

    expect(fixture.createPaymentOrder).toHaveBeenCalledTimes(2);
    expect(fixture.openCheckout).toHaveBeenCalledTimes(1);
    const init = (fixture.initializeRazorpay.mock.calls as unknown[][])[0]?.[0] as {
      order: { amount: number };
    };
    expect(init.order.amount).toBe(36);
  });

  it("cash on delivery is gated by the same quote states", async () => {
    await mount(PaymentPage);
    await act(async () => usePaymentStore.getState().setMethod("cash"));

    fixture.quote.status = "error";
    fixture.quote.payEnabled = false;
    fixture.quote.message = "Delivery isn't available to this address";

    await act(async () => buttonWithText("Place COD Order")!.click());
    await act(async () => {});

    expect(fixture.createFromCurrentContext).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Delivery isn't available to this address");
  });

  it("cash on delivery proceeds once the quote is ready", async () => {
    await mount(PaymentPage);
    await act(async () => usePaymentStore.getState().setMethod("cash"));
    await act(async () => buttonWithText("Place COD Order")!.click());
    await act(async () => {});

    expect(fixture.createFromCurrentContext).toHaveBeenCalledTimes(1);
    expect(fixture.createPaymentOrder).not.toHaveBeenCalled();
  });

  it("shows an unlinked outlet honestly, with no retry or gateway", async () => {
    fixture.quote.payEnabled = false;
    fixture.quote.status = "error";
    fixture.quote.message = "This outlet isn't taking online orders yet.";
    fixture.quote.canRetry = false;
    fixture.quote.storeNotLinked = true;

    await mount(CheckoutPage);

    const pay = buttonWithText("ONLINE ORDERING UNAVAILABLE");
    expect(pay).toBeDefined();
    expect(pay?.disabled).toBe(true);
    expect(container.textContent).toContain("This outlet isn't taking online orders yet.");
    // A retry can never work at an unlinked outlet.
    expect(buttonWithText("Retry")).toBeUndefined();

    await act(async () => pay!.click());
    await act(async () => {});
    expect(fixture.createPaymentOrder).not.toHaveBeenCalled();
    expect(fixture.openCheckout).not.toHaveBeenCalled();
  });

  it("words a takeaway fee failure without mentioning delivery", async () => {
    fixture.fulfillment = "takeaway";
    fixture.quote.status = "error";
    fixture.quote.payEnabled = false;
    fixture.quote.message = "We couldn't load your order price. Please try again.";
    fixture.quote.canRetry = true;
    fixture.quote.storeNotLinked = false;
    fixture.quote.takeawaySelectable = false;

    await mount(CheckoutPage);

    const pay = buttonWithText("PAY — PRICE UNAVAILABLE");
    expect(pay).toBeDefined();
    expect(pay?.disabled).toBe(true);
    expect(pay?.textContent ?? "").not.toMatch(/delivery/i);

    const retry = buttonWithText("Retry");
    expect(retry).toBeDefined();
    const banner = retry!.closest('[role="status"]');
    expect(banner?.textContent).toContain("We couldn't load your order price");
    expect(banner?.textContent ?? "").not.toMatch(/delivery/i);
  });

  it("checkout re-quotes on 409 DELIVERY_QUOTE_REQUIRED and shows the new figure", async () => {
    fixture.cart.calculateTotals
      .mockResolvedValueOnce(okTotals(30))
      .mockResolvedValue(okTotals(36));
    fixture.createPaymentOrder.mockResolvedValue({
      success: false,
      error: {
        code: "DELIVERY_QUOTE_REQUIRED",
        message: "A delivery quote is required.",
        retryable: true,
      },
    });

    await mount(CheckoutPage);
    await act(async () => buttonWithText("PAY")!.click());
    await act(async () => {});

    expect(fixture.refreshQuote).toHaveBeenCalledTimes(1);
    expect(fixture.createPaymentOrder).toHaveBeenCalledTimes(1);
    expect(fixture.openCheckout).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Continue with the updated amount?");
    expect(document.body.textContent).toContain("36.00");
  });
});
