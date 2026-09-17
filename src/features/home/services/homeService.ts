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
import { firestoreService } from "@/core/services/firebase/firestoreService";

/**
 * Home service — fetches real data from Firestore.
 * No mock data in production paths.
 */

function toError(message: string, code = "HOME_UPSTREAM"): { code: string; message: string; retryable?: boolean } {
  return { code, message, retryable: true };
}

export const homeService = {
  async getBanners(): Promise<ApiResult<Banner[]>> {
    try {
      const banners = await firestoreService.getBanners();
      return ok(banners);
    } catch (error) {
      return fail("HOME_UPSTREAM", "Unable to load banners");
    }
  },
  async getCategories(): Promise<ApiResult<MenuCategory[]>> {
    try {
      const categories = await firestoreService.getCategories();
      return ok(categories);
    } catch (error) {
      return fail("HOME_UPSTREAM", "Unable to load categories");
    }
  },
  async getFeaturedOffers(): Promise<ApiResult<Offer[]>> {
    try {
      const offers = await firestoreService.getFeaturedOffers();
      return ok(offers);
    } catch (error) {
      return fail("HOME_UPSTREAM", "Unable to load offers");
    }
  },
  async getBestSellers(storeId: string): Promise<ApiResult<any[]>> {
    try {
      const items = await firestoreService.getBestSellers(storeId);
      return ok(items);
    } catch (error) {
      return fail("HOME_UPSTREAM", "Unable to load best sellers");
    }
  },
  async getPopularCombos(storeId: string): Promise<ApiResult<any[]>> {
    try {
      const combos = await firestoreService.getPopularCombos(storeId);
      return ok(combos);
    } catch (error) {
      return fail("HOME_UPSTREAM", "Unable to load combos");
    }
  },
  async getRecommendations(storeId: string): Promise<ApiResult<any[]>> {
    try {
      const recommendations = await firestoreService.getRecommendations(storeId);
      return ok(recommendations);
    } catch (error) {
      return fail("HOME_UPSTREAM", "Unable to load recommendations");
    }
  },
  async getRecentlyViewed(): Promise<ApiResult<any[]>> {
    try {
      const items = await firestoreService.getRecentlyViewed();
      return ok(items);
    } catch (error) {
      return fail("HOME_UPSTREAM", "Unable to load recently viewed");
    }
  },
  async getQuickReorder(userId: string): Promise<ApiResult<any[]>> {
    try {
      const items = await firestoreService.getQuickReorder(userId);
      return ok(items);
    } catch (error) {
      return fail("HOME_UPSTREAM", "Unable to load quick reorder");
    }
  },

  /**
   * Aggregated home bundle — the shape the real backend is expected to
   * expose as `GET /v1/home?storeId=…`. Fan-outs to the individual
   * mock endpoints so partial failures still degrade gracefully.
   */
  async getHome(storeId: string, userId?: string): Promise<ApiResult<any>> {
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
      userId ? this.getQuickReorder(userId) : Promise.resolve({ success: true, data: [] }),
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
