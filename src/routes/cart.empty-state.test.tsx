/** @vitest-environment jsdom */
/**
 * Empty-cart surface contract (owner request 2026-10-29).
 *
 *   - EMPTY cart: the kitchen-note editor is gone. Past reorders take its
 *     place, gated on auth — a guest issues ZERO history reads and no fake
 *     reorder rows are invented.
 *   - FILLED cart: the notes editor is still the one editor in the app; the
 *     reorder rail stays unmounted and the persisted checkout draft is never
 *     cleared by this route.
 *   - ACCOUNT SWITCH: an anonymous uid swap (A -> B) while the empty cart
 *     stays mounted must never paint A's order under B — not even in the very
 *     first commit, before passive effects run.
 *
 * These mount the REAL cart route with the real cart/checkout stores and a
 * real (subscribing) auth store; only the repositories, the shell and
 * unrelated leaves are faked. `RecentOrdersRail` is the real component, so the
 * account-switch assertion sees its actual state, not a stand-in.
 */
import * as React from "react";
import { act, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ok } from "@/core/network/http";
import type { Order } from "@/features/orders/models";

const fixture = vi.hoisted(() => ({
  listOrders: vi.fn(),
  calculateTotals: vi.fn(),
  validateCart: vi.fn(),
  prepareCheckout: vi.fn(),
  clearCart: vi.fn(),
  updateNotes: vi.fn(),
  updateQuantity: vi.fn(),
  removeItem: vi.fn(),
  navigate: vi.fn(),
  setFulfillment: vi.fn(),
  activeStore: { id: "store-A", name: "Surat Vesu" } as { id: string; name: string } | null,
  fulfillment: "delivery" as "delivery" | "takeaway" | "dinein",
}));

/* ── framework / shell ─────────────────────────────────────────────────── */
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (options: Record<string, unknown>) => ({
    ...options,
    options,
    _$path: path,
  }),
  useNavigate: () => fixture.navigate,
  Link: ({
    to,
    children,
    className,
  }: {
    to?: unknown;
    children?: React.ReactNode;
    className?: string;
  }) => (
    <a data-to={typeof to === "string" ? to : undefined} className={className}>
      {children}
    </a>
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
    <main data-testid="app-shell">
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
vi.mock("@/shared/components/common/ConfirmDialog", () => ({
  ConfirmDialog: () => null,
}));

/* ── unrelated leaves kept out of this contract ────────────────────────── */
vi.mock("@/features/cart/components/CartItemRow", () => ({
  CartItemRow: () => <div data-testid="cart-line" />,
}));
vi.mock("@/features/stores/components/FulfillmentSheet", () => ({
  FulfillmentSheet: () => null,
}));
vi.mock("@/features/orders/components/ReorderDialogs", () => ({
  ReorderDialogs: () => null,
}));
vi.mock("@/features/orders/hooks/useReorderItems", () => ({
  useReorderItems: () => ({
    reorder: vi.fn(),
    isReordering: false,
    outOfStockModal: { isOpen: false, unavailableItems: [] },
    confirmReorderRemaining: vi.fn(),
    dismissOutOfStockModal: vi.fn(),
    pendingConfirmation: null,
    confirmPendingReorder: vi.fn(),
    cancelPendingReorder: vi.fn(),
  }),
}));

/* ── repositories: the only network seams ──────────────────────────────── */
vi.mock("@/features/cart/repositories/CartRepository", () => ({
  cartRepository: {
    calculateTotals: fixture.calculateTotals,
    validateCart: fixture.validateCart,
    prepareCheckout: fixture.prepareCheckout,
    clear: fixture.clearCart,
    updateNotes: fixture.updateNotes,
    updateQuantity: fixture.updateQuantity,
    removeItem: fixture.removeItem,
  },
  CartRepository: class {},
}));
vi.mock("@/features/orders/repositories/OrderRepository", () => ({
  orderRepository: { listOrders: fixture.listOrders },
}));

/* ── stores ────────────────────────────────────────────────────────────── */
// A real zustand store, so an account switch actually re-renders subscribers —
// a static shim would hide the very commit this suite exists to police.
vi.mock("@/features/auth/state/authStore", async () => {
  const { create } = await vi.importActual<typeof import("zustand")>("zustand");
  const useAuthStore = create<{ user: { id: string; phone: string; name?: string } | null }>(
    () => ({ user: null }),
  );
  return {
    useAuthStore,
    selectIsAuthenticated: (state: { user: unknown }) => Boolean(state.user),
  };
});
vi.mock("@/features/stores/state/storeStore", () => ({
  useStoreSelection: (selector: (state: unknown) => unknown) =>
    selector({
      activeStore: fixture.activeStore,
      fulfillment: fixture.fulfillment,
      setFulfillment: fixture.setFulfillment,
    }),
}));
vi.mock("@/features/addresses", () => ({
  useAddressStore: (selector: (state: unknown) => unknown) =>
    selector({ items: [], selectedId: null }),
  selectAddresses: () => [],
  selectSelectedAddress: () => null,
}));
// Keep the real checkout store (draft + scope binding are part of this contract).
vi.mock("@/features/checkout", async () => {
  const { useCheckoutStore: realCheckoutStore } = await vi.importActual<
    typeof import("@/features/checkout/state/checkoutStore")
  >("@/features/checkout/state/checkoutStore");
  return { useCheckoutStore: realCheckoutStore };
});

import { useAuthStore } from "@/features/auth/state/authStore";
import { useCartStore } from "@/features/cart/state/cartStore";
import { useCheckoutStore } from "@/features/checkout/state/checkoutStore";
import { Route as CartRoute } from "./cart";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const CartPage = (CartRoute as unknown as { options: { component: React.ComponentType } }).options
  .component;

const NOTES_TOGGLE = "Add cooking instructions";
const DRAFT = "no onions, extra napkins";

const completedOrder = (args: {
  id: string;
  storeName: string;
  shortCode: string;
  total: number;
}): Order =>
  ({
    id: args.id,
    shortCode: args.shortCode,
    status: { code: "DELIVERED", label: "Delivered", kind: "completed", terminal: true },
    fulfillment: "delivery",
    store: { id: "store-A", name: args.storeName },
    items: [{ lineId: "l1", name: "Burger", quantity: 1, unitPrice: args.total }],
    totals: { grandTotal: args.total },
    payment: { method: "cod" },
  }) as unknown as Order;

const ORDER_A = completedOrder({
  id: "ord_A",
  storeName: "A Outlet",
  shortCode: "BGA",
  total: 249,
});
const ORDER_B = completedOrder({
  id: "ord_B",
  storeName: "B Outlet",
  shortCode: "BGB",
  total: 499,
});

// Markers that must never appear under account B.
const A_MARKERS = ["A Outlet", "#BGA", "249"] as const;
// Markers that must never appear under the guest or a different account.
const B_MARKERS = ["B Outlet", "#BGB", "499"] as const;

const signIn = (id: string) => useAuthStore.setState({ user: { id, phone: "+910000000000" } });
const signOut = () => useAuthStore.setState({ user: null });
const currentUid = () => useAuthStore.getState().user?.id ?? null;

let container: HTMLDivElement;
let root: Root;

const text = () => container.textContent ?? "";
const notesTextarea = () => container.querySelector<HTMLTextAreaElement>("#order-notes");

async function flush() {
  for (let tick = 0; tick < 4; tick += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function mountCart() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<CartPage />));
  await flush();
}

