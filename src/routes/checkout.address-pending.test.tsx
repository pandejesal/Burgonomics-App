/** @vitest-environment jsdom */
/**
 * Checkout wiring — the delivery card must not render "no address" mid-read.
 *
 * Finding 2 of ui-independent-defect-review.md puts one CLS source at the
 * fulfilment card: it painted "No delivery address selected" + "+ Add Address"
 * (41px, `prev 803h41 -> curr 0`) before the saved-address read answered, then
 * unmounted that row and changed height (195 -> 160) when the address resolved.
 *
 * The card owns the presentation (`FulfillmentDetailsCard.loading.test.tsx`);
 * this suite owns the route wiring. The read's own state has to reach the card,
 * and the pending flag has to flip the moment the read settles, in both
 * directions — including from the cache-first path where the address is already
 * in the store before the read returns.
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const fixture = vi.hoisted(() => ({
  calculateTotals: vi.fn(),
  navigate: vi.fn(),
  hydrate: vi.fn(),
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
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
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
    user: { id: "cust_pending", name: "Test Customer", phone: "+910000000000" },
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
// The REAL address store, so a resolution actually re-renders the page; only
// the network read behind `hydrate` is faked. `hydrate` seeds the store the way
// the real repository does, otherwise a "settled with address" assertion could
// never pass no matter how correct the route is.
vi.mock("@/features/addresses", async () => {
  const { create } = await import("zustand");
  const useAddressStore = create<{
    addresses: Array<{ id: string }>;
    selectedId: string | null;
    select: (id: string | null) => void;
  }>()((set) => ({
    addresses: [],
    selectedId: null,
    select: (id: string | null) => set({ selectedId: id }),
  }));
  fixture.hydrate.mockImplementation(async () => ({ success: true, data: [] }));
  return {
    useAddressStore,
    selectAddresses: (s: { addresses: unknown[] }) => s.addresses,
    selectSelectedAddress: (s: {
      addresses: Array<{ id: string }>;
      selectedId: string | null;
    }) => s.addresses.find((a) => a.id === s.selectedId) ?? null,
    addressRepository: {
      hydrate: async () => {
        const result = await fixture.hydrate();
        const rows = (result?.data ?? []) as Array<{ id: string; isDefault?: boolean }>;
        if (result?.success && rows.length > 0) {
          // Mirror the real repository's seed: rows land in the store and the
          // account default (or the first row) becomes the selection.
          const defaultId = rows.find((row) => row.isDefault)?.id ?? rows[0].id;
          useAddressStore.setState({ addresses: rows, selectedId: defaultId });
        }
        // The route reads only `success`/`error`; `{ seeded }` is the real
        // repository's payload shape and is irrelevant to this contract.
        return { success: result?.success ?? true, error: result?.error };
      },
    },
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
import { useAddressStore } from "@/features/addresses";
import type { Store } from "@/features/stores/models/Store";
import { Route as CheckoutRoute } from "./checkout";

const CheckoutPage = (CheckoutRoute as unknown as { options: { component: React.ComponentType } })
  .options.component;

const store: Store = {
  id: "str_pending",
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

const ADDRESS_ROW = {
  id: "addr_late",
  label: "home",
  line1: "12 Late Street",
  city: "Surat",
  pincode: "395007",
  lat: 21.15,
  lng: 72.77,
  isDefault: true,
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
  useCheckoutStore.setState({ checkoutFees: { status: "idle" } } as never);
  useAddressStore.setState({
    addresses: [],
    selectedId: null,
    select: useAddressStore.getState().select,
  } as never);
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

const text = () => container.textContent ?? "";

async function flush() {
  for (let tick = 0; tick < 4; tick += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe("checkout feeds the address read's state into the delivery card", () => {
  it("never paints 'No delivery address selected' while the read is in flight", async () => {
    let settle: (value: unknown) => void = () => {};
    fixture.hydrate.mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );

    await act(async () => root.render(<CheckoutPage />));
    await flush();

    expect(text()).toContain("1. Delivery Details");
    // The false negative whose unmount was the 41px shift.
    expect(text()).not.toContain("No delivery address selected");
    expect(text()).not.toContain("+ Add Address");

    await act(async () => {
      settle({ success: true, data: [ADDRESS_ROW] });
    });
    await flush();

    // Settled with an address: the real row, and nothing claiming otherwise.
    expect(text()).toContain("12 Late Street");
    expect(text()).not.toContain("No delivery address selected");
  });

  it("shows the honest empty row only after a settled read with no addresses", async () => {
    fixture.hydrate.mockResolvedValue({ success: true, data: [] });

    await act(async () => root.render(<CheckoutPage />));
    await flush();

    expect(text()).toContain("1. Delivery Details");
    expect(text()).toContain("No delivery address selected");
  });

  it("keeps a failed read's error on the address block, not in the card", async () => {
    fixture.hydrate.mockResolvedValue({
      success: false,
      error: { code: "READ_FAILED", message: "We couldn't load your addresses." },
    });

    await act(async () => root.render(<CheckoutPage />));
    await flush();

    // The address block owns the retry copy (existing contract, untouched).
    expect(text()).toContain("We couldn't load your addresses.");
    // And the card is not asked to pretend the customer has none.
    expect(text()).not.toContain("No delivery address selected");
  });

  it("does not flash the empty row when the address is already cached", async () => {
    // Cache-first: the store has the row before `hydrate()` returns.
    useAddressStore.setState({
      addresses: [ADDRESS_ROW],
      selectedId: ADDRESS_ROW.id,
    } as never);
    let settle: (value: unknown) => void = () => {};
    fixture.hydrate.mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );

    await act(async () => root.render(<CheckoutPage />));
    await flush();

    expect(text()).toContain("12 Late Street");
    expect(text()).not.toContain("No delivery address selected");

    await act(async () => {
      settle({ success: true, data: [ADDRESS_ROW] });
    });
    await flush();
    expect(text()).toContain("12 Late Street");
  });
});
