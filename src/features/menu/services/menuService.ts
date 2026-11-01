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

/** One real-time, store-scoped menu snapshot plus explicit removals. */
export interface MenuStoreSnapshot {
  products: Product[];
  /** Ids Firestore reported as removed/changed out of the query — never inferred. */
  removedIds: string[];
  /**
   * True only for the whole-scoped query below (no page window, no limit).
   * Page-shaped/partial payloads must leave this false so consumers keep
   * loaded items and their remaining pagination instead of reconciling to a
   * subset.
   */
  complete: boolean;
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
  const veg =
    data.isVeg !== undefined
      ? Boolean(data.isVeg)
      : data.veg !== undefined
        ? Boolean(data.veg)
        : data.dietaryTag === "veg" || data.item_attributeid === "1";

  const customizations = mapToCustomizationGroups(data.customizations || []);

  const rawImageUrl =
    data.imageUrl || data.image || data.image_url || data.itemimage_url || undefined;
  const productName = data.name || data.itemname || "Product";
  const imageUrl = resolveItemImage(productName, rawImageUrl);

  const badges = Array.isArray(data.badges) ? [...data.badges] : [];
  if (
    data.isBestSeller === true ||
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
      // Consumer truth signal, so it fails CLOSED. A doc with no availability
      // field must never render as sellable: nothing downstream re-checks
      // (the payments pricing engine never reads inStock, and the cart's only
      // gate is this boolean), so "we do not know" would become "order it".
      // Strict `=== true` also closes the truthiness trap where a string
      // "false" from a bad writer used to become available.
      data.inStock !== undefined
        ? data.inStock === true
        : data.isAvailable !== undefined
          ? data.isAvailable === true
          : false,
    customizable: customizations.length > 0 || Boolean(data.customizable),
    prepTimeMinutes: toPrepMinutes(data.prepTimeMinutes),
    badges,
    tags: data.tags || [],
    unavailableReason:
      data.unavailableReason ??
      (data.inStock === undefined && data.isAvailable === undefined
        ? "Availability unknown"
        : undefined),
  };
}

/** Map a raw product doc into the detail shape the customizer needs. */
function toProductDetails(data: any, docId: string): ProductDetails {
  const baseProduct = mapProductDoc(data, docId);
  return {
    ...baseProduct,
    customizations: mapToCustomizationGroups(data.customizations || []),
    ingredients: data.ingredients || [],
    nutrition: data.nutrition || [],
    allowSpecialInstructions: data.allowSpecialInstructions ?? true,
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
    const resolved = typeof restId === "string" && restId.length > 0 ? restId : storeId;
    // Outlet links change in the console, not mid-session — cache hard.
    restIdCache.set(storeId, resolved);
    return resolved;
  } catch {
    // store lookup failure — fall through to raw store id (uncached: retry next call)
  }
  return storeId;
}

/**
 * Verified delivery-store → Petpooja restID mapping, used wherever a *wrong*
 * answer would be worse than no answer (single-product reads for the cart).
 *
 * Unlike `resolveRestId` this never falls back to the raw store id: an unlinked
 * store, a missing store doc or a failed read all return `null`, and callers
 * fail closed instead of reading another outlet's inventory.
 */
