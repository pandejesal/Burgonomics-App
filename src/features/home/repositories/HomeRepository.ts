import type { ApiResult } from "@/core/network/http";
import { homeService } from "@/features/home/services/homeService";
import type {
  Banner,
  Combo,
  HomeBundle,
  QuickReorderItem,
  RecommendationItem,
} from "@/features/home/models";
import type { MenuCategory, MenuItem } from "@/features/menu/services/menuService";
import type { Offer } from "@/features/offers/models";

/**
 * HomeRepository is the ONLY entry point feature UI code may use for
 * home-screen data. The service can be swapped for an HTTP client
 * without touching a single component.
 */
export class HomeRepository {
  constructor(private readonly service = homeService) {}

  getHome(storeId: string, userId?: string): Promise<ApiResult<HomeBundle>> {
    return this.service.getHome(storeId, userId);
  }

  getBanners(): Promise<ApiResult<Banner[]>> {
    return this.service.getBanners();
  }
  getCategories(): Promise<ApiResult<MenuCategory[]>> {
    return this.service.getCategories();
  }
  getFeaturedOffers(): Promise<ApiResult<Offer[]>> {
    return this.service.getFeaturedOffers();
  }
  getBestSellers(storeId: string): Promise<ApiResult<MenuItem[]>> {
    return this.service.getBestSellers(storeId);
  }
  getPopularCombos(storeId: string): Promise<ApiResult<Combo[]>> {
    return this.service.getPopularCombos(storeId);
  }
  getRecommendations(storeId: string): Promise<ApiResult<RecommendationItem[]>> {
    return this.service.getRecommendations(storeId);
  }
  getQuickReorder(userId: string): Promise<ApiResult<QuickReorderItem[]>> {
    return this.service.getQuickReorder(userId);
  }
}

export const homeRepository = new HomeRepository();
