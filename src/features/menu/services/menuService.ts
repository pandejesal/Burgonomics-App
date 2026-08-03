import { delay, ok, type ApiResult } from "@/core/network/http";
import type {
  CustomizationGroup,
  MenuCategoryModel,
  Product,
  ProductDetails,
  ProductPage,
  SearchSuggestion,
} from "@/features/menu/models";
import {
  SAMPLE_CATEGORIES,
  SAMPLE_PRODUCTS,
  customizationsFor,
  detailsFor,
} from "@/features/menu/data/petpoojaSampleData";
import { useDemoStore } from "@/features/demo/state/demoStore";

/**
 * Legacy alias types kept for cross-feature imports (Home, Offers).
 * The canonical shapes live in `@/features/menu/models`.
 */
export type MenuCategory = MenuCategoryModel & { itemCount: number };
export type MenuItem = Product;

/**
 * Mock MenuService — mirrors the contract of the future PETPOOJA-backed
 * HTTP client. When demo/simulation mode is enabled (`useDemoStore`)
 * the service serves a rich PETPOOJA-shaped sample catalogue so the
 * full customer journey can be exercised end to end. When disabled it
 * returns empty payloads so the UI degrades cleanly to empty states
 * until the real backend is wired.
 *
 * Repository consumers should not import this service directly —
 * always go through `MenuRepository`.
 *
 * Endpoints modelled (future backend mapping):
 *   listCategories       → GET  /v1/menu/categories?storeId=…
 *   listProducts         → GET  /v1/menu/products?storeId=…&categoryId=…&page=…
 *   getProduct           → GET  /v1/menu/products/{id}?storeId=…
 *   listCustomizations   → GET  /v1/menu/products/{id}/customizations
 *   listRelatedProducts  → GET  /v1/menu/products/{id}/related
 *   listPopular          → GET  /v1/menu/popular?storeId=…
 *   listFeatured         → GET  /v1/menu/featured?storeId=…
 *   search               → GET  /v1/menu/search?storeId=…&q=…
 *   suggest              → GET  /v1/menu/search/suggest?storeId=…&q=…
 */

const isDemo = () => true;

function categoryItemCount(id: string): number {
  return SAMPLE_PRODUCTS.filter((p) => p.categoryId === id).length;
}

function filterProducts(categoryId?: string): Product[] {
  const list = categoryId
    ? SAMPLE_PRODUCTS.filter((p) => p.categoryId === categoryId)
    : SAMPLE_PRODUCTS;
  return list;
}

function levenshteinDistance(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;
  const d: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let j = 1; j <= n; j++) {
    for (let i = 1; i <= m; i++) {
      if (s1[i - 1] === s2[j - 1]) {
        d[i][j] = d[i - 1][j - 1];
      } else {
        d[i][j] = Math.min(
          d[i - 1][j] + 1, // deletion
          d[i][j - 1] + 1, // insertion
          d[i - 1][j - 1] + 1, // substitution
        );
      }
    }
  }
  return d[m][n];
}

function fuzzyMatch(text: string, query: string): boolean {
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  if (t.includes(q)) return true;

  const words = q.split(/\s+/).filter(Boolean);
  const textWords = t.split(/[^a-z0-9]+/).filter(Boolean);

  if (words.length === 0) return false;

  // Every word in the search query should fuzzy match at least one word in the product text
  return words.every((qw) => {
    if (qw.length < 3) {
      return textWords.some((tw) => tw.startsWith(qw));
    }
    return textWords.some((tw) => {
      if (tw.startsWith(qw) || qw.startsWith(tw)) return true;
      const maxDistance = qw.length >= 6 ? 2 : 1;
      return levenshteinDistance(qw, tw) <= maxDistance;
    });
  });
}

