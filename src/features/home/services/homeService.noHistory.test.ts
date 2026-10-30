import { beforeEach, describe, expect, it, vi } from "vitest";
import { ok } from "@/core/network/http";

const firestore = vi.hoisted(() => ({
  getBanners: vi.fn(),
  getCategories: vi.fn(),
  getFeaturedOffers: vi.fn(),
  getBestSellers: vi.fn(),
  getPopularCombos: vi.fn(),
  getRecommendations: vi.fn(),
  getRecentlyViewed: vi.fn(),
  getQuickReorder: vi.fn(),
}));

vi.mock("@/core/services/firebase/firestoreService", () => ({ firestoreService: firestore }));
vi.mock("@/features/menu/services/menuService", () => ({
  menuService: { listHomeCatalog: vi.fn() },
}));

import { menuService } from "@/features/menu/services/menuService";
import { homeService } from "./homeService";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(menuService.listHomeCatalog).mockResolvedValue(ok({ products: [], categories: [] }));
  firestore.getBanners.mockResolvedValue([]);
  firestore.getCategories.mockResolvedValue([]);
  firestore.getFeaturedOffers.mockResolvedValue([]);
  firestore.getBestSellers.mockResolvedValue([]);
  firestore.getPopularCombos.mockResolvedValue([]);
  firestore.getRecommendations.mockResolvedValue([]);
  firestore.getRecentlyViewed.mockResolvedValue([]);
  firestore.getQuickReorder.mockResolvedValue([]);
});

describe("Home aggregate does not load order history", () => {
  it("never calls the quick-reorder reader, even for a signed-in customer", async () => {
    const result = await homeService.getHome("store-A", "uid-1");

    expect(result.success).toBe(true);
    expect(firestore.getQuickReorder).not.toHaveBeenCalled();
    if (!result.success) throw new Error(result.error.message);
    expect(result.data.quickReorder).toEqual([]);
  });

  it("issues zero history reads for a guest", async () => {
    const result = await homeService.getHome("store-A");
    expect(result.success).toBe(true);
    expect(firestore.getQuickReorder).not.toHaveBeenCalled();
  });
});
