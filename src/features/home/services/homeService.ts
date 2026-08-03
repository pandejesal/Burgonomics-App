import { delay, fail, ok, type ApiResult } from "@/core/network/http";
import type { MenuCategory, MenuItem } from "@/features/menu/services/menuService";
import type { Offer } from "@/features/offers/models";
import type {
  Banner,
  Combo,
  HomeBundle,
  QuickReorderItem,
  RecommendationItem,
} from "@/features/home/models";
import {
  MOCK_BANNERS,
  MOCK_BEST_SELLERS,
  MOCK_CATEGORIES,
  MOCK_COMBOS,
  MOCK_FEATURED_OFFERS,
  MOCK_QUICK_REORDER,
  MOCK_RECENTLY_VIEWED,
  MOCK_RECOMMENDATIONS,
} from "@/features/home/data/mockHome";

/**
 * Mock home service — mirrors the shape of the real HTTP client the
 * backend prompt will introduce. Realistic 150–400ms delays keep
 * skeleton/loading UX honest.
 */

/** ~10% simulated failure surface, controllable per call. */
function maybeFail<T>(data: T, chance = 0): ApiResult<T> {
  if (chance > 0 && Math.random() < chance) {
    return fail("HOME_UPSTREAM", "Unable to load right now. Please try again.", true);
  }
  return ok(data);
}

export const homeService = {
  async getBanners(): Promise<ApiResult<Banner[]>> {
    await delay(200);
    return maybeFail(MOCK_BANNERS);
  },
  async getCategories(): Promise<ApiResult<MenuCategory[]>> {
    await delay(180);
    return maybeFail(MOCK_CATEGORIES);
  },
  async getFeaturedOffers(): Promise<ApiResult<Offer[]>> {
    await delay(220);
    return maybeFail(MOCK_FEATURED_OFFERS);
  },
  async getBestSellers(_storeId: string): Promise<ApiResult<MenuItem[]>> {
    await delay(260);
    return maybeFail(MOCK_BEST_SELLERS);
  },
  async getPopularCombos(_storeId: string): Promise<ApiResult<Combo[]>> {
    await delay(240);
    return maybeFail(MOCK_COMBOS);
  },
  async getRecommendations(_storeId: string): Promise<ApiResult<RecommendationItem[]>> {
    await delay(300);
    return maybeFail(MOCK_RECOMMENDATIONS);
  },
  async getRecentlyViewed(): Promise<ApiResult<MenuItem[]>> {
    await delay(120);
    return ok(MOCK_RECENTLY_VIEWED);
  },
  async getQuickReorder(_userId: string): Promise<ApiResult<QuickReorderItem[]>> {
    await delay(200);
    return ok(MOCK_QUICK_REORDER);
  },

  /**
   * Aggregated home bundle — the shape the real backend is expected to
   * expose as `GET /v1/home?storeId=…`. Fan-outs to the individual
   * mock endpoints so partial failures still degrade gracefully.
   */
  async getHome(storeId: string, userId?: string): Promise<ApiResult<HomeBundle>> {
    const [
      banners,
      categories,
      featuredOffers,
      bestSellers,
      popularCombos,
      recommendations,
      recentlyViewed,
      quickReorder,
    ] = await Promise.all([
      this.getBanners(),
      this.getCategories(),
      this.getFeaturedOffers(),
      this.getBestSellers(storeId),
      this.getPopularCombos(storeId),
      this.getRecommendations(storeId),
      this.getRecentlyViewed(),
      userId ? this.getQuickReorder(userId) : Promise.resolve(ok([] as QuickReorderItem[])),
    ]);

    return ok({
      banners: banners.success ? banners.data : [],
      categories: categories.success ? categories.data : [],
      featuredOffers: featuredOffers.success ? featuredOffers.data : [],
      bestSellers: bestSellers.success ? bestSellers.data : [],
      popularCombos: popularCombos.success ? popularCombos.data : [],
      recommendations: recommendations.success ? recommendations.data : [],
      recentlyViewed: recentlyViewed.success ? recentlyViewed.data : [],
      quickReorder: quickReorder.success ? quickReorder.data : [],
    });
  },
};