function paginate<T>(items: T[], page: number, pageSize: number) {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

function bySearch(q: string): Product[] {
  const term = q.trim().toLowerCase();
  if (!term) return [];
  return SAMPLE_PRODUCTS.filter((p) => {
    const haystack = [p.name, p.description ?? "", ...(p.tags ?? [])].join(" ");
    return fuzzyMatch(haystack, term);
  });
}

export const menuService = {
  async listCategories(_storeId?: string): Promise<ApiResult<MenuCategory[]>> {
    await delay(150);
    if (!isDemo()) return ok([]);
    return ok(SAMPLE_CATEGORIES.map((c) => ({ ...c, itemCount: categoryItemCount(c.id) })));
  },

  async listProducts(
    _storeId: string | undefined,
    categoryId: string | undefined,
    page = 1,
    pageSize = 20,
  ): Promise<ApiResult<ProductPage>> {
    await delay(220);
    if (!isDemo()) return ok({ items: [], page, pageSize, total: 0 });
    const all = filterProducts(categoryId);
    return ok({ items: paginate(all, page, pageSize), page, pageSize, total: all.length });
  },

  async getProduct(id: string, _storeId?: string): Promise<ApiResult<ProductDetails | null>> {
    await delay(180);
    if (!isDemo()) return ok(null);
    return ok(detailsFor(id));
  },

  async listCustomizations(productId: string): Promise<ApiResult<CustomizationGroup[]>> {
    await delay(120);
    if (!isDemo()) return ok([]);
    return ok(customizationsFor(productId));
  },

  async listRelatedProducts(productId: string, _storeId?: string): Promise<ApiResult<Product[]>> {
    await delay(200);
    if (!isDemo()) return ok([]);
    const source = SAMPLE_PRODUCTS.find((p) => p.id === productId);
    if (!source) return ok([]);
    return ok(
      SAMPLE_PRODUCTS.filter((p) => p.categoryId === source.categoryId && p.id !== productId).slice(
        0,
        6,
      ),
    );
  },

  async listPopular(_storeId?: string): Promise<ApiResult<Product[]>> {
    await delay(200);
    if (!isDemo()) return ok([]);
    return ok(SAMPLE_PRODUCTS.filter((p) => p.tags?.includes("popular")).slice(0, 8));
  },

  async listFeatured(_storeId?: string): Promise<ApiResult<Product[]>> {
    await delay(200);
    if (!isDemo()) return ok([]);
    return ok(SAMPLE_PRODUCTS.filter((p) => p.tags?.includes("featured")).slice(0, 8));
  },

  async search(
    _storeId: string | undefined,
    query: string,
    page = 1,
    pageSize = 20,
  ): Promise<ApiResult<ProductPage>> {
    await delay(200);
    if (!isDemo()) return ok({ items: [], page, pageSize, total: 0 });
    const hits = bySearch(query);
    return ok({ items: paginate(hits, page, pageSize), page, pageSize, total: hits.length });
  },

  async suggest(
    _storeId: string | undefined,
    query: string,
  ): Promise<ApiResult<SearchSuggestion[]>> {
    await delay(120);
    if (!isDemo()) return ok([]);
    return ok(
      bySearch(query)
        .slice(0, 6)
        .map<SearchSuggestion>((p) => ({
          id: `sug_${p.id}`,
          label: p.name,
          kind: "product",
          targetId: p.id,
        })),
    );
  },

  async listTrending(_storeId?: string): Promise<ApiResult<SearchSuggestion[]>> {
    await delay(100);
    if (!isDemo()) return ok([]);
    return ok(
      ["Classic Veggie Burger", "Spicy Paneer Blast", "Salted Fries", "Chocolate Shake"].map(
        (label, i) => ({ id: `tr_${i}`, label, kind: "product" as const }),
      ),
    );
  },

  // Legacy method preserved for cross-feature callers (offers, etc.).
  async listItems(categoryId?: string): Promise<ApiResult<MenuItem[]>> {
    const page = await this.listProducts(undefined, categoryId);
    return page.success ? ok(page.data.items) : page;
  },
  async getItem(id: string): Promise<ApiResult<MenuItem | null>> {
    const detail = await this.getProduct(id);
    return detail.success ? ok(detail.data as MenuItem | null) : detail;
  },
};
