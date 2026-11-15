/**
 * Offline cart notice honesty contract.
 *
 * The cart is a device-local store (zustand `persist` → `burg.cart`); nothing
 * about it is queued for a server. `syncPending` only records "you changed the
 * cart while offline", and the re-check of prices/availability happens when the
 * customer continues to checkout (`CartRepository.validateCart`, reached from
 * the cart's Proceed button, checkout, and the payment preflight).
 *
 * The notice used to promise "will sync when back online", which describes a
 * background synchronisation that does not exist. These tests pin the real
 * behaviour: it is saved here, and it is checked again on the way to checkout.
 *
 * @vitest-environment jsdom
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const fixture = vi.hoisted(() => ({
  navigate: vi.fn(),
  calculateTotals: vi.fn(),
  validateCart: vi.fn(),
  prepareCheckout: vi.fn(),
  updateQuantity: vi.fn(),
  removeItem: vi.fn(),
  updateNotes: vi.fn(),
  clear: vi.fn(),
  cartState: {
    lines: [] as Array<Record<string, unknown>>,
    syncPending: false,
    promo: null,
    status: "empty",
    error: null,
    priceLockExpiresAt: null,
  },
}));

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
  useNavigate: () => fixture.navigate,
  Link: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
    <a className={className}>{children}</a>
  ),
}));
vi.mock("@/shared/layouts/AppShell", () => ({
  AppShell: ({
    children,
    bottomSlot,
  }: {
    children?: React.ReactNode;
    bottomSlot?: React.ReactNode;
  }) => (
    <main>
      {children}
      {bottomSlot}
    </main>
  ),
}));
vi.mock("@/shared/hooks/useHydrated", () => ({ useHydrated: () => true }));
vi.mock("@/shared/hooks/useKitchenHours", () => ({
  useKitchenHours: () => ({ isOpen: true, isClosed: false }),
}));
vi.mock("@/shared/components/feedback/KitchenClosedBanner", () => ({
  KitchenClosedBanner: () => null,
}));
vi.mock("@/shared/components/common/ConfirmDialog", () => ({ ConfirmDialog: () => null }));
vi.mock("@/shared/components/feedback/FailureState", () => ({ FailureState: () => null }));
vi.mock("@/shared/components/feedback/Skeleton", () => ({ Skeleton: () => null }));
vi.mock("@/features/orders/components/RecentOrdersRail", () => ({ RecentOrdersRail: () => null }));
vi.mock("@/features/stores/components/FulfillmentSheet", () => ({ FulfillmentSheet: () => null }));
vi.mock("@/features/stores/state/storeStore", () => ({
  useStoreSelection: (select: (state: unknown) => unknown) =>
    select({
      activeStore: { id: "store_1", name: "Test Store" },
      fulfillment: "delivery",
      setFulfillment: vi.fn(),
    }),
}));
vi.mock("@/features/checkout", () => {
  const checkoutState = {
    orderNotes: "",
    tipAmount: 0,
    bindNotesScope: vi.fn(),
    captureNotesDraft: vi.fn(() => ({ uid: null, storeId: "store_1", revision: 0 })),
    clearNotesAfterCompletedOrder: vi.fn(),
  };
  const useCheckoutStore = (select: (state: typeof checkoutState) => unknown) =>
    select(checkoutState);
  return { useCheckoutStore: Object.assign(useCheckoutStore, { getState: () => checkoutState }) };
});
vi.mock("@/features/addresses", () => ({
  useAddressStore: (select: (state: { selectedAddress: null }) => unknown) =>
    select({ selectedAddress: null }),
  selectSelectedAddress: (state: { selectedAddress: null }) => state.selectedAddress,
}));
vi.mock("@/features/auth/state/authStore", () => ({
  useAuthStore: (select: (state: { user: null }) => unknown) => select({ user: null }),
  selectIsAuthenticated: (state: { user: unknown }) => Boolean(state.user),
}));
vi.mock("@/features/cart", () => ({
  cartRepository: {
    calculateTotals: fixture.calculateTotals,
    validateCart: fixture.validateCart,
    prepareCheckout: fixture.prepareCheckout,
    updateQuantity: fixture.updateQuantity,
    removeItem: fixture.removeItem,
    updateNotes: fixture.updateNotes,
    clear: fixture.clear,
  },
  useCartStore: (select: (state: typeof fixture.cartState) => unknown) => select(fixture.cartState),
  selectItemCount: () => fixture.cartState.lines.length,
  CartItemRow: () => null,
  BillBreakdown: () => null,
  DeliveryTipSelector: () => null,
  PromoInput: () => null,
  CookingInstructionsSection: () => null,
}));
vi.mock("@/features/cart/state/cartStore", () => ({
  useCartStore: (select: (state: typeof fixture.cartState) => unknown) => select(fixture.cartState),
  selectItemCount: () => fixture.cartState.lines.length,
}));

import { Route as CartRoute } from "./cart";

const CartPage = (CartRoute as unknown as { options: { component: React.ComponentType } }).options
  .component;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  fixture.calculateTotals.mockResolvedValue({
    success: true,
    data: {
      subtotal: 199,
      itemDiscount: 0,
      promoDiscount: 0,
      taxes: 0,
      deliveryFee: 0,
      packingFee: 0,
    },
  });
  fixture.cartState.lines = [
    {
      lineId: "line_1",
      productId: "product_1",
      storeId: "store_1",
      name: "Test Burger",
      unitPrice: 199,
      quantity: 1,
      modifiers: [],
      availability: "available",
    },
  ];
  fixture.cartState.syncPending = true;
  fixture.cartState.status = "ready";
  fixture.cartState.error = null;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

async function mount() {
  await act(async () => root.render(<CartPage />));
  await act(async () => {});
}

const notice = () => container.querySelector('[role="status"]');

describe("offline cart notice", () => {
  it("says the cart is saved on this device and re-checked at checkout", async () => {
    await mount();

    const element = notice();
    expect(element, "the offline notice must render while syncPending").not.toBeNull();
    const copy = element!.textContent ?? "";
    expect(copy).toContain("saved on this device");
    // The real re-check: prices and availability are verified on the way to
    // checkout (CartRepository.validateCart), not in a background sync.
    expect(copy.toLowerCase()).toContain("prices");
    expect(copy.toLowerCase()).toContain("availability");
    expect(copy.toLowerCase()).toContain("checkout");
  });

  it("does not promise a background synchronisation that does not exist", async () => {
    await mount();

    const copy = (notice()?.textContent ?? "").toLowerCase();
    expect(copy).not.toContain("will sync");
    expect(copy).not.toContain("syncing");
  });

  it("stays hidden when the cart was changed online", async () => {
    fixture.cartState.syncPending = false;
    await mount();

    expect(notice()).toBeNull();
    expect(container.textContent ?? "").not.toContain("saved on this device");
  });
});
