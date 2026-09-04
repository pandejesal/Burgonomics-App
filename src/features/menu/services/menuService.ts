import { fail, ok, type ApiResult } from "@/core/network/http";
import { db } from "@/core/config/firebase";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  query,
  where,
  limit,
  onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import type {
  CustomizationGroup,
  CustomizationOption,
  MenuCategoryModel,
  Product,
  ProductDetails,
  ProductPage,
  SearchSuggestion,
} from "@/features/menu/models";

export type MenuCategory = MenuCategoryModel & { itemCount: number };
export type MenuItem = Product;

/**
 * Canonical menu source: the `products` collection (written by server
 * Petpooja sync). Partner filters by `branchId`, Delivery by `restId`
 * (stores/{id}.petpoojaRestId, equal to the branch restId once outlets are
 * linked — Runbook §5). `petpoojaItemId` is the join key for 86-ing.
 * Legacy `petpooja_products` / `petpooja_categories` collections are
 * deprecated and intentionally not read here.
 */

// Helper to paginate a local array
function paginate<T>(items: T[], page: number, pageSize: number) {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

function fuzzyMatch(text: string, query: string): boolean {
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  if (t.includes(q)) return true;

  const words = q.split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;

  return words.every((qw) => t.includes(qw));
}

function mapToCustomizationGroups(raw: any[]): CustomizationGroup[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((group) => {
    const min = group.minSelections ?? group.minSelect ?? 0;
    const max = group.maxSelections ?? group.maxSelect ?? 1;
    const selection = max > 1 ? ("multi" as const) : ("single" as const);
    const required = min > 0;
    const options: CustomizationOption[] = (group.options || []).map((opt: any) => ({
      id: opt.id?.toString() || opt.optionId || "",
      name: opt.name || "",
      priceDelta: typeof opt.price === "number" ? opt.price : parseFloat(opt.price) || 0,
      isDefault: Boolean(opt.isDefault),
      outOfStock: opt.isAvailable === false || opt.outOfStock === true,
    }));
    return {
      id: group.id?.toString() || group.addon_group_id || "",
      name: group.name || group.addon_group_name || "Options",
      selection,
      required,
      minSelect: min,
      maxSelect: max,
      options,
    };
  });
}

function mapProductDoc(data: any, docId: string): Product {
  const veg =
    data.isVeg !== undefined
      ? Boolean(data.isVeg)
      : data.veg !== undefined
        ? Boolean(data.veg)
        : data.dietaryTag === "veg" || data.item_attributeid === "1";

  const customizations = mapToCustomizationGroups(data.customizations || []);

  const imageUrl =
    data.imageUrl || data.image || data.image_url || data.itemimage_url || undefined;

  const badges = Array.isArray(data.badges) ? [...data.badges] : [];
  if (
    data.isBestseller ||
    data.bestseller ||
    (Array.isArray(data.tags) && data.tags.includes("bestseller"))
  ) {
    if (!badges.some((b: any) => b.id === "bestseller")) {
      badges.push({ id: "bestseller", label: "Bestseller", tone: "warning" });
    }
  }
  if (
    data.isChefsSpecial ||
    data.chefsSpecial ||
    (Array.isArray(data.tags) && data.tags.includes("chef_special"))
  ) {
    if (!badges.some((b: any) => b.id === "chefs_special")) {
      badges.push({ id: "chefs_special", label: "Chef's Special", tone: "primary" });
    }
  }
  if (data.isNew || data.new || (Array.isArray(data.tags) && data.tags.includes("new"))) {
    if (!badges.some((b: any) => b.id === "new")) {
      badges.push({ id: "new", label: "New", tone: "success" });
    }
  }

  return {
    id: docId,
    categoryId: data.categoryId || "uncategorized",
    categoryName: data.categoryName || data.categoryname || undefined,
    name: data.name || data.itemname || "Product",
    description: data.description || data.itemdescription || "",
    price: typeof data.price === "number" ? data.price : parseFloat(data.price) || 0,
    compareAtPrice: data.compareAtPrice,
    discountPercentage: data.discountPercentage,
    veg,
    imageUrl,
    imageUrls: data.imageUrls || (imageUrl ? [imageUrl] : []),
    fallbackImageUrl: data.fallbackImageUrl,
    inStock:
      data.inStock !== undefined
        ? Boolean(data.inStock)
        : data.isAvailable !== undefined
          ? Boolean(data.isAvailable)
          : true,
    customizable: customizations.length > 0 || Boolean(data.customizable),
    prepTimeMinutes: data.prepTimeMinutes || 15,
    badges,
    tags: data.tags || [],
    unavailableReason: data.unavailableReason,
  };
}

/** Delivery store id → Petpooja restID (equal once outlets are linked). */
async function resolveRestId(storeId: string | undefined): Promise<string | undefined> {
  if (!storeId) return undefined;
  try {
    const snap = await getDoc(doc(db, "stores", storeId));
    const restId = (snap.data() as any)?.petpoojaRestId;
    if (typeof restId === "string" && restId.length > 0) return restId;
  } catch {
    // store lookup failure — fall through to raw store id
  }
  return storeId;
}

async function fetchStoreProducts(restId: string | undefined): Promise<Product[]> {
  const q = restId
    ? query(collection(db, "products"), where("restId", "==", restId))
    : query(collection(db, "products"), limit(100));
  const snap = await getDocs(q);
  const all: Product[] = [];
  snap.forEach((d) => {
    all.push(mapProductDoc(d.data(), d.id));
  });
  return all;
}

function deriveCategories(all: Product[]): MenuCategory[] {
  const seen = new Map<string, MenuCategory>();
  for (const p of all) {
    const id = p.categoryId || "uncategorized";
    const existing = seen.get(id);
    if (existing) {
      existing.itemCount += 1;
    } else {
      seen.set(id, {
        id,
        name: p.categoryName || id,
        order: seen.size + 1,
        itemCount: 1,
        imageUrl: p.imageUrl,
      });
    }
  }
  return [...seen.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export const menuService = {
  async listCategories(storeId?: string): Promise<ApiResult<MenuCategory[]>> {
    try {
      const restId = await resolveRestId(storeId);
      const all = await fetchStoreProducts(restId);
      return ok(deriveCategories(all));
    } catch (e: any) {
      console.error("Failed to list categories", e);
      return fail("MENU_FETCH_FAILED", "Could not load menu categories.");
    }
  },

  async listProducts(
    storeId: string | undefined,
    categoryId: string | undefined,
    page = 1,
    pageSize = 20,
  ): Promise<ApiResult<ProductPage>> {
    try {
      const restId = await resolveRestId(storeId);
      let all = await fetchStoreProducts(restId);
      if (categoryId) {
        all = all.filter((p) => p.categoryId === categoryId);
      }
      return ok({ items: paginate(all, page, pageSize), page, pageSize, total: all.length });
    } catch (e: any) {
      console.error("Failed to list products", e);
      return fail("MENU_FETCH_FAILED", "Could not load products.");
    }
  },

  async getProduct(id: string, _storeId?: string): Promise<ApiResult<ProductDetails | null>> {
    try {
      const direct = await getDoc(doc(db, "products", id));
      let data: any = direct.exists() ? direct.data() : undefined;
      let docId = id;
      if (data === undefined) {
        // Fall back to Petpooja item-id lookup (doc ids are prod_{itemid}).
        const alt = await getDocs(
          query(collection(db, "products"), where("petpoojaItemId", "==", id), limit(1))
        );
        if (alt.empty) return ok(null);
        data = alt.docs[0].data();
        docId = alt.docs[0].id;
      }
      const baseProduct = mapProductDoc(data, docId);
      const customizations = mapToCustomizationGroups(data.customizations || []);

      const details: ProductDetails = {
        ...baseProduct,
        customizations,
        ingredients: data.ingredients || [],
        nutrition: data.nutrition || [],
        allowSpecialInstructions: data.allowSpecialInstructions ?? true,
      };
      return ok(details);
    } catch (e: any) {
      console.error("Failed to get product", e);
      return fail("MENU_FETCH_FAILED", "Could not load product details.");
    }
  },

  async listCustomizations(productId: string): Promise<ApiResult<CustomizationGroup[]>> {
    try {
      const detail = await this.getProduct(productId);
      if (!detail.success || !detail.data) return ok([]);
      return ok(detail.data.customizations || []);
    } catch {
      return ok([]);
    }
  },

  async listRelatedProducts(productId: string, storeId?: string): Promise<ApiResult<Product[]>> {
    try {
      const current = await this.getProduct(productId);
      if (!current.success || !current.data) return ok([]);
      const restId = await resolveRestId(storeId);
      const all = await fetchStoreProducts(restId);
      return ok(all.filter((p) => p.id !== productId && p.categoryId === current.data!.categoryId).slice(0, 6));
    } catch (e: any) {
      return ok([]);
    }
  },

  async listPopular(storeId?: string): Promise<ApiResult<Product[]>> {
    try {
      // Server products carry no popularity tags yet — serve in-stock first.
      const restId = await resolveRestId(storeId);
      const all = await fetchStoreProducts(restId);
      const inStock = all.filter((p) => p.inStock !== false);
      return ok((inStock.length > 0 ? inStock : all).slice(0, 8));
    } catch (e) {
      return ok([]);
    }
  },

  async listFeatured(storeId?: string): Promise<ApiResult<Product[]>> {
    try {
      const restId = await resolveRestId(storeId);
      const all = await fetchStoreProducts(restId);
      const inStock = all.filter((p) => p.inStock !== false);
      return ok((inStock.length > 0 ? inStock : all).slice(0, 8));
    } catch (e) {
      return ok([]);
    }
  },

  async search(
    storeId: string | undefined,
    searchQuery: string,
    page = 1,
    pageSize = 20,
  ): Promise<ApiResult<ProductPage>> {
    try {
      const term = searchQuery.trim().toLowerCase();
      if (!term) return ok({ items: [], page, pageSize, total: 0 });

      const restId = await resolveRestId(storeId);
      const all = await fetchStoreProducts(restId);
      const hits = all.filter((p) => {
        const haystack = [p.name, p.description ?? "", ...(p.tags ?? [])].join(" ");
        return fuzzyMatch(haystack, term);
      });
      return ok({ items: paginate(hits, page, pageSize), page, pageSize, total: hits.length });
    } catch (e: any) {
      return fail("MENU_SEARCH_FAILED", "Search failed.");
    }
  },

  async suggest(
    storeId: string | undefined,
    searchQuery: string,
  ): Promise<ApiResult<SearchSuggestion[]>> {
    const page = await this.search(storeId, searchQuery, 1, 6);
    if (!page.success) return ok([]);
    return ok(
      page.data.items.map((p) => ({
        id: `sug_${p.id}`,
        label: p.name,
        kind: "product",
        targetId: p.id,
      })),
    );
  },

  async listTrending(_storeId?: string): Promise<ApiResult<SearchSuggestion[]>> {
    return ok(
      ["Classic Veggie Burger", "Spicy Paneer Blast", "Salted Fries", "Chocolate Shake"].map(
        (label, i) => ({ id: `tr_${i}`, label, kind: "product" as const }),
      ),
    );
  },

  async listItems(categoryId?: string): Promise<ApiResult<MenuItem[]>> {
    const page = await this.listProducts(undefined, categoryId);
    return page.success ? ok(page.data.items) : page;
  },

  async getItem(id: string): Promise<ApiResult<MenuItem | null>> {
    const detail = await this.getProduct(id);
    return detail.success ? ok(detail.data as MenuItem | null) : detail;
  },

  /**
   * Real-time listener for the canonical `products` collection.
   * Categories derive from the items (single source of truth).
   */
  subscribeCategories(
    storeId: string | undefined,
    callback: (result: ApiResult<MenuCategory[]>) => void,
  ): () => void {
    let innerUnsub: Unsubscribe | null = null;
    let cancelled = false;
    void (async () => {
      try {
        const restId = await resolveRestId(storeId);
        if (cancelled) return;
        const q = restId
          ? query(collection(db, "products"), where("restId", "==", restId))
          : query(collection(db, "products"), limit(100));
        innerUnsub = onSnapshot(
          q,
          (snap) => {
            const all: Product[] = [];
            snap.forEach((d) => all.push(mapProductDoc(d.data(), d.id)));
            callback(ok(deriveCategories(all)));
          },
          (err) => {
            console.warn("menuService.subscribeCategories snapshot error:", err);
            callback(fail("MENU_SYNC_FAILED", "Failed to sync categories in real-time."));
          }
        );
      } catch (err) {
        console.warn("menuService.subscribeCategories setup error:", err);
        callback(fail("MENU_SYNC_FAILED", "Failed to sync categories in real-time."));
      }
    })();

    return () => {
      cancelled = true;
      if (innerUnsub) innerUnsub();
    };
  },

  /**
   * Real-time listener for canonical products & 86ing (<5s sync).
   */
  subscribeProducts(
    storeId: string | undefined,
    categoryId: string | undefined,
    callback: (result: ApiResult<ProductPage>) => void,
    page = 1,
    pageSize = 40,
  ): () => void {
    let innerUnsub: Unsubscribe | null = null;
    let cancelled = false;
    void (async () => {
      try {
        const restId = await resolveRestId(storeId);
        if (cancelled) return;
        const q = restId
          ? query(collection(db, "products"), where("restId", "==", restId))
          : query(collection(db, "products"), limit(100));
        innerUnsub = onSnapshot(
          q,
          (snap) => {
            let all: Product[] = [];
            snap.forEach((d) => {
              all.push(mapProductDoc(d.data(), d.id));
            });
            if (categoryId) all = all.filter((p) => p.categoryId === categoryId);
            callback(ok({ items: paginate(all, page, pageSize), page, pageSize, total: all.length }));
          },
          (err) => {
            console.warn("menuService.subscribeProducts snapshot error:", err);
            callback(fail("MENU_SYNC_FAILED", "Failed to sync products in real-time."));
          },
        );
      } catch (err) {
        console.warn("menuService.subscribeProducts setup error:", err);
        callback(fail("MENU_SYNC_FAILED", "Failed to sync products in real-time."));
      }
    })();

    return () => {
      cancelled = true;
      if (innerUnsub) innerUnsub();
    };
  },

  /**
   * Real-time single product listener (e.g. For product details modal).
   */
  subscribeProduct(
    id: string,
    callback: (result: ApiResult<ProductDetails | null>) => void,
  ): () => void {
    const unsub = onSnapshot(
      doc(db, "products", id),
      (snap) => {
        if (!snap.exists()) {
          callback(ok(null));
          return;
        }
        const data = snap.data();
        const baseProduct = mapProductDoc(data, snap.id);
        const customizations = mapToCustomizationGroups(data.customizations || []);

        const details: ProductDetails = {
          ...baseProduct,
          customizations,
          ingredients: data.ingredients || [],
          nutrition: data.nutrition || [],
          allowSpecialInstructions: data.allowSpecialInstructions ?? true,
        };
        callback(ok(details));
      },
      (err) => {
        console.warn("menuService.subscribeProduct snapshot error:", err);
        callback(fail("PRODUCT_SYNC_FAILED", "Could not sync product details."));
      },
    );

    return unsub;
  },
};
