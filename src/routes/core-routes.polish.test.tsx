/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const fixture = vi.hoisted(() => {
  const product = { id: "burger", name: "Test Burger", price: 199, veg: true, inStock: true };
  const noop = vi.fn();
  return {
    product,
    navigate: vi.fn(),
    addItem: vi.fn(),
    listOrders: vi.fn(),
    menu: {
      status: "ready",
      categories: [{ id: "burgers", name: "Burgers" }],
      activeCategoryId: "burgers",
      viewMode: "list",
      buckets: { burgers: { items: [product], hasMore: false, loading: false } },
      load: noop,
      loadMore: noop,
      setActiveCategory: noop,
      setViewMode: noop,
      subscribeToLiveMenu: () => noop,
      pushRecentlyViewed: noop,
    },
    search: {
      query: "burger",
      status: "ready",
      results: [product],
      suggestions: [],
      recent: [],
      trending: [],
      kind: "all",
      setQuery: noop,
      setKind: noop,
      submit: noop,
      fetchSuggestions: noop,
      fetchTrending: noop,
      removeRecent: noop,
      clearRecent: noop,
    },
  };
});

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    useSearch: () => ({}),
    useParams: () => ({ productId: "burger" }),
  }),
  useNavigate: () => fixture.navigate,
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/shared/layouts/AppShell", () => ({
  AppShell: ({
    children,
    bottomSlot,
    rightSlot,
  }: {
    children: React.ReactNode;
    bottomSlot?: React.ReactNode;
    rightSlot?: React.ReactNode;
  }) => (
    <main>
      {rightSlot}
      {children}
      {bottomSlot}
    </main>
  ),
}));
vi.mock("@/features/auth/components/ProtectedRoute", () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/features/stores/state/storeStore", () => ({
  useStoreSelection: (select: (state: unknown) => unknown) =>
    select({ activeStore: { id: "store-B" }, isHydrated: true }),
}));
vi.mock("@/features/menu/state/menuStore", () => ({
  useMenuStore: Object.assign((select: (state: unknown) => unknown) => select(fixture.menu), {
    getState: () => fixture.menu,
  }),
}));
vi.mock("@/features/menu/state/searchStore", () => ({
  useSearchStore: Object.assign((select: (state: unknown) => unknown) => select(fixture.search), {
    persist: { rehydrate: vi.fn() },
  }),
}));
vi.mock("@/features/favorites/state/favoritesStore", () => ({
  useFavoritesStore: (select: (state: unknown) => unknown) =>
    select({
      items: [
        {
          id: "favorite",
          refId: "burger",
          name: "Test Burger",
          kind: "product",
          priceLabel: "199",
        },
      ],
    }),
}));
vi.mock("@/features/favorites/repositories/FavoritesRepository", () => ({
  favoritesRepository: { remove: vi.fn() },
}));
vi.mock("@/features/cart", () => ({
  cartRepository: { addItem: fixture.addItem },
  FloatingCartBar: () => null,
}));
vi.mock("@/features/cart/repositories/CartRepository", () => ({
  cartRepository: { addItem: fixture.addItem },
}));
vi.mock("@/features/menu/repositories/MenuRepository", () => ({
  menuRepository: {
    getProduct: async () => ({ success: true, data: fixture.product }),
    // The favourites quick-add gate resolves the store-scoped catalog page
    // (in-stock + live price) instead of the unscoped single-product getter.
    listProducts: async () => ({
      success: true,
      data: { items: [fixture.product], page: 1, pageSize: 1000, total: 1 },
    }),
    listRelatedProducts: async () => ({ success: true, data: [] }),
  },
}));
vi.mock("@/features/orders", () => ({
  orderRepository: { listOrders: fixture.listOrders },
  OrderHistoryCard: ({ order }: { order: { id: string } }) => <article>Order {order.id}</article>,
}));
vi.mock("@/core/state/appConfigStore", () => ({
  useAppConfig: (select: (state: unknown) => unknown) => select({ isOnline: true }),
}));
vi.mock("@/core/services/haptics", () => ({
  HapticService: {
    impact: vi.fn().mockResolvedValue(undefined),
    selection: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock("@/core/services/audio", () => ({ AudioService: { playClick: vi.fn() } }));
vi.mock("@/shared/hooks/useOnlineStatus", () => ({ useOnlineStatus: vi.fn() }));
vi.mock("@/shared/hooks/useHydrated", () => ({ useHydrated: () => true }));
vi.mock("@/features/menu/utils/categorySwipe", () => ({ attachCategorySwipe: () => () => {} }));
vi.mock("@/features/menu/components/CategoryNavRail", () => ({ CategoryNavRail: () => null }));
vi.mock("@/features/menu/components/ProductCustomizerModal", () => ({
  ProductCustomizerModal: () => null,
}));
vi.mock("@/features/menu/components/MenuProductCard", () => ({
  MenuProductCard: ({ onAdd }: { onAdd: (product: typeof fixture.product) => void }) => (
    <button onClick={() => onAdd(fixture.product)}>Add</button>
  ),
}));

import { toast } from "sonner";
import { GENERIC_ERROR_MESSAGE } from "@/core/errors/userMessages";
import { Route as MenuRoute } from "./menu.index";
import { Route as SearchRoute } from "./search";
import { Route as ProductRoute } from "./menu.product.$productId";
import { Route as FavoritesRoute } from "./profile.favorites";
import { Route as OrdersRoute } from "./orders.index";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.clearAllMocks();
  fixture.navigate.mockReset();
  fixture.addItem.mockReset();
  fixture.listOrders.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

async function mount(route: unknown) {
  const Page = (route as { options: { component: React.ComponentType } }).options.component;
  await act(async () => root.render(<Page />));
}
async function click(label: string) {
  const button = Array.from(container.querySelectorAll("button")).find((node) =>
    node.textContent?.includes(label),
  );
  expect(button, `Missing button ${label}`).toBeDefined();
  await act(async () => button!.click());
}

describe.each([
  ["menu", MenuRoute, "Add"],
  ["search", SearchRoute, "Add"],
  ["product", ProductRoute, "Add To Cart"],
  ["favorites", FavoritesRoute, "Add"],
])("%s cart feedback", (_name, route, label) => {
  it.each([
    ["STORE_MISMATCH", "Clear your cart before adding items from a different store."],
    ["UNEXPECTED_INTERNAL_CODE", GENERIC_ERROR_MESSAGE],
  ])("does not claim success for %s or expose raw messages", async (code, description) => {
    fixture.addItem.mockResolvedValue({
      success: false,
      error: { code, message: "RAW PRIVATE DIAGNOSTIC" },
    });
    await mount(route);
    await click(label);
    expect(fixture.addItem).toHaveBeenCalledOnce();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledExactlyOnceWith("Couldn't add to cart", { description });
    expect(fixture.navigate).not.toHaveBeenCalled();
  });

  it("keeps success feedback on a successful add", async () => {
    fixture.addItem.mockResolvedValue({ success: true, data: {} });
    await mount(route);
    await click(label);
    expect(fixture.addItem).toHaveBeenCalledOnce();
    expect(toast.success).toHaveBeenCalledOnce();
    expect(toast.error).not.toHaveBeenCalled();
  });
});

describe("order refresh recovery", () => {
  it("clears an initial error on successful Try Again and displays the orders", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fixture.listOrders
      .mockResolvedValueOnce({ success: false, error: { code: "NETWORK", message: "raw failure" } })
      .mockResolvedValueOnce({
        success: true,
        data: { items: [{ id: "recovered" }], hasMore: false },
      });
    await mount(OrdersRoute);
    expect(container.textContent).toContain("Failed to load orders");
    await click("Try Again");
    expect(container.textContent).not.toContain("Failed to load orders");
    expect(container.textContent).toContain("Order recovered");
  });

  it("shows a curated error when a manual refresh fails and allows recovery", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = {
      success: false,
      error: { code: "NETWORK", message: "RAW PRIVATE DIAGNOSTIC" },
    };
    fixture.listOrders
      .mockResolvedValueOnce({ success: true, data: { items: [], hasMore: false } })
      .mockResolvedValueOnce(failure)
      .mockResolvedValueOnce({ success: true, data: { items: [], hasMore: false } });
    await mount(OrdersRoute);
    await act(async () =>
      (container.querySelector('[aria-label="Refresh orders"]') as HTMLButtonElement).click(),
    );
    expect(container.textContent).toContain("Failed to load orders");
    expect(container.textContent).toContain("We couldn't reach our servers. Please try again.");
    expect(container.textContent).not.toContain("RAW PRIVATE DIAGNOSTIC");
    expect(log).toHaveBeenCalledWith("[orders] refresh failed:", failure.error);
    await click("Try Again");
    expect(container.textContent).toContain("No Orders Found");
    expect(container.textContent).not.toContain("Failed to load orders");
  });
});
