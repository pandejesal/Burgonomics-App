import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/core/network/http";
import type { MenuCategory } from "@/features/menu/services/menuService";

// No Firebase initialization or provider reads: all aggregate inputs are hermetic.
vi.mock("@/core/services/firebase/firestoreService", () => ({ firestoreService: {} }));
vi.mock("@/features/menu/services/menuService", () => ({
  menuService: { listHomeCatalog: vi.fn() },
}));

import { menuService } from "@/features/menu/services/menuService";
import { homeService } from "./homeService";
import { useHomeStore } from "@/features/home/state/homeStore";
import { resolveHomeMenuShortcuts } from "@/features/home/utils/menuShortcuts";

const metadataCategories: MenuCategory[] = [
  { id: "global-burgers", name: "Classic Burgers", itemCount: 99, imageUrl: "/global-burger.jpg" },
  { id: "global-wraps", name: "Wraps", itemCount: 99, imageUrl: "/global-wrap.jpg" },
  { id: "global-sides", name: "Sides", itemCount: 99 },
  { id: "global-shakes", name: "Shakes", itemCount: 99 },
];

beforeEach(() => {
  useHomeStore.getState().reset();
  vi.mocked(menuService.listHomeCatalog).mockResolvedValue(ok({ products: [], categories: [] }));
  vi.spyOn(homeService, "getBanners").mockResolvedValue(ok([]));
  vi.spyOn(homeService, "getCategories").mockResolvedValue(ok(metadataCategories));
  vi.spyOn(homeService, "getFeaturedOffers").mockResolvedValue(ok([]));
  vi.spyOn(homeService, "getBestSellers").mockResolvedValue(ok([]));
  vi.spyOn(homeService, "getPopularCombos").mockResolvedValue(ok([]));
  vi.spyOn(homeService, "getRecommendations").mockResolvedValue(ok([]));
  vi.spyOn(homeService, "getRecentlyViewed").mockResolvedValue(ok([]));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("selected-store shortcut provenance", () => {
  it("does not let global metadata activate shortcuts for an empty product-derived menu", async () => {
    await useHomeStore.getState().load("selected-store");
    const { bundle, status } = useHomeStore.getState();
    expect(menuService.listHomeCatalog).toHaveBeenCalledWith("selected-store");
    expect(status).toBe("empty");
    expect(bundle?.categories).toEqual([]);
    expect(resolveHomeMenuShortcuts(bundle!.categories)).toEqual([]);
  });

  it("surfaces a product-category failure through the existing Home error state", async () => {
    vi.mocked(menuService.listHomeCatalog).mockResolvedValue(
      fail("MENU_FETCH_FAILED", "Could not load menu categories.", true),
    );
    await useHomeStore.getState().load("selected-store");
    expect(useHomeStore.getState()).toMatchObject({
      status: "error", error: "Could not load menu categories.", bundle: null,
    });
  });

  it("retains only real product-derived IDs and order when enriching matching metadata", async () => {
    const loadedCategories: MenuCategory[] = [
      { id: "pp-coffee", name: "Cold Coffee", order: 7, itemCount: 2 },
      { id: "pp-classic", name: "Classic Burgers", order: 3, itemCount: 4 },
    ];
    vi.mocked(menuService.listHomeCatalog).mockResolvedValue(ok({ products: [], categories: loadedCategories }));
    const result = await homeService.getHome("selected-store");
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error.message);
    expect(result.data.categories).toEqual([
      loadedCategories[0],
      { ...loadedCategories[1], imageUrl: "/global-burger.jpg" },
    ]);
    const shortcuts = resolveHomeMenuShortcuts(result.data.categories);
    expect(shortcuts[0].members.map(({ id }) => id)).toEqual(["pp-classic"]);
    expect(shortcuts[1].members).toEqual([]);
    expect(shortcuts[2].members).toEqual([]);
    expect(shortcuts[3].members.map(({ id }) => id)).toEqual(["pp-coffee"]);
  });

  it("keeps valid selected-store categories when optional image metadata fails", async () => {
    const loadedCategory: MenuCategory = {
      id: "pp-sides", name: "Sides", itemCount: 2, imageUrl: "/product-derived.jpg",
    };
    vi.mocked(menuService.listHomeCatalog).mockResolvedValue(ok({ products: [], categories: [loadedCategory] }));
    vi.mocked(homeService.getCategories).mockResolvedValue(fail("HOME_UPSTREAM", "Metadata unavailable"));
    const result = await homeService.getHome("selected-store");
    expect(result).toMatchObject({ success: true, data: { categories: [loadedCategory] } });
  });
});
