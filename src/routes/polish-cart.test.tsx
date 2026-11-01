/**
 * Polish regression: cart CTAs must use the semantic AA accent pair, and the
 * floating cart must do the same. All fixtures below are unit-only synthetic
 * data; no production or network data is involved.
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
  updateQuantity: vi.fn(),
  removeItem: vi.fn(),
  updateNotes: vi.fn(),
  clear: vi.fn(),
  validateCart: vi.fn(),
  prepareCheckout: vi.fn(),
  itemCount: 0,
  cartState: {
    lines: [] as Array<Record<string, unknown>>,
    syncPending: false,
    promo: null,
    status: "empty",
    error: null,
    priceLockExpiresAt: null,
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
  useNavigate: () => fixture.navigate,
  Link: ({
    to,
    className,
    children,
  }: {
    to: string;
    className?: string;
    children?: React.ReactNode;
  }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));
vi.mock("@/shared/layouts/AppShell", () => ({
  AppShell: ({
    children,
    rightSlot,
    bottomSlot,
  }: {
    children: React.ReactNode;
    rightSlot?: React.ReactNode;
    bottomSlot?: React.ReactNode;
  }) => (
    <div>
      {rightSlot}
      {children}
      {bottomSlot}
    </div>
  ),
}));
vi.mock("@/shared/hooks/useHydrated", () => ({ useHydrated: () => true }));
vi.mock("@/shared/hooks/useKitchenHours", () => ({
  useKitchenHours: () => ({ isOpen: true }),
}));
vi.mock("@/shared/components/feedback/KitchenClosedBanner", () => ({
  KitchenClosedBanner: () => null,
}));
vi.mock("@/shared/components/common/ConfirmDialog", () => ({
  ConfirmDialog: () => null,
}));
vi.mock("@/features/stores/components/FulfillmentSheet", () => ({
  FulfillmentSheet: () => null,
}));
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
    loyaltyPointsToRedeem: 0,
    setOrderNotes: vi.fn(),
    setTipAmount: vi.fn(),
    setLoyaltyPointsToRedeem: vi.fn(),
  };
  const useCheckoutStore = (select: (state: typeof checkoutState) => unknown) =>
    select(checkoutState);
  return {
    useCheckoutStore: Object.assign(useCheckoutStore, {
      getState: () => checkoutState,
    }),
  };
});
vi.mock("@/features/addresses", () => ({
  useAddressStore: (select: (state: { selectedAddress: null }) => unknown) =>
    select({ selectedAddress: null }),
  selectSelectedAddress: (state: { selectedAddress: null }) => state.selectedAddress,
}));
vi.mock("@/features/loyalty/state/loyaltyStore", () => ({
  useLoyaltyStore: (select: (state: { balance: number }) => unknown) =>
    select({ balance: 0 }),
}));
vi.mock("@/features/cart", () => ({
  cartRepository: {
    calculateTotals: fixture.calculateTotals,
    updateQuantity: fixture.updateQuantity,
    removeItem: fixture.removeItem,
    updateNotes: fixture.updateNotes,
    clear: fixture.clear,
    validateCart: fixture.validateCart,
    prepareCheckout: fixture.prepareCheckout,
  },
  useCartStore: (select: (state: typeof fixture.cartState) => unknown) =>
    select(fixture.cartState),
  selectItemCount: () => fixture.itemCount,
  CartItemRow: () => null,
  CartItemList: () => null,
  BillBreakdown: () => null,
  GrillCoinsRedemption: () => null,
  DeliveryTipSelector: () => null,
  OrderSummary: () => null,
  PromoInput: () => null,
}));
vi.mock("@/features/cart/state/cartStore", () => ({
  useCartStore: (select: (state: typeof fixture.cartState) => unknown) =>
    select(fixture.cartState),
  selectItemCount: () => fixture.itemCount,
}));
vi.mock("@/core/services/haptics", () => ({
  HapticService: { impact: vi.fn(), selection: vi.fn() },
}));
vi.mock("motion/react", async () => {
  const ReactRuntime = await vi.importActual<typeof import("react")>("react");
  const motionTypes = new Map<string, React.ComponentType<Record<string, unknown>>>();
  const motion = new Proxy(
    {},
    {
      get: (_target, tag: string) => {
        const cached = motionTypes.get(tag);
        if (cached) return cached;
        const type = ReactRuntime.forwardRef(
          (
            props: Record<string, unknown> & { children?: React.ReactNode },
            ref: React.Ref<unknown>,
          ) => {
            const {
              children,
              initial: _initial,
              animate: _animate,
              exit: _exit,
              transition: _transition,
              whileTap: _whileTap,
              whileHover: _whileHover,
              layout: _layout,
              ...domProps
            } = props;
            return ReactRuntime.createElement(
              tag,
              { ...domProps, ref },
              children,
            );
          },
        );
        motionTypes.set(tag, type as unknown as React.ComponentType<Record<string, unknown>>);
        return type;
      },
    },
  );
  return {
    motion,
    AnimatePresence: ({ children }: { children: React.ReactNode }) =>
      ReactRuntime.createElement(ReactRuntime.Fragment, null, children),
    useReducedMotion: () => false,
  };
});

import { Route as CartRoute } from "./cart";
import { FloatingCartBar } from "@/features/cart/components/FloatingCartBar";

const CartPage = (CartRoute as unknown as { options: { component: React.ComponentType } })
  .options.component;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  fixture.navigate.mockReset();
  fixture.calculateTotals.mockReset();
  fixture.calculateTotals.mockResolvedValue({
    success: true,
    data: {
      subtotal: 199,
      itemDiscount: 0,
      promoDiscount: 0,
      taxes: 9.95,
      cgst: 4.98,
      sgst: 4.97,
      deliveryFee: 0,
      packingFee: 0,
    },
  });
  fixture.cartState.lines = [];
  fixture.cartState.syncPending = false;
  fixture.cartState.promo = null;
  fixture.cartState.status = "empty";
  fixture.cartState.error = null;
  fixture.cartState.priceLockExpiresAt = null;
  fixture.itemCount = 0;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

async function mount(ui: React.ReactElement) {
  await act(async () => root.render(ui));
  await act(async () => {});
}

const classTokens = (node: Element) => node.className.split(/\s+/);

describe("cart purchase-path accent tokens", () => {
  it("renders the empty-cart CTA with the semantic accent pair", async () => {
    await mount(<CartPage />);

    const cta = Array.from(container.querySelectorAll("a")).find((node) =>
      node.textContent?.includes("Explore Menu"),
    );
    expect(cta, "empty-cart Explore Menu CTA").toBeDefined();
    const tokens = classTokens(cta!);
    expect(tokens).toContain("bg-accent");
    expect(tokens).toContain("text-accent-foreground");
    expect(tokens).toContain("hover:bg-[var(--accent-hover)]");
    expect(tokens).toContain("dark:bg-[var(--accent-hover)]");
    expect(container.innerHTML).not.toContain("#FF6600");
    expect(container.innerHTML).not.toContain("#e05a00");
  });

  it("renders the branded mascot in empty cart state instead of raw emoji", async () => {
    await mount(<CartPage />);

    const mascot = container.querySelector<HTMLImageElement>('img[alt="BURGONOMICS mascot"]');
    expect(mascot, "BrandMascot img").not.toBeNull();
    expect(mascot!.getAttribute("width")).toBe("120");
    expect(mascot!.getAttribute("height")).toBe("120");
    expect(mascot!.className).toContain("animate-mascot-float");

    expect(container.innerHTML).not.toContain("📦");
    expect(container.textContent).toContain("Your burger box is empty!");
  });

  it("renders the checkout CTA and inline actions with the semantic accent pair", async () => {
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
    fixture.cartState.status = "ready";
    fixture.itemCount = 1;

    await mount(<CartPage />);

    const checkout = Array.from(container.querySelectorAll("button")).find((node) =>
      node.textContent?.includes("Proceed to Checkout"),
    );
    expect(checkout, "Proceed to Checkout button").toBeDefined();
    expect(classTokens(checkout!)).toEqual(
      expect.arrayContaining([
        "bg-accent",
        "text-accent-foreground",
        "hover:bg-[var(--accent-hover)]",
        "dark:bg-[var(--accent-hover)]",
      ]),
    );

    const change = Array.from(container.querySelectorAll("button")).find(
      (node) => node.textContent?.trim() === "Change",
    );
    expect(change, "fulfillment Change button").toBeDefined();
    expect(classTokens(change!)).toEqual(
      expect.arrayContaining(["text-accent", "dark:text-accent-foreground"]),
    );

    const addMore = Array.from(container.querySelectorAll("a")).find((node) =>
      node.textContent?.includes("+ Add more items from menu"),
    );
    expect(addMore, "add-more link").toBeDefined();
    expect(classTokens(addMore!)).toEqual(
      expect.arrayContaining(["text-accent", "dark:text-accent-foreground"]),
    );

    expect(container.innerHTML).not.toContain("#FF6600");
    expect(container.innerHTML).not.toContain("#e05a00");
  });
});

describe("floating cart accent tokens", () => {
  it("renders the item badge and View Cart pill with accessible accent fills", async () => {
    fixture.cartState.lines = [
      {
        lineId: "line_1",
        productId: "product_1",
        storeId: "store_1",
        name: "Test Burger",
        unitPrice: 199,
        quantity: 2,
        modifiers: [],
        availability: "available",
      },
    ];
    fixture.itemCount = 2;

    await mount(<FloatingCartBar />);

    const link = document.body.querySelector<HTMLAnchorElement>('a[href="/cart"]');
    expect(link, "floating cart link").not.toBeNull();
    expect(link!.textContent).toContain("View Cart");

    const pill = Array.from(link!.querySelectorAll("div")).find((node) =>
      node.textContent?.includes("View Cart"),
    );
    expect(pill, "View Cart pill").toBeDefined();
    expect(classTokens(pill!)).toEqual(
      expect.arrayContaining([
        "bg-accent",
        "text-accent-foreground",
        "hover:bg-[var(--accent-hover)]",
        "dark:bg-[var(--accent-hover)]",
      ]),
    );

    const badge = Array.from(link!.querySelectorAll("span")).find(
      (node) => node.textContent?.trim() === "2",
    );
    expect(badge, "floating cart count badge").toBeDefined();
    expect(classTokens(badge!)).toEqual(
      expect.arrayContaining([
        "bg-accent",
        "text-accent-foreground",
        "dark:bg-[var(--accent-hover)]",
      ]),
    );

    expect(link!.innerHTML).not.toContain("#FF6600");
    expect(link!.innerHTML).not.toContain("#e05a00");
  });
});