beforeEach(() => {
  vi.clearAllMocks();
  fixture.activeStore = { id: "store-A", name: "Surat Vesu" };
  fixture.fulfillment = "delivery";
  // The repository answers for whoever is signed in at call time.
  fixture.listOrders.mockImplementation(async () => {
    const uid = currentUid();
    const items = uid === "uid-B" ? [ORDER_B] : uid === "uid-A" ? [ORDER_A] : [];
    return ok({ items, page: 1, pageSize: 5, total: items.length, hasMore: false });
  });
  fixture.calculateTotals.mockResolvedValue(
    ok({
      subtotal: 249,
      taxes: 0,
      packingFee: 0,
      deliveryFee: 0,
      promoDiscount: 0,
      loyaltyDiscount: 0,
      grandTotal: 249,
    }),
  );
  fixture.validateCart.mockResolvedValue(ok({ valid: true, issues: [] }));
  fixture.prepareCheckout.mockResolvedValue(ok({}));
  fixture.updateNotes.mockResolvedValue(ok({}));

  signOut();
  useCartStore.setState({
    lines: [],
    promo: null,
    priceLockExpiresAt: null,
    status: "empty",
    error: null,
    syncPending: false,
  });
  useCheckoutStore.setState({
    orderNotes: "",
    legacyOrderNotes: "",
    tipAmount: 0,
    notesScope: null,
    notesRevision: 0,
  });
});

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container?.remove();
  vi.clearAllMocks();
});

