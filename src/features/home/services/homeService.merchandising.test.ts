import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/core/network/http";
import type { Product } from "@/features/menu/models";

const firestore = vi.hoisted(() => ({
  getBanners: vi.fn(), getCategories: vi.fn(), getFeaturedOffers: vi.fn(),
  getBestSellers: vi.fn(), getPopularCombos: vi.fn(), getRecommendations: vi.fn(),
  getRecentlyViewed: vi.fn(), getQuickReorder: vi.fn(),
}));
vi.mock("@/core/services/firebase/firestoreService", () => ({ firestoreService: firestore }));
vi.mock("@/features/menu/services/menuService", () => ({
  menuService: { listCategories: vi.fn(), listHomeCatalog: vi.fn() },
}));

import { menuService } from "@/features/menu/services/menuService";
import { homeService } from "./homeService";

function product(id: string, name: string, changes: Partial<Product> = {}): Product {
  return {
    id, name, categoryId: "pp-burgers", categoryName: "Classic Burgers",
    price: 237, inStock: true, veg: true, description: "Actual catalog description",
    imageUrl: "/actual-catalog-photo.jpg", ...changes,
  };
}
const cheese = product("pp-cheese", "Cheese Burst Burger", { price: 213 });
const hero = product("pp-hero", "Super Hero Burger", { price: 241 });
const indian = product("pp-indian", "Great Indian Burger", { price: 187 });
const meal = product("812736", "Any Big Bang Burger Meal", {
  categoryId: "pp-meals", categoryName: "Burger Meals", price: 327,
});

function setCatalog(products: Product[]) {
  const categories = [{ id: "pp-burgers", name: "Classic Burgers", itemCount: products.length }];
  vi.mocked(menuService.listCategories).mockResolvedValue(ok(categories));
  vi.mocked(menuService.listHomeCatalog).mockResolvedValue(ok({ products, categories }));
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const method of Object.values(firestore)) method.mockResolvedValue([]);
  setCatalog([cheese, hero, indian, meal]);
});

describe("Home merchandising comes from the actual selected-store menu", () => {
  it("populates both promised rails without legacy flags or a separate combo collection", async () => {
    const result = await homeService.getHome("selected-store");
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error.message);
    expect(result.data.bestSellers).toEqual([cheese, hero, indian]);
    expect(result.data.popularCombos).toEqual([expect.objectContaining({
      id: meal.id, productId: meal.id, name: meal.name, price: 327,
      originalPrice: 327, description: meal.description, imageUrl: meal.imageUrl,
    })]);
    expect(menuService.listHomeCatalog).toHaveBeenCalledWith("selected-store");
    expect(firestore.getBestSellers).not.toHaveBeenCalled();
    expect(firestore.getPopularCombos).not.toHaveBeenCalled();
    expect(firestore.getQuickReorder).not.toHaveBeenCalled();
  });

  it("prefers actual bestseller signals without adding a fake badge to the agreed unflagged picks", async () => {
    const flagged = product("flagged-item", "Another real burger", {
      badges: [{ id: "bestseller", label: "Bestseller" }],
    });
    setCatalog([cheese, flagged, hero]);
    const result = await homeService.getHome("selected-store");
    if (!result.success) throw new Error(result.error.message);
    expect(result.data.bestSellers.map((p: Product) => p.id)).toEqual([flagged.id, cheese.id, hero.id]);
    expect(result.data.bestSellers.find((p: Product) => p.id === cheese.id)?.badges).toBeUndefined();
    expect(cheese.badges).toBeUndefined();
  });

  it("never substitutes wrong-store legacy rows, sold-out picks or arbitrary products", async () => {
    firestore.getBestSellers.mockResolvedValue([product("other-store", "Wrong outlet's item")]);
    firestore.getPopularCombos.mockResolvedValue([{ id: "other-combo", name: "Wrong outlet's combo" }]);
    setCatalog([product("unknown", "An unselected item"), { ...cheese, inStock: false }, { ...meal, inStock: false }]);
    const result = await homeService.getHome("selected-store");
    if (!result.success) throw new Error(result.error.message);
    expect(result.data.bestSellers).toEqual([]);
    expect(result.data.popularCombos).toEqual([]);
  });

  it("uses meal products beyond page one and only real compare-at prices for savings", async () => {
    const filler = Array.from({ length: 150 }, (_, i) => product(`filler-${i}`, `Unselected item ${i}`));
    setCatalog([...filler, { ...meal, compareAtPrice: 380 }, cheese]);
    const result = await homeService.getHome("selected-store");
    if (!result.success) throw new Error(result.error.message);
    expect(result.data.bestSellers).toEqual([cheese]);
    expect(result.data.popularCombos).toEqual([expect.objectContaining({ price: 327, originalPrice: 380 })]);
  });

  it("leads Make it a meal with actual meal products before other combo-category bundles", async () => {
    const bundle = product("two-burgers", "2 Jr. Hero Burger", {
      categoryId: "cat_combos", categoryName: "Combos", price: 109,
    });
    setCatalog([bundle, meal]);
    const result = await homeService.getHome("selected-store");
    if (!result.success) throw new Error(result.error.message);
    expect(result.data.popularCombos.map((combo: { id: string }) => combo.id)).toEqual([meal.id, bundle.id]);
  });

  it("propagates a catalog failure instead of hiding the failure behind empty rails", async () => {
    vi.mocked(menuService.listHomeCatalog).mockResolvedValue(fail("MENU_FETCH_FAILED", "Store catalog unavailable"));
    const result = await homeService.getHome("selected-store");
    expect(result).toMatchObject({ success: false, error: { message: "Store catalog unavailable" } });
  });

  it("keeps an honestly empty store empty rather than inserting proposal products", async () => {
    setCatalog([]);
    const result = await homeService.getHome("selected-store");
    if (!result.success) throw new Error(result.error.message);
    expect(result.data.bestSellers).toEqual([]);
    expect(result.data.popularCombos).toEqual([]);
  });
});
