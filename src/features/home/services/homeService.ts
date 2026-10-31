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
import { menuService } from "@/features/menu/services/menuService";

/**
 * Home service — fetches real data from Firestore.
 * No mock data in production paths.
 */

function toError(
  message: string,
  code = "HOME_UPSTREAM",
): { code: string; message: string; retryable?: boolean } {
  return { code, message, retryable: true };
}

// Editorial picks from the owner-referenced Home proposal, not a sales ranking.
// Names select existing outlet products; they never supply IDs, prices or badges.
const HOME_FEATURED_NAMES = [
  "Cheese Burst Burger",
  "Super Hero Burger",
  "Great Indian Burger",
  "Tandoori Paneer Burger",
  "American Burger",
  "Gochuchang Burger",
];
const normalizedName = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

function selectHomeMerchandising(
  products: readonly MenuItem[],
): Pick<HomeBundle, "bestSellers" | "popularCombos"> {
  const available = products.filter((product) => product.inStock === true);
  const flagged = available.filter((product) =>
    [
      ...(product.tags ?? []),
      ...(product.badges ?? []).map((badge) => `${badge.id} ${badge.label}`),
    ].some((signal) => /best[\s_-]*sellers?/i.test(signal)),
  );
  const featured = HOME_FEATURED_NAMES.flatMap((name) => {
    const match = available.find(
      (product) => normalizedName(product.name) === normalizedName(name),
    );
    return match ? [match] : [];
  });
  const seen = new Set<string>();
  const bestSellers = [...flagged, ...featured]
    .filter((product) => {
      if (seen.has(product.id)) return false;
      seen.add(product.id);
      return true;
    })
    .slice(0, 8);
  const popularCombos: Combo[] = available
    .filter(
      (product) =>
        /combo|meal/i.test(`${product.categoryId} ${product.categoryName ?? ""}`) ||
        /\b(?:combo|meal)s?\b/i.test(product.name),
    )
    .sort((a, b) => Number(/\bmeals?\b/i.test(b.name)) - Number(/\bmeals?\b/i.test(a.name)))
    .slice(0, 8)
    .map((product) => ({
      id: product.id,
      productId: product.id,
      name: product.name,
      description: product.description ?? "",
      price: product.price,
      originalPrice:
        typeof product.compareAtPrice === "number" &&
        Number.isFinite(product.compareAtPrice) &&
        product.compareAtPrice > product.price
          ? product.compareAtPrice
          : product.price,
      imageUrl: product.imageUrl,
      fallbackImageUrl: product.fallbackImageUrl,
      visual: "",
      gradient: "",
    }));
  return { bestSellers, popularCombos };
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
  async getBestSellers(storeId: string): Promise<ApiResult<MenuItem[]>> {
    const catalog = await menuService.listHomeCatalog(storeId);
    return catalog.success
      ? ok(selectHomeMerchandising(catalog.data.products).bestSellers)
      : catalog;
  },
  async getPopularCombos(storeId: string): Promise<ApiResult<Combo[]>> {
    const catalog = await menuService.listHomeCatalog(storeId);
    return catalog.success
      ? ok(selectHomeMerchandising(catalog.data.products).popularCombos)
      : catalog;
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

  /**
   * Aggregated home bundle — the shape the real backend is expected to
   * expose as `GET /v1/home?storeId=…`. Fan-outs to the individual services.
   *
   * Categories and both food rails share one full verified menu snapshot, so
   * they match the Menu's outlet, product IDs, prices and availability.
   * We also fetch Firestore categories (for images) and merge them by name.
   *
   * Reorder history is NOT part of Home: the previous quick-reorder fan-out
   * read the customer's order history on every Home load (and for guests
   * after sign-in churn). Reordering now lives on the empty cart, behind its
   * own authenticated, bounded read.
   */
  async getHome(storeId: string, userId?: string): Promise<ApiResult<HomeBundle>> {
    void userId;
    const [banners, catalog, firestoreCategories, featuredOffers, recommendations, recentlyViewed] =
      await Promise.all([
        this.getBanners(),
        menuService.listHomeCatalog(storeId),
        this.getCategories(), // Firestore categories (for images)
        this.getFeaturedOffers(),
        this.getRecommendations(storeId),
        this.getRecentlyViewed(),
      ]);

    // Catalog failures reach Home's error state, not successful empty food rails.
    if (!catalog.success) return catalog;

    // Metadata can enrich photos, but cannot add categories absent from this store's products.
    const fsCats = firestoreCategories.success ? firestoreCategories.data : [];
    const fsByName = new Map<string, MenuCategory>();
    for (const fc of fsCats) {
      const key = fc.name?.toLowerCase().trim() || "";
      if (key) fsByName.set(key, fc);
    }
    const mergedCategories = catalog.data.categories.map((mc) => {
      const fsCat = fsByName.get(mc.name?.toLowerCase().trim() || "");
      return {
        ...mc,
        imageUrl: fsCat?.imageUrl || mc.imageUrl,
      };
    });

    return ok({
      banners: banners.success ? banners.data : [],
      categories: mergedCategories,
      featuredOffers: featuredOffers.success ? featuredOffers.data : [],
      ...selectHomeMerchandising(catalog.data.products),
      recommendations: recommendations.success ? recommendations.data : [],
      recentlyViewed: recentlyViewed.success ? recentlyViewed.data : [],
      // Deprecated: Home never loads reorder history. Kept for bundle-shape
      // compatibility with persisted/consumer code, always empty.
      quickReorder: [],
    });
  },
};
