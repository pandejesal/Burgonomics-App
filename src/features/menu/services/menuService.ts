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
    data.veg !== undefined
      ? Boolean(data.veg)
      : data.dietaryTag === "veg" || data.item_attributeid === "1";

  const customizations = mapToCustomizationGroups(data.customizations || []);

  const heroUrl = data.heroImageUrl || data.heroImage;
  const standardUrl = data.imageUrl || data.itemimage_url || undefined;
  const finalImageUrl = heroUrl || standardUrl;

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
    categoryId: data.categoryId || "",
    name: data.name || data.itemname || "Product",
    description: data.description || data.itemdescription || "",
    price: typeof data.price === "number" ? data.price : parseFloat(data.price) || 0,
    compareAtPrice: data.compareAtPrice,
    discountPercentage: data.discountPercentage,
    veg,
    imageUrl: finalImageUrl,
    imageUrls: data.imageUrls || (finalImageUrl ? [finalImageUrl] : []),
    fallbackImageUrl: data.fallbackImageUrl,
    inStock: data.isAvailable !== undefined ? Boolean(data.isAvailable) : data.inStock !== false,
    customizable: customizations.length > 0 || Boolean(data.customizable),
    prepTimeMinutes: data.prepTimeMinutes || 15,
    badges,
    tags: data.tags || [],
    unavailableReason: data.unavailableReason,
  };
}

