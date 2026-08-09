import { fail, ok, type ApiResult } from "@/core/network/http";
import { db } from "@/core/config/firebase";
import { collection, getDocs, doc, getDoc, query, where, limit } from "firebase/firestore";
import type {
  CustomizationGroup,
  MenuCategoryModel,
  Product,
  ProductDetails,
  ProductPage,
  SearchSuggestion,
} from "@/features/menu/models";

export type MenuCategory = MenuCategoryModel & { itemCount: number };
export type MenuItem = Product;

// Helper to paginate a local array (since full-text search and complex joins are limited in Firestore without Algolia)
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

export const menuService = {
  async listCategories(_storeId?: string): Promise<ApiResult<MenuCategory[]>> {
    try {
      const snap = await getDocs(collection(db, "petpooja_categories"));
      const categories: MenuCategory[] = [];
      snap.forEach(doc => {
        const data = doc.data() as MenuCategoryModel;
        categories.push({ ...data, itemCount: 0 }); // Item count would ideally be aggregated
      });
      return ok(categories.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
    } catch (e: any) {
      console.error("Failed to list categories", e);
      return fail("MENU_FETCH_FAILED", "Could not load menu categories.");
    }
  },

  async listProducts(
    _storeId: string | undefined,
    categoryId: string | undefined,
    page = 1,
    pageSize = 20,
  ): Promise<ApiResult<ProductPage>> {
    try {
      let q = query(collection(db, "petpooja_products"));
      if (categoryId) {
        q = query(collection(db, "petpooja_products"), where("categoryId", "==", categoryId));
      }
      const snap = await getDocs(q);
      const all: Product[] = [];
      snap.forEach(doc => {
        all.push(doc.data() as Product);
      });
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
      const data = snap.data() as Product;
      
      // In a real DB, customizations would be in a subcollection or array. 
      // We mock empty customizations here if they aren't provided by Petpooja push.
      const details: ProductDetails = {
        ...data,
        customizations: [],
      };
      return ok(details);
    } catch (e: any) {
      console.error("Failed to get product", e);
      return fail("MENU_FETCH_FAILED", "Could not load product details.");
    }
  },

  async listCustomizations(productId: string): Promise<ApiResult<CustomizationGroup[]>> {
    return ok([]); // Customizations not yet synced from Petpooja Webhook
  },

  async listRelatedProducts(productId: string, _storeId?: string): Promise<ApiResult<Product[]>> {
    try {
      const snap = await getDoc(doc(db, "petpooja_products", productId));
      if (!snap.exists()) return ok([]);
      const categoryId = snap.data().categoryId;

      const relQ = query(
        collection(db, "petpooja_products"), 
        where("categoryId", "==", categoryId),
        limit(6)
      );
      const relSnap = await getDocs(relQ);
      const related: Product[] = [];
      relSnap.forEach(d => {
        if (d.id !== productId) related.push(d.data() as Product);
      });
      return ok(related);
    } catch (e: any) {
      return ok([]);
    }
  },

  async listPopular(_storeId?: string): Promise<ApiResult<Product[]>> {
    try {
      const q = query(collection(db, "petpooja_products"), where("tags", "array-contains", "popular"), limit(8));
      const snap = await getDocs(q);
      const products: Product[] = [];
      snap.forEach(d => products.push(d.data() as Product));
      return ok(products);
    } catch (e) {
      return ok([]);
    }
  },

  async listFeatured(_storeId?: string): Promise<ApiResult<Product[]>> {
    try {
      const q = query(collection(db, "petpooja_products"), where("tags", "array-contains", "featured"), limit(8));
      const snap = await getDocs(q);
      const products: Product[] = [];
      snap.forEach(d => products.push(d.data() as Product));
      return ok(products);
    } catch (e) {
      return ok([]);
    }
  },

  async search(
    _storeId: string | undefined,
    searchQuery: string,
    page = 1,
    pageSize = 20,
  ): Promise<ApiResult<ProductPage>> {
    try {
      const term = searchQuery.trim().toLowerCase();
      if (!term) return ok({ items: [], page, pageSize, total: 0 });

      // Client-side filtering because Firestore doesn't support full-text search out of the box
      const snap = await getDocs(collection(db, "petpooja_products"));
      const hits: Product[] = [];
      snap.forEach(doc => {
        const p = doc.data() as Product;
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
    _storeId: string | undefined,
    searchQuery: string,
  ): Promise<ApiResult<SearchSuggestion[]>> {
    const page = await this.search(_storeId, searchQuery, 1, 6);
    if (!page.success) return ok([]);
    return ok(
      page.data.items.map(p => ({
        id: `sug_${p.id}`,
        label: p.name,
        kind: "product",
        targetId: p.id,
      }))
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
};