describe("empty cart — past reorders, not a kitchen-note editor", () => {
  it.each([600_000, -1_000])(
    "does not display a price-lock pill for a stored expiry offset of %i ms",
    async (offset) => {
      const expiry = Date.now() + offset;
      useCartStore.setState({
        lines: [
          {
            lineId: "l1",
            productId: "prod-1",
            storeId: "store-A",
            name: "Smash Burger",
            quantity: 1,
            unitPrice: 249,
          },
        ] as never,
        status: "ready",
        priceLockExpiresAt: expiry,
      });
      await mountCart();

      expect(container.querySelector('[data-testid="cart-line"]')).not.toBeNull();
      expect(text()).not.toContain("Prices locked for this order");
      expect(text()).not.toContain("Price lock expired");
      expect(useCartStore.getState().priceLockExpiresAt).toBe(expiry);
      expect(fixture.calculateTotals).toHaveBeenCalled();
      expect(fixture.clearCart).not.toHaveBeenCalled();
    },
  );

  it("guest: renders the empty state with no notes editor and zero history reads", async () => {
    await mountCart();

    // We really are on the empty branch.
    expect(text()).toContain("Your burger box is empty");
    // No editor of any kind.
    expect(notesTextarea()).toBeNull();
    expect(text()).not.toContain(NOTES_TOGGLE);
    // Guest: no history read, no fabricated reorder surface.
    expect(fixture.listOrders).not.toHaveBeenCalled();
    expect(text()).not.toContain("Order again");
  });

  it("signed-in: shows the customer's own completed order to reorder, still no notes editor", async () => {
    signIn("uid-A");
    await mountCart();

    expect(fixture.listOrders).toHaveBeenCalledTimes(1);
    expect(fixture.listOrders).toHaveBeenCalledWith({ bucket: "past", pageSize: 5 });
    expect(text()).toContain("Order again");
    expect(text()).toContain("A Outlet");
    expect(text()).toContain("Reorder");
    // Only the real record shows — nothing invented beyond the read.
    expect(text()).not.toContain("B Outlet");
    // The editor is still gone on an empty cart.
    expect(notesTextarea()).toBeNull();
    expect(text()).not.toContain(NOTES_TOGGLE);
  });

  it("signed-in with a saved draft: the draft survives and is not rendered on the empty screen", async () => {
    signIn("uid-A");
    useCheckoutStore.setState({
      orderNotes: DRAFT,
      legacyOrderNotes: "",
      notesScope: null,
      notesRevision: 0,
    });

    await mountCart();

    const checkout = useCheckoutStore.getState();
    expect(checkout.orderNotes).toBe(DRAFT);
    expect(checkout.notesRevision).toBe(0);
    // The draft is preserved, not reviewed here: no editor, no leaked text.
    expect(notesTextarea()).toBeNull();
    expect(text()).not.toContain(NOTES_TOGGLE);
    expect(text()).not.toContain(DRAFT);
  });

  it("filled cart: keeps the notes editor and never mounts the reorder rail", async () => {
    signIn("uid-A");
    useCartStore.setState({
      lines: [
        {
          lineId: "l1",
          productId: "prod-1",
          storeId: "store-A",
          name: "Smash Burger",
          quantity: 1,
          unitPrice: 249,
        },
      ] as never,
      status: "ready",
      error: null,
    });
    useCheckoutStore.setState({
      orderNotes: "no onions",
      legacyOrderNotes: "",
      notesScope: null,
      notesRevision: 0,
    });

    await mountCart();

    // The filled branch really rendered.
    expect(container.querySelector('[data-testid="cart-line"]')).not.toBeNull();
    // The one editor is still here, holding the saved draft.
    expect(notesTextarea()).not.toBeNull();
    expect(notesTextarea()?.value).toBe("no onions");
    expect(text()).toContain(NOTES_TOGGLE);
    // And the empty-cart rail stays off a filled cart.
    expect(fixture.listOrders).not.toHaveBeenCalled();
    expect(text()).not.toContain("Order again");
  });
});

describe("empty cart — account switch keeps history scoped to the signed-in uid", () => {
  interface Commit {
    uid: string | null;
    text: string;
  }

  /** Captures every commit's DOM before passive effects can repair it. */
  function CommitProbe({ commits }: { commits: Commit[] }) {
    const user = useAuthStore((s) => s.user);
    const uid = user?.id ?? null;
    const host = React.useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
      commits.push({ uid, text: host.current?.textContent ?? "" });
    }, [commits, uid]);
    return (
      <div ref={host}>
        <CartPage />
      </div>
    );
  }

  it("never paints account A's order under account B, not even in B's first commit", async () => {
    signIn("uid-A");
    const commits: Commit[] = [];
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => root.render(<CommitProbe commits={commits} />));
    await flush();

    // A's own order is on screen — that is the state that must not leak.
    expect(text()).toContain("A Outlet");
    expect(currentUid()).toBe("uid-A");

    commits.length = 0;
    await act(async () => {
      signIn("uid-B");
    });

    const commitsUnderB = commits.filter((commit) => commit.uid === "uid-B");
    expect(commitsUnderB.length).toBeGreaterThan(0);

    // The first commit after the uid swap is where a stale `orders` state
    // would surface: passive effects that reset it have not run yet.
    for (const commit of commitsUnderB) {
      for (const marker of A_MARKERS) {
        expect(commit.text).not.toContain(marker);
      }
    }
    for (const marker of B_MARKERS) {
      expect(commitsUnderB[0]?.text).not.toContain(marker);
    }

    // Settled state belongs to B only.
    await flush();
    expect(text()).toContain("B Outlet");
    for (const marker of A_MARKERS) {
      expect(text()).not.toContain(marker);
    }
  });
});
