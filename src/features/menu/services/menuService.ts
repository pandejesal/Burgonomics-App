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
import { resolveItemImage } from "./menuImageMap";
import { lookupMenuDescription } from "./menuDescriptions";

export type MenuCategory = MenuCategoryModel & { itemCount: number };
export type MenuItem = Product;

/**
 * Live menu payload.
 *
 * `complete` is true only when `items` is the store's ENTIRE in-scope catalog.
 * Consumers may prune ids absent from a complete snapshot (a real POS
 * deletion); an incomplete snapshot is merge-only. Keeping this flag explicit
 * is what stops a partial page from deleting products the listener never saw.
 */
export interface LiveProductPage extends ProductPage {
  complete: boolean;
}

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

/**
 * Search scope tabs. The `products` payload carries no `kind` field, so each
 * tab is answered from data the docs really have:
 * - `product` / `all` — plain text match (`all` additionally keeps combo
 *   bundles in the result set);
 * - `combo` — items in the POS combo category (`Combos` / `cat_combos`);
 * - `offer` — items carrying a real discount signal;
 * - `category` — items whose category matches the query.
 */
export type MenuSearchKind = "all" | "product" | "combo" | "category" | "offer";

export interface MenuSearchOptions {
  page?: number;
  pageSize?: number;
  kind?: MenuSearchKind;
}

function categoryHaystack(p: Product): string {
  return `${p.categoryName ?? ""} ${p.categoryId ?? ""}`;
}

function isComboItem(p: Product): boolean {
  return /combo/i.test(categoryHaystack(p));
}

function isOfferItem(p: Product): boolean {
  if (typeof p.discountPercentage === "number" && p.discountPercentage > 0) return true;
  if (typeof p.compareAtPrice === "number" && p.compareAtPrice > p.price) return true;
  const signal = [...(p.tags ?? []), ...(p.badges ?? []).map((b) => b.label)].join(" ");
  return /(offer|deal|bogo|discount)/i.test(signal);
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

/**
 * P1-12: prep time is a fact from the POS doc or nothing at all. A doc that
 * omits the field (or carries a non-positive/garbage value) yields `undefined`
 * so the card/meta renderer can hide the badge instead of an invented "15m".
 */
function toPrepMinutes(value: unknown): number | undefined {
  const n = typeof value === "string" ? Number(value.trim()) : value;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : undefined;
}

export function mapProductDoc(data: any, docId: string): Product {
  let veg: boolean | undefined = undefined;
  if (typeof data.isVeg === "boolean") veg = data.isVeg;
  else if (typeof data.veg === "boolean") veg = data.veg;
  else if (typeof data.dietaryTag === "string") {
    if (/non[\s-]*veg/i.test(data.dietaryTag)) veg = false;
    else if (/veg/i.test(data.dietaryTag)) veg = true;
  } else if (Array.isArray(data.item_attributeid)) {
    const attrs = data.item_attributeid.map((a: any) => String(a).toLowerCase());
    if (attrs.some((a: string) => a.includes("nonveg") || a.includes("non-veg"))) veg = false;
    else if (attrs.some((a: string) => a.includes("veg"))) veg = true;
  } else if (data.item_attributeid === "1" || data.item_attributeid === 1) {
    veg = true;
  }

  const customizations = mapToCustomizationGroups(data.customizations || []);

  const rawImageUrl =
    data.imageUrl || data.image || data.image_url || data.itemimage_url || undefined;
  const productName = data.name || data.itemname || "Product";
  const imageUrl = resolveItemImage(productName, rawImageUrl);

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
    description:
      data.description || data.itemdescription || lookupMenuDescription(productName) || "",
    price: typeof data.price === "number" ? data.price : parseFloat(data.price) || 0,
    compareAtPrice: data.compareAtPrice,
    discountPercentage: data.discountPercentage,
    veg,
    imageUrl,
    imageUrls: data.imageUrls || (imageUrl ? [imageUrl] : []),
    fallbackImageUrl: data.fallbackImageUrl,
    inStock:
      // Availability flag semantics are shared with the server pricing gate:
      // an EXPLICIT false is an 86; a missing field is a legacy/combo/import
      // doc and is sellable. Treating "unknown" as false made every combo
      // unbuyable, because the combo builder never writes inStock. Explicit
      // string "false" still fails (strict boolean compare).
      data.inStock !== undefined
        ? data.inStock === true
        : data.isAvailable !== undefined
          ? data.isAvailable === true
          : true,
    customizable: customizations.length > 0 || Boolean(data.customizable),
    prepTimeMinutes: toPrepMinutes(data.prepTimeMinutes),
    badges,
    tags: data.tags || [],
    unavailableReason:
      // Only an explicit 86 carries a reason; a missing flag is sellable.
      data.unavailableReason ??
      (data.inStock === false || data.isAvailable === false
        ? "Currently unavailable"
        : undefined),
  };
}

