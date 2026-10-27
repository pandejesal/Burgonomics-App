/**
 * Polish regression: every Home landmark's aria-labelledby must resolve to the
 * real visible SectionHeader <h2>, not a dangling id.
 *
 * Synthetic Home bundle only; component children are inert test doubles.
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
  load: vi.fn(async () => {}),
  bundle: {
    banners: [],
    categories: [{ id: "cat_1", name: "Burgers", itemCount: 3 }],
    featuredOffers: [],
    bestSellers: [{ id: "product_1", name: "Test Burger", price: 199 }],
    popularCombos: [{ id: "combo_1", name: "Test Combo", price: 299 }],
    recommendations: [],
    recentlyViewed: [],
    quickReorder: [{ id: "quick_1", orderId: "order_1", title: "Test Burger" }],
  },
}));

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
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/shared/components/feedback/FailureState", () => ({
  FailureState: () => null,
}));
vi.mock("@/shared/components/feedback/PetpoojaSyncPlaceholder", () => ({
  PetpoojaSyncPlaceholder: () => null,
}));
vi.mock("@/shared/hooks/useOnlineStatus", () => ({ useOnlineStatus: () => true }));
vi.mock("@/core/state/appConfigStore", () => ({
  useAppConfig: (select: (state: { isOnline: boolean }) => unknown) =>
    select({ isOnline: true }),
}));
vi.mock("@/features/home", () => ({
  useHomeStore: (select: (state: unknown) => unknown) =>
    select({
      status: "ready",
      bundle: fixture.bundle,
      error: null,
      load: fixture.load,
    }),
}));
vi.mock("@/features/home/components/BrandHeader", () => ({
  BrandHeader: () => null,
}));
vi.mock("@/features/home/components/BannerCarousel", () => ({
  BannerCarousel: () => null,
}));
vi.mock("@/features/home/components/CategoryGrid", () => ({
  CategoryGrid: () => null,
}));
vi.mock("@/features/home/components/HorizontalRail", () => ({
  HorizontalRail: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/features/home/components/BestSellerCard", () => ({
  BestSellerCard: () => null,
}));
vi.mock("@/features/home/components/ComboCard", () => ({
  ComboCard: () => null,
}));
vi.mock("@/features/home/components/QuickReorderRail", () => ({
  QuickReorderRail: () => null,
}));
vi.mock("@/features/home/components/HomeSkeleton", () => ({
  HomeSkeleton: () => null,
}));
vi.mock("@/features/menu/components/CategoryPills", () => ({
  CategoryPills: () => null,
}));
vi.mock("@/features/cart/components/FloatingCartBar", () => ({
  FloatingCartBar: () => null,
}));
vi.mock("@/features/stores/state/storeStore", () => ({
  useStoreSelection: (select: (state: unknown) => unknown) =>
    select({
      activeStore: { id: "store_1", name: "Test Store" },
      isHydrated: true,
    }),
}));
vi.mock("@/features/auth/state/authStore", () => {
  const authState = { user: { id: "customer_1" } };
  return {
    useAuthStore: (select: (state: typeof authState) => unknown) => select(authState),
    selectIsAuthenticated: () => true,
  };
});
vi.mock("@/features/orders/hooks/useReorderItems", () => ({
  useReorderItems: () => ({
    reorder: vi.fn(async () => ({ success: false, addedCount: 0, outOfStockItems: [] })),
    outOfStockModal: { isOpen: false, unavailableItems: [] },
    confirmReorderRemaining: vi.fn(),
    dismissOutOfStockModal: vi.fn(),
  }),
}));
vi.mock("@/features/orders/components/ReorderOutOfStockModal", () => ({
  ReorderOutOfStockModal: () => null,
}));
vi.mock("@/features/orders/repositories/OrderRepository", () => ({
  orderRepository: { getOrder: vi.fn(async () => ({ success: false })) },
}));

import { Route as HomeRoute } from "./home";

const HomePage = (HomeRoute as unknown as { options: { component: React.ComponentType } })
  .options.component;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  fixture.navigate.mockReset();
  fixture.load.mockClear();
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

async function mount() {
  await act(async () => root.render(<HomePage />));
  await act(async () => {});
}

describe("home section landmarks", () => {
  it("resolves every aria-labelledby to the matching visible SectionHeader h2", async () => {
    await mount();

    const expectedHeadings = ["Explore Menu", "Reorder in 1-Tap", "Bestsellers", "Value Combos"];
    const sections = Array.from(
      container.querySelectorAll<HTMLElement>("section[aria-labelledby]"),
    );
    expect(sections).toHaveLength(expectedHeadings.length);

    const seenIds = new Set<string>();
    sections.forEach((section, index) => {
      const id = section.getAttribute("aria-labelledby");
      expect(id, `section ${index} aria-labelledby`).toBeTruthy();
      expect(seenIds.has(id!)).toBe(false);
      seenIds.add(id!);

      const heading = document.getElementById(id!);
      expect(heading, `heading target #${id}`).not.toBeNull();
      expect(heading!.tagName).toBe("H2");
      expect(heading!.textContent?.trim()).toBe(expectedHeadings[index]);
      expect(heading!.hasAttribute("hidden")).toBe(false);
      expect(heading!.getAttribute("aria-hidden")).toBeNull();
    });
  });
});
