/** @vitest-environment jsdom */
/**
 * Checkout quote-status slot (Core Web Vitals CLS).
 *
 * Measured (ui-independent-defect-review.md, Finding 2): the quote banner
 * MOUNTED mid-hydration (+141px at t~700) and UNMOUNTED when the quote became
 * ready (-141px at t~1956), which is the largest contributor to the 0.309 /
 * 0.439 / 0.439 session-window CLS.
 *
 * The fix is a reserved footprint, not different copy: one slot is rendered for
 * the whole delivery session and the message swaps inside it. The existing
 * `min-h-[11.5rem]` address reservation and the `min-h-[1.75rem]` fee rows are
 * the settled page and are asserted unchanged by
 * `checkout.layout-stability.test.tsx`; nothing here touches them.
 *
 * What this suite holds:
 *   - the slot exists while the quote is loading, ready, unserviceable and
 *     in error (so ready cannot collapse the space loading needed);
 *   - the slot's reserved height is identical across those states;
 *   - genuine failure states still show their message, retry and the takeaway
 *     escape, and the announcement is still a polite live region;
 *   - a ready quote shows no warning copy at all.
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const fixture = vi.hoisted(() => ({
  calculateTotals: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
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
vi.mock("@/features/cart", () => {
  const cartState = {
    lines: [{ lineId: "l1", name: "Test Burger", quantity: 1, unitPrice: 249 }],
    promo: null,
    priceLockExpiresAt: null,
  };
  return {
    cartRepository: {
      calculateTotals: fixture.calculateTotals,
      validateCart: vi.fn(),
      clear: vi.fn(async () => ({ success: true })),
    },
    useCartStore: Object.assign(
      (select: (s: typeof cartState) => unknown) => select(cartState),
      { getState: () => cartState },
    ),
    selectItemCount: (s: { lines: unknown[] }) => s.lines.length,
    PromoInput: () => null,
  };
});
vi.mock("@/features/checkout/services/checkoutQuote", () => ({
  // The store is seeded directly; the coordinator must not race this suite.
  quoteCheckoutFees: vi.fn(async () => ({ status: "ready" })),
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
    user: { id: "cust_cls", name: "Test Customer", phone: "+910000000000" },
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
    id: "addr_cls",
    label: "home",
    line1: "1 Test Street",
    city: "Surat",
    pincode: "395007",
    lat: 21.15,
    lng: 72.77,
  };
  return {
    useAddressStore: (select: (s: unknown) => unknown) =>
      select({ addresses: [address], selectedId: address.id, select: vi.fn() }),
    selectAddresses: () => [address],
    selectSelectedAddress: () => address,
    // No repository on this double: checkout's optional call must survive it.
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
    createFromCurrentContext: vi.fn(),
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
      createPaymentOrder: vi.fn(),
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

import { useStoreSelection } from "@/features/stores/state/storeStore";
import { useCheckoutStore } from "@/features/checkout";
import { usePaymentStore } from "@/features/payments/state/paymentStore";
import type { Store } from "@/features/stores/models/Store";
import { Route as CheckoutRoute } from "./checkout";

const CheckoutPage = (CheckoutRoute as unknown as { options: { component: React.ComponentType } })
  .options.component;

const store: Store = {
  id: "str_cls",
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

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  fixture.calculateTotals.mockResolvedValue({
    success: true,
    data: {
      subtotal: 249,
      taxes: 0,
      packingFee: 0,
      deliveryFee: 0,
      promoDiscount: 0,
      loyaltyDiscount: 0,
      grandTotal: 249,
    },
  });
  usePaymentStore.getState().reset();
  useCheckoutStore.getState().reset();
  useStoreSelection.setState({
    activeStore: store,
    fulfillment: "delivery",
    fulfillmentStatus: "selected",
    isHydrated: true,
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

async function mountWithQuote(checkoutFees: unknown) {
  useCheckoutStore.setState({ checkoutFees } as never);
  await act(async () => root.render(<CheckoutPage />));
  await act(async () => {
    await Promise.resolve();
  });
}

const quoteSlot = () => container.querySelector<HTMLElement>("[data-quote-status-slot]");
const text = () => container.textContent ?? "";

const LOADING = { status: "idle" } as const;
const READY = {
  status: "ready",
  orderType: "delivery",
  packagingFee: 20,
  deliveryFee: 0,
  deliveryQuoteId: "q_cls",
  provider: "test",
  expiresAt: Date.now() + 3_600_000,
} as const;
const UNSERVICEABLE = { status: "unserviceable", orderType: "delivery" } as const;
const FAILED = {
  status: "error",
  orderType: "delivery",
  code: "QUOTE_UNAVAILABLE",
  message: "We couldn't load your order price. Please try again.",
} as const;

describe("quote status reserves its footprint across the whole session", () => {
  it.each([
    ["loading", LOADING],
    ["ready", READY],
    ["unserviceable", UNSERVICEABLE],
    ["error", FAILED],
  ])("renders the reserved slot while the quote is %s", (_label, state) => {
    // The slot is the contract: it must exist in every state, not only the
    // ones that have copy, or "ready" collapses 141px of reserved space.
    return mountWithQuote(state).then(() => {
      expect(quoteSlot()).not.toBeNull();
    });
  });

  it("reserves the same height in every state", async () => {
    const heights: Array<string | undefined> = [];
    for (const state of [LOADING, READY, UNSERVICEABLE, FAILED]) {
      await act(async () => root.unmount());
      container.remove();
      container = document.createElement("div");
      document.body.append(container);
      root = createRoot(container);
      await mountWithQuote(state);
      const slot = quoteSlot();
      expect(slot).not.toBeNull();
      heights.push(/(?:^|\s)(min-h-\[[^\]]+\])/.exec(slot!.className)?.[1]);
    }
    // A real reservation, identical in all four states.
    expect(heights[0]).toBeTruthy();
    expect(new Set(heights).size).toBe(1);
  });

  it("keeps the loading announcement and its message", async () => {
    await mountWithQuote(LOADING);
    const slot = quoteSlot()!;
    expect(slot.getAttribute("role")).toBe("status");
    expect(slot.getAttribute("aria-live")).toBe("polite");
    expect(text()).toContain("Getting delivery price");
  });

  it("shows no warning copy once the quote is ready, but keeps the space", async () => {
    await mountWithQuote(READY);
    const slot = quoteSlot()!;
    expect(text()).not.toContain("Getting delivery price");
    expect(text()).not.toContain("Delivery isn't available to this address");
    // Still reserved, still an empty (non-announcing) region rather than a
    // removed one.
    expect(slot.className).toMatch(/min-h-\[[^\]]+\]/);
    expect(slot.textContent?.trim() ?? "").toBe("");
  });

  it("keeps the retry action and the takeaway escape on a failed quote", async () => {
    await mountWithQuote(FAILED);
    expect(text()).toContain("Delivery isn't available to this address");
    const retry = Array.from(container.querySelectorAll("button")).find(
      (b) => (b.textContent ?? "").trim() === "Retry",
    );
    const takeaway = Array.from(container.querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").includes("Switch to Takeaway"),
    );
    expect(retry).toBeDefined();
    expect(takeaway).toBeDefined();
  });

  it("keeps takeaway's own packaging-pending banner independent of the delivery slot", async () => {
    useStoreSelection.setState({ fulfillment: "takeaway", fulfillmentStatus: "selected" });
    await mountWithQuote({ status: "idle" });
    // Non-delivery was never part of the measured CLS; its honest
    // "still getting your order price" banner must survive unchanged.
    expect(text()).toContain("Getting your order price");
  });
});