export const menuService = {
  async listCategories(storeId?: string): Promise<ApiResult<MenuCategory[]>> {
    try {
      let q = query(collection(db, "petpooja_categories"));
      if (storeId) {
        q = query(collection(db, "petpooja_categories"), where("restId", "==", storeId));
      }
      const snap = await getDocs(q);
      const categories: MenuCategory[] = [];
      snap.forEach((d) => {
        const data = d.data() as any;
        categories.push({
          id: d.id,
          name: data.name || data.categoryname || "Category",
          slug: data.slug,
          order: data.sortOrder ?? data.order ?? 0,
          itemCount: data.itemCount || 0,
          imageUrl: data.imageUrl || data.categoryimage_url || undefined,
        });
      });

      // If store-specific query returned 0, fallback to general categories
      if (categories.length === 0 && storeId) {
        const fallbackSnap = await getDocs(collection(db, "petpooja_categories"));
        fallbackSnap.forEach((d) => {
          const data = d.data() as any;
          categories.push({
            id: d.id,
            name: data.name || data.categoryname || "Category",
            slug: data.slug,
            order: data.sortOrder ?? data.order ?? 0,
            itemCount: data.itemCount || 0,
            imageUrl: data.imageUrl || data.categoryimage_url || undefined,
          });
        });
      }

      return ok(categories.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
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
      let q = query(collection(db, "petpooja_products"));
      if (storeId && categoryId) {
        q = query(
          collection(db, "petpooja_products"),
          where("restId", "==", storeId),
          where("categoryId", "==", categoryId),
        );
      } else if (categoryId) {
        q = query(collection(db, "petpooja_products"), where("categoryId", "==", categoryId));
      } else if (storeId) {
        q = query(collection(db, "petpooja_products"), where("restId", "==", storeId));
      }

      const snap = await getDocs(q);
      const all: Product[] = [];
      snap.forEach((d) => {
        all.push(mapProductDoc(d.data(), d.id));
      });

      // If store-filtered query returned 0, fallback to general products query
      if (all.length === 0 && storeId) {
        const fallbackQ = categoryId
          ? query(collection(db, "petpooja_products"), where("categoryId", "==", categoryId))
          : collection(db, "petpooja_products");
        const fallbackSnap = await getDocs(fallbackQ);
        fallbackSnap.forEach((d) => {
          all.push(mapProductDoc(d.data(), d.id));
        });
      }

      return ok({ items: paginate(all, page, pageSize), page, pageSize, total: all.length });
    } catch (e: any) {
      console.error("Failed to list products", e);
      return fail("MENU_FETCH_FAILED", "Could not load products.");
    }
  },

  async getProduct(id: string, _storeId?: string): Promise<ApiResult<ProductDetails | null>> {
    try {
      const snap = await getDoc(doc(db, "petpooja_products", id));
      if (!snap.exists()) return ok(null);
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
      const snap = await getDoc(doc(db, "petpooja_products", productId));
      if (!snap.exists()) return ok([]);
      const categoryId = snap.data().categoryId;

      let relQ = query(
        collection(db, "petpooja_products"),
        where("categoryId", "==", categoryId),
        limit(6),
      );
      if (storeId) {
        relQ = query(
          collection(db, "petpooja_products"),
          where("restId", "==", storeId),
          where("categoryId", "==", categoryId),
          limit(6),
        );
      }
      const relSnap = await getDocs(relQ);
      const related: Product[] = [];
      relSnap.forEach((d) => {
        if (d.id !== productId) related.push(mapProductDoc(d.data(), d.id));
      });
      return ok(related);
    } catch (e: any) {
      return ok([]);
    }
  },

  async listPopular(storeId?: string): Promise<ApiResult<Product[]>> {
    try {
      let q = query(
        collection(db, "petpooja_products"),
        where("tags", "array-contains", "popular"),
        limit(8),
      );
      if (storeId) {
        q = query(
          collection(db, "petpooja_products"),
          where("restId", "==", storeId),
          where("tags", "array-contains", "popular"),
          limit(8),
        );
      }
      const snap = await getDocs(q);
      const products: Product[] = [];
      snap.forEach((d) => products.push(mapProductDoc(d.data(), d.id)));
      return ok(products);
    } catch (e) {
      return ok([]);
    }
  },

  async listFeatured(storeId?: string): Promise<ApiResult<Product[]>> {
    try {
      let q = query(
        collection(db, "petpooja_products"),
        where("tags", "array-contains", "featured"),
        limit(8),
      );
      if (storeId) {
        q = query(
          collection(db, "petpooja_products"),
          where("restId", "==", storeId),
          where("tags", "array-contains", "featured"),
          limit(8),
        );
      }
      const snap = await getDocs(q);
      const products: Product[] = [];
      snap.forEach((d) => products.push(mapProductDoc(d.data(), d.id)));
      return ok(products);
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

      let q = query(collection(db, "petpooja_products"));
      if (storeId) {
        q = query(collection(db, "petpooja_products"), where("restId", "==", storeId));
      }
      const snap = await getDocs(q);
      const hits: Product[] = [];
      snap.forEach((d) => {
        const p = mapProductDoc(d.data(), d.id);
        const haystack = [p.name, p.description ?? "", ...(p.tags ?? [])].join(" ");
        if (fuzzyMatch(haystack, term)) {
          hits.push(p);
        }
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
   * Real-time listener for Petpooja menu categories (<5s sync).
   */
  subscribeCategories(
    storeId: string | undefined,
    callback: (result: ApiResult<MenuCategory[]>) => void,
  ): () => void {
    let q = query(collection(db, "petpooja_categories"));
    if (storeId) {
      q = query(collection(db, "petpooja_categories"), where("restId", "==", storeId));
    }

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const categories: MenuCategory[] = [];
        snap.forEach((d) => {
          const data = d.data() as any;
          categories.push({
            id: d.id,
            name: data.name || data.categoryname || "Category",
            slug: data.slug,
            order: data.sortOrder ?? data.order ?? 0,
            itemCount: data.itemCount || 0,
            imageUrl: data.imageUrl || data.categoryimage_url || undefined,
          });
        });
        callback(ok(categories.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))));
      },
      (err) => {
        console.warn("menuService.subscribeCategories snapshot error:", err);
        callback(fail("MENU_SYNC_FAILED", "Failed to sync categories in real-time."));
      },
    );

    return unsubscribe;
  },

  /**
   * Real-time listener for Petpooja menu products & 86ing (<5s sync).
   */
  subscribeProducts(
    storeId: string | undefined,
    categoryId: string | undefined,
    callback: (result: ApiResult<ProductPage>) => void,
    page = 1,
    pageSize = 40,
  ): () => void {
    let q = query(collection(db, "petpooja_products"));
    if (storeId && categoryId) {
      q = query(
        collection(db, "petpooja_products"),
        where("restId", "==", storeId),
        where("categoryId", "==", categoryId),
      );
    } else if (categoryId) {
      q = query(collection(db, "petpooja_products"), where("categoryId", "==", categoryId));
    } else if (storeId) {
      q = query(collection(db, "petpooja_products"), where("restId", "==", storeId));
    }

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const all: Product[] = [];
        snap.forEach((d) => {
          all.push(mapProductDoc(d.data(), d.id));
        });
        callback(ok({ items: paginate(all, page, pageSize), page, pageSize, total: all.length }));
      },
      (err) => {
        console.warn("menuService.subscribeProducts snapshot error:", err);
        callback(fail("MENU_SYNC_FAILED", "Failed to sync products in real-time."));
      },
    );

    return unsubscribe;
  },

  /**
   * Real-time single product listener (e.g. For product details modal).
   */
  subscribeProduct(
    id: string,
    callback: (result: ApiResult<ProductDetails | null>) => void,
  ): () => void {
    const unsub = onSnapshot(
      doc(db, "petpooja_products", id),
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