/** Delivery store id → Petpooja restID (equal once outlets are linked). */
const restIdCache = new Map<string, string | undefined>();
async function resolveRestId(storeId: string | undefined): Promise<string | undefined> {
  if (!storeId) return undefined;
  if (restIdCache.has(storeId)) return restIdCache.get(storeId);
  try {
    const snap = await getDoc(doc(db, "stores", storeId));
    const restId = (snap.data() as any)?.petpoojaRestId;
    const resolved =
      typeof restId === "string" && restId.length > 0 ? restId : storeId;
    // Outlet links change in the console, not mid-session — cache hard.
    restIdCache.set(storeId, resolved);
    return resolved;
  } catch {
    // store lookup failure — fall through to raw store id (uncached: retry next call)
  }
  return storeId;
}

async function fetchStoreProducts(restId: string | undefined): Promise<Product[]> {
  // No restId (unlinked store, missing store doc) means NO scope — returning
  // the first 100 products of every outlet would show the wrong menu as if
  // it were this store's. Empty is honest; the UI shows its empty state.
  if (!restId) return [];
  const snap = await getDocs(query(collection(db, "products"), where("restId", "==", restId)));
  const all: Product[] = [];
  snap.forEach((d) => {
    all.push(mapProductDoc(d.data(), d.id));
  });
  return all;
}

/**
 * Session cache over the store's full product list. listCategories,
 * listProducts, search, popular/featured, and related all scanned the entire
 * `products` collection independently — one menu open cost 2 full scans plus
 * a repeat per search keystroke/session. Entries live 30s (POS syncs and the
 * live listener cover freshness; 86-ing never waits on this cache).
 */
const productsCache = new Map<string, { at: number; items: Product[] }>();
const PRODUCTS_CACHE_TTL_MS = 30_000;

async function fetchStoreProductsCached(restId: string | undefined): Promise<Product[]> {
  const key = restId ?? "__unscoped__";
  const hit = productsCache.get(key);
  if (hit && Date.now() - hit.at < PRODUCTS_CACHE_TTL_MS) return hit.items;
  // Raw fetch here — calling the cached wrapper would recurse forever.
  const items = await fetchStoreProducts(restId);
  productsCache.set(key, { at: Date.now(), items });
  return items;
}

