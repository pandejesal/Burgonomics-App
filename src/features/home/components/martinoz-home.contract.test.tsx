/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HomeBundle } from "@/features/home/models";

/**
 * Martinoz-grounded Home structure (DIRECTION.md items 1-3).
 *
 * Pins the parts of the approved direction that are structural rather than
 * cosmetic: Search sits in the Menu row AFTER the promo and nowhere else, the
 * four shortcuts are equal full-bleed squares with labels outside the flip
 * subtree, and the mode control is one 48px text row.
 */

const fixture = vi.hoisted(() => ({
  navigate: vi.fn(),
  getHome: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
  useNavigate: () => fixture.navigate,
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/shared/layouts/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/shared/hooks/useOnlineStatus", () => ({ useOnlineStatus: vi.fn() }));
vi.mock("@/core/state/appConfigStore", () => ({
  useAppConfig: (selector: (state: { isOnline: boolean }) => unknown) => selector({ isOnline: true }),
}));
vi.mock("@/features/stores/state/storeStore", () => ({
  useStoreSelection: (selector: (state: { activeStore: { id: string }; isHydrated: boolean }) => unknown) =>
    selector({ activeStore: { id: "store-A" }, isHydrated: true }),
}));
vi.mock("@/features/auth/state/authStore", () => ({
  useAuthStore: (selector: (state: { user: null }) => unknown) => selector({ user: null }),
}));
vi.mock("@/features/cart/components/FloatingCartBar", () => ({ FloatingCartBar: () => null }));
vi.mock("@/features/home/components/BrandHeader", () => ({
  BrandHeader: () => <header data-testid="brand-header">brand</header>,
}));
vi.mock("@/features/home/components/BannerCarousel", () => ({
  BannerCarousel: () => <section data-testid="banner">banner</section>,
}));
vi.mock("@/features/home/components/CategoryGrid", () => ({
  CategoryGrid: ({ fitInitialViewport }: { fitInitialViewport?: boolean }) => <div data-testid="category-grid" data-fit={String(!!fitInitialViewport)} />,
}));
vi.mock("@/features/home/components/SectionHeader", () => ({
  SectionHeader: ({ id, title }: { id: string; title: string }) => <h2 id={id}>{title}</h2>,
}));
vi.mock("@/features/home/components/BestSellerCard", () => ({ BestSellerCard: () => null }));
vi.mock("@/features/home/components/ComboCard", () => ({ ComboCard: () => null }));
vi.mock("@/features/home/components/FavoritesRail", () => ({ FavoritesRail: () => null }));
vi.mock("@/features/home/components/HorizontalRail", () => ({
  HorizontalRail: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/features/home/components/HomeSkeleton", () => ({ HomeSkeleton: () => <div>loading</div> }));
vi.mock("@/features/home/components/HomeAnnouncements", () => ({ HomeAnnouncements: () => null }));
vi.mock("@/shared/components/feedback/FailureState", () => ({ FailureState: () => null }));
vi.mock("@/shared/components/feedback/PetpoojaSyncPlaceholder", () => ({
  PetpoojaSyncPlaceholder: () => null,
}));
vi.mock("@/features/home/repositories/HomeRepository", () => ({
  homeRepository: { getHome: fixture.getHome },
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

import { useHomeStore } from "@/features/home/state/homeStore";
import { Route } from "@/routes/home";
import { ModeSegmentedSwitch } from "./ModeSegmentedSwitch";

// The route test stubs CategoryGrid for structure; the tile assertions below
// need the real module, so load it past the mock.
const { CategoryGrid } = await vi.importActual<typeof import("./CategoryGrid")>("./CategoryGrid");

const HomePage = (Route as unknown as { options: { component: React.ComponentType } }).options.component;

const bundle: HomeBundle = {
  banners: [{
    id: "banner-1",
    title: "An actual promo title",
    subtitle: "An actual promo subtitle",
    ctaLabel: "Order now",
    ctaHref: "/menu",
    visual: "",
    imageUrl: "/images/menu/classic-burgers/hero-burger.jpg",
    gradient: "bg-gradient-to-br from-[#0E4825] to-[#1B5934] text-white",
  }],
  categories: [
    { id: "pp-burger", name: "Classic Burgers", order: 1, itemCount: 4 },
    { id: "pp-sides", name: "Sides", order: 2, itemCount: 3 },
    { id: "pp-shakes", name: "Shakes", order: 3, itemCount: 2 },
  ],
  featuredOffers: [],
  bestSellers: [],
  popularCombos: [],
  recommendations: [],
  recentlyViewed: [],
  quickReorder: [],
};

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function mount(element: React.ReactElement) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(element));
}

afterEach(async () => {
  const mounted = root;
  if (mounted) await act(async () => mounted.unmount());
  root = null;
  host?.remove();
  host = null;
  vi.clearAllMocks();
});

beforeEach(() => {
  fixture.getHome.mockImplementation(() => new Promise(() => {}));
  useHomeStore.getState().reset();
  useHomeStore.setState({
    status: "ready",
    bundle,
    lastLoadedStoreId: "store-A",
    lastLoadedUserId: null,
    error: null,
  });
});

describe("Home follows the observed Martinoz structure", () => {
  it("has exactly one page heading and never puts a product-style h3 before an h2", async () => {
    useHomeStore.setState({ bundle: {
      ...bundle,
      bestSellers: [{ id: "actual-burger", categoryId: "pp-burger", name: "Actual burger", price: 213, veg: true, inStock: true }],
    } });
    await mount(<HomePage />);
    expect(host!.querySelectorAll("h1")).toHaveLength(1);
    expect(host!.querySelector("h1")!.textContent).toBe("Burgonomics Home");
    const levels = Array.from(host!.querySelectorAll("h1,h2,h3")).map(heading => Number(heading.tagName[1]));
    const firstH2 = levels.indexOf(2);
    expect(firstH2).toBeGreaterThan(0);
    expect(levels.slice(0, firstH2).every(level => level === 1 || level === 2)).toBe(true);
  });

  it("shows the promised product and meal rails after On the menu when the real bundle supplies them", async () => {
    useHomeStore.setState({ bundle: {
      ...bundle,
      bestSellers: [{ id: "actual-burger", categoryId: "pp-burger", name: "Actual burger", price: 213, veg: true, inStock: true }],
      popularCombos: [{ id: "actual-meal", name: "Actual meal", description: "Catalog description", price: 327, originalPrice: 327, gradient: "", visual: "" }],
    } });
    await mount(<HomePage />);
    const headings = Array.from(host!.querySelectorAll("h2")).map((heading) => heading.textContent);
    expect(headings).toEqual(["On the menu", "Best sellers", "Make it a meal"]);
    expect(host!.querySelectorAll('[aria-labelledby="best-heading"]')).toHaveLength(1);
    expect(host!.querySelectorAll('[aria-labelledby="combos-heading"]')).toHaveLength(1);
  });

  it("puts Search in the Menu heading row, after the promo and nowhere before it", async () => {
    await mount(<HomePage />);

    const search = host!.querySelectorAll('[aria-label="Search the menu"]');
    expect(search).toHaveLength(1);
    const button = search[0] as HTMLElement;

    const banner = host!.querySelector('[data-testid="banner"]')!;
    expect(banner).not.toBeNull();
    // The only search control must come after the promo, never in the header.
    const position = banner.compareDocumentPosition(button);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const heading = host!.querySelector("#cats-heading")!;
    expect(heading.textContent).toBe("On the menu");
    expect(heading.parentElement?.contains(button)).toBe(true);
    expect(heading.closest("header")).toBeNull();
    // Header renders before the promo, and holds no search of its own.
    const header = host!.querySelector('[data-testid="brand-header"]')!;
    expect(header.querySelector('[aria-label="Search the menu"]')).toBeNull();
    // Owner rejected the viewport-fitting shrink. Large squares scroll naturally.
    expect(host!.querySelector<HTMLElement>('[data-testid="category-grid"]')!.dataset.fit).toBe("false");
  });

  it("renders available full-bleed shortcut squares with a stationary label and no empty Wraps card", async () => {
    await mount(<CategoryGrid categories={bundle.categories} />);

    const tiles = Array.from(host!.querySelectorAll<HTMLButtonElement>("button"));
    expect(tiles).toHaveLength(3);
    for (const tile of tiles) {
      // A square sizing cell shares a grid row with the label. Unlike putting
      // aspect-ratio on the button, it cannot cap the wrapped label's height.
      expect(tile.classList.contains("before:aspect-square")).toBe(true);
      expect(tile.classList.contains("grid-cols-1")).toBe(true);
      expect(tile.classList.contains("aspect-square")).toBe(false);
      expect(tile.className).toContain("min-h-11");
      const heading = tile.querySelector("h4")!;
      // Label sits in its own layer, never inside the flipping photo subtree,
      // and lives in normal flow (no absolute clipping at 200% text).
      expect(heading.closest(".home-shortcut-photo")).toBeNull();
      const scrim = heading.parentElement!;
      expect(scrim.className).toContain("pointer-events-none");
      expect(scrim.className).toContain("self-end");
      expect(scrim.className).toContain("row-start-1");
      expect(scrim.className).not.toContain("absolute");
      // White on the photo scrim; primary on the neutral unavailable card.
      if (tile.querySelector("img")) {
        expect(heading.className).toContain("text-white");
        expect(scrim.className).toContain("bg-gradient-to-t");
      } else {
        expect(heading.className).toContain("text-text-primary");
        expect(scrim.className).not.toContain("bg-gradient-to-t");
      }
    }

    // Full-bleed: the photo layer covers the whole tile, no framed thumbnail box.
    const photo = tiles[0].querySelector(".home-shortcut-photo")!;
    expect(photo.className).toContain("absolute");
    expect(photo.className).toContain("inset-0");

    // Wraps stays honestly unavailable: no invented photo, no invented target.
    expect(tiles.find((tile) => tile.textContent?.includes("Wraps"))).toBeUndefined();
  });

  it("keeps the mode control to one 48px text row without icon-over-label", async () => {
    await mount(<ModeSegmentedSwitch value="delivery" onChange={vi.fn()} />);

    const radios = Array.from(host!.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
    expect(radios.map((radio) => radio.textContent)).toEqual(["Delivery", "Takeaway", "Dine-in"]);
    for (const radio of radios) {
      expect(radio.className).toContain("min-h-12");
      // No icon SVG: the label is the whole control.
      expect(radio.querySelector("svg")).toBeNull();
    }
    expect(radios[0].getAttribute("aria-checked")).toBe("true");
    expect(radios[0].className).toContain("bg-primary");
    // The track is one row, not a stacked tile grid.
    expect(radios[0].parentElement?.className).toContain("flex");
    expect(radios[0].parentElement?.className).not.toContain("grid-cols");
  });
});