const verifiedRestIdCache = new Map<string, string>();
async function resolveVerifiedRestId(storeId: string | undefined): Promise<string | null> {
  if (!storeId) return null;
  const cached = verifiedRestIdCache.get(storeId);
  if (cached) return cached;
  try {
    const snap = await getDoc(doc(db, "stores", storeId));
    const raw = snap.exists() ? (snap.data() as any)?.petpoojaRestId : undefined;
    if (typeof raw === "string" && raw.trim().length > 0) {
      const restId = raw.trim();
      verifiedRestIdCache.set(storeId, restId);
      return restId;
    }
  } catch (e) {
    console.warn("menuService.resolveVerifiedRestId failed:", e);
  }
  return null;
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

/**
 * Unscoped read — the legacy exact-SKU / shared-link path (search, favourites,
 * the product route before a store is selected). Unchanged semantics: direct
 * doc first, then the Petpooja item-id join.
 */
async function loadProductUnscoped(id: string): Promise<ApiResult<ProductDetails | null>> {
  const direct = await getDoc(doc(db, "products", id));
  if (direct.exists()) return ok(toProductDetails(direct.data(), direct.id));

  const alt = await getDocs(
    query(collection(db, "products"), where("petpoojaItemId", "==", id), limit(1)),
  );
  if (alt.empty) return ok(null);
  return ok(toProductDetails(alt.docs[0].data(), alt.docs[0].id));
}

/**
 * Store-bound read for the cart / reorder path.
 *
 * `storeId` is a promise about WHICH outlet's inventory may be returned:
 * - the store must resolve to a verified restID, or the read fails closed;
 * - a direct doc hit must be owned by that restID, else the answer is "not in
 *   this store" (ok(null)) rather than another outlet's copy;
 * - the legacy `petpoojaItemId` join is bounded to the same restID and must be
 *   unambiguous. A bare `limit(1)` used to hand back an arbitrary outlet's doc.
 */
async function loadProductScoped(
  id: string,
  storeId: string,
): Promise<ApiResult<ProductDetails | null>> {
  const restId = await resolveVerifiedRestId(storeId);
  if (!restId) {
    return fail(
      "PRODUCT_SCOPE_UNRESOLVED",
      "This store's menu isn't linked yet, so item details can't be verified.",
    );
  }

  const direct = await getDoc(doc(db, "products", id));
  if (direct.exists()) {
    const data = direct.data();
    const owner = typeof data.restId === "string" ? data.restId : undefined;
    // Ownership is a fact we either have or do not: an unowned/unverifiable doc
    // is not this store's product.
    return owner === restId ? ok(toProductDetails(data, direct.id)) : ok(null);
  }

  const matches = await getDocs(
    query(
      collection(db, "products"),
      where("petpoojaItemId", "==", id),
      where("restId", "==", restId),
      limit(2),
    ),
  );
  if (matches.empty) return ok(null);
  if (matches.docs.length > 1) {
    return fail(
      "PRODUCT_AMBIGUOUS",
      "More than one item matches this reference. Please pick it from the menu.",
    );
  }
  return ok(toProductDetails(matches.docs[0].data(), matches.docs[0].id));
}

export const menuService = {
  /** One full, verified outlet snapshot for Home's categories and food rails. */
  async listHomeCatalog(
    storeId: string,
  ): Promise<ApiResult<{ products: Product[]; categories: MenuCategory[] }>> {
    try {
      const restId = await resolveVerifiedRestId(storeId);
      if (!restId) {
        return fail("MENU_SCOPE_UNRESOLVED", "This store's menu isn't linked yet.");
      }
      const products = await fetchStoreProductsCached(restId);
      return ok({ products, categories: deriveCategories(products) });
    } catch {
      return fail("MENU_FETCH_FAILED", "Could not load this store's menu.");
    }
  },

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

  async getProduct(id: string, storeId?: string): Promise<ApiResult<ProductDetails | null>> {
    try {
      return storeId !== undefined
        ? await loadProductScoped(id, storeId)
        : await loadProductUnscoped(id);
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
      return ok(
        all
          .filter((p) => p.id !== productId && p.categoryId === current.data!.categoryId)
          .slice(0, 6),
      );
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
        const signals = [...(p.badges ?? []).map((b) => b.label), ...(p.tags ?? [])]
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
        // No restId means NO scope. The old fallback streamed the first 100
        // products of every outlet as if they were this store's menu.
        if (!restId) {
          callback(fail("MENU_SCOPE_UNRESOLVED", "No menu is linked to this store yet."));
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
          },
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
        // Same scope rule as the category listener: no restId, no stream.
        if (!restId) {
          callback(fail("MENU_SCOPE_UNRESOLVED", "No menu is linked to this store yet."));
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
              ok({ items: paginate(all, page, pageSize), page, pageSize, total: all.length }),
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
   * Real-time, store-scoped menu snapshot for the continuous menu page.
   *
   * Unlike `subscribeProducts` (page-shaped and optionally category-filtered)
   * this delivers the whole scoped query plus the ids Firestore explicitly
   * reported as removed. The menu store needs both: one to update cards that
   * were loaded long ago, the other to only ever delete on real evidence.
   */
  subscribeStoreProducts(
    storeId: string | undefined,
    callback: (result: ApiResult<MenuStoreSnapshot>) => void,
  ): () => void {
    let innerUnsub: Unsubscribe | null = null;
    let cancelled = false;
    void (async () => {
      try {
        const restId = await resolveRestId(storeId);
        if (cancelled) return;
        if (!restId) {
          callback(fail("MENU_SCOPE_UNRESOLVED", "No menu is linked to this store yet."));
          return;
        }
        innerUnsub = onSnapshot(
          query(collection(db, "products"), where("restId", "==", restId)),
          (snap) => {
            const products: Product[] = [];
            snap.forEach((d) => products.push(mapProductDoc(d.data(), d.id)));
            const removedIds = snap
              .docChanges()
              .filter((change) => change.type === "removed")
              .map((change) => change.doc.id);
            // The query is `where(restId == …)` with no limit and no page
            // window, so membership in this payload is the store's whole
            // catalog. That is the ONE place allowed to claim completeness.
            callback(ok({ products, removedIds, complete: true }));
          },
          (err) => {
            console.warn("menuService.subscribeStoreProducts snapshot error:", err);
            callback(fail("MENU_SYNC_FAILED", "Failed to sync the menu in real-time."));
          },
        );
      } catch (err) {
        console.warn("menuService.subscribeStoreProducts setup error:", err);
        callback(fail("MENU_SYNC_FAILED", "Failed to sync the menu in real-time."));
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
        callback(ok(toProductDetails(data, snap.id)));
      },
      (err) => {
        console.warn("menuService.subscribeProduct snapshot error:", err);
        callback(fail("PRODUCT_SYNC_FAILED", "Could not sync product details."));
      },
    );

    return unsub;
  },
};