/** Drop cached product lists (e.g. after a POS menu sync lands). */
export function invalidateMenuCache(restId?: string): void {
  if (restId) {
    productsCache.delete(restId);
    return;
  }
  productsCache.clear();
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
        name: p.categoryName || (id === "uncategorized" ? "Other" : id),
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
      const all = await fetchStoreProductsCached(restId);
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
    pageSize = 100,
  ): Promise<ApiResult<ProductPage>> {
    try {
      const restId = await resolveRestId(storeId);
      let all = await fetchStoreProductsCached(restId);
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
      const all = await fetchStoreProductsCached(restId);
      return ok(all.filter((p) => p.id !== productId && p.categoryId === current.data!.categoryId).slice(0, 6));
    } catch (e: any) {
      return ok([]);
    }
  },

  async listPopular(storeId?: string): Promise<ApiResult<Product[]>> {
    try {
      // Server products carry no popularity tags yet — serve in-stock first.
      const restId = await resolveRestId(storeId);
      const all = await fetchStoreProductsCached(restId);
      const inStock = all.filter((p) => p.inStock !== false);
      return ok((inStock.length > 0 ? inStock : all).slice(0, 8));
    } catch (e) {
      return ok([]);
    }
  },

  async listFeatured(storeId?: string): Promise<ApiResult<Product[]>> {
    try {
      const restId = await resolveRestId(storeId);
      const all = await fetchStoreProductsCached(restId);
      const inStock = all.filter((p) => p.inStock !== false);
      return ok((inStock.length > 0 ? inStock : all).slice(0, 8));
    } catch (e) {
      return ok([]);
    }
  },

  async search(
    storeId: string | undefined,
    searchQuery: string,
    opts: MenuSearchOptions = {},
  ): Promise<ApiResult<ProductPage>> {
    const page = opts.page ?? 1;
    const pageSize = opts.pageSize ?? 20;
    const kind: MenuSearchKind = opts.kind ?? "all";
    try {
      const term = searchQuery.trim().toLowerCase();
      if (!term) return ok({ items: [], page, pageSize, total: 0 });

      const restId = await resolveRestId(storeId);
      const all = await fetchStoreProductsCached(restId);

      // `kind` is a real scope over the one payload we have: every doc carries
      // its category, so combos are the POS "Combos" category and offers are
      // the items carrying an actual discount. `all` keeps the original
      // name/description/tag matching untouched.
      let scoped = all;
      if (kind === "product") scoped = all.filter((p) => !isComboItem(p));
      else if (kind === "combo") scoped = all.filter(isComboItem);
      else if (kind === "offer") scoped = all.filter(isOfferItem);

      const hits =
        kind === "category"
          ? all.filter((p) => fuzzyMatch(categoryHaystack(p), term))
          : scoped.filter((p) => {
              const haystack = [
                p.name,
                p.description ?? "",
                // Scoped kinds also match their category name, so a "combo"
                // query reaches bundles whose names never say combo.
                ...(kind === "combo" || kind === "offer" ? [categoryHaystack(p)] : []),
                ...(p.tags ?? []),
              ].join(" ");
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
    const page = await this.search(storeId, searchQuery, { page: 1, pageSize: 6 });
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

  /**
   * "Trending" seeds the search screen's chips — so they must be real product
   * names from the store's `products` collection (a fabricated chip that
   * matches nothing is a dead tap). Ranked bestseller-first, in-stock only;
   * empty when the menu can't be read, so the section simply hides.
   */
  async listTrending(storeId?: string): Promise<ApiResult<SearchSuggestion[]>> {
    try {
      const restId = await resolveRestId(storeId);
      const products = await fetchStoreProductsCached(restId);
      const candidates = products.filter((p) => p.inStock !== false);
      if (candidates.length === 0) return ok([]);

      const rank = (p: Product): number => {
        const signals = [
          ...(p.badges ?? []).map((b) => b.label),
          ...(p.tags ?? []),
        ]
          .join(" ")
          .toLowerCase();
        if (signals.includes("bestseller") || signals.includes("best seller")) return 0;
        if (signals.includes("chef") || signals.includes("special")) return 1;
        if (signals.includes("new")) return 2;
        return 3;
      };

      const ranked = candidates
        .map((product, index) => ({ product, index }))
        .sort((a, b) => rank(a.product) - rank(b.product) || a.index - b.index)
        .slice(0, 6);

      return ok(
        ranked.map(({ product }) => ({
          id: `tr_${product.id}`,
          label: product.name,
          kind: "product" as const,
          targetId: product.id,
        })),
      );
    } catch {
      return ok([]);
    }
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
   *
   * No store scope means NO menu: it never falls back to an unscoped
   * collection read, because `limit(100)` over every outlet would show another
   * store's menu as if it were this one. The consumer gets the same honest
   * empty result `fetchStoreProducts` returns and no listener is attached.
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
        if (!restId) {
          callback(ok([]));
          return;
        }
        const q = query(collection(db, "products"), where("restId", "==", restId));
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
   *
   * The listener holds the store's whole scoped query, so it emits the whole
   * catalog — not page 1 of a page size. The old `pageSize = 40` slice made
   * menuStore treat items 41..N as deleted and prune them for the session.
   * Listener payloads are always `complete: true`; paged reads stay on
   * `listProducts`, whose pagination is unchanged.
   *
   * No store scope means NO menu (see `subscribeCategories`): emit an empty
   * complete snapshot and attach no listener, rather than reading the first
   * 100 products of every outlet.
   */
  subscribeProducts(
    storeId: string | undefined,
    categoryId: string | undefined,
    callback: (result: ApiResult<LiveProductPage>) => void,
  ): () => void {
    let innerUnsub: Unsubscribe | null = null;
    let cancelled = false;
    void (async () => {
      try {
        const restId = await resolveRestId(storeId);
        if (cancelled) return;
        if (!restId) {
          callback(ok({ items: [], page: 1, pageSize: 0, total: 0, complete: true }));
          return;
        }
        const q = query(collection(db, "products"), where("restId", "==", restId));
        innerUnsub = onSnapshot(
          q,
          (snap) => {
            let all: Product[] = [];
            snap.forEach((d) => {
              all.push(mapProductDoc(d.data(), d.id));
            });
            if (categoryId) all = all.filter((p) => p.categoryId === categoryId);
            callback(
              ok({
                items: all,
                page: 1,
                pageSize: all.length,
                total: all.length,
                complete: true,
              }),
            );
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

