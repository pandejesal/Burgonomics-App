import { create } from "zustand";
import { menuRepository } from "@/features/menu/repositories/MenuRepository";
import { invalidateMenuCache } from "@/features/menu/services/menuService";
import type { MenuCategoryModel, Product } from "@/features/menu/models";
import { SAMPLE_PRODUCTS } from "@/features/menu/data/petpoojaSampleData";

const SAMPLE_BY_ID = new Map(SAMPLE_PRODUCTS.map((p) => [p.id, p]));
const SAMPLE_BY_NAME = new Map(SAMPLE_PRODUCTS.map((p) => [p.name.toLowerCase(), p]));

function enrichProduct(p: Product): Product {
  if (p.imageUrl && p.imageUrl.trim().length > 0) return p;
  const byId = SAMPLE_BY_ID.get(p.id);
  if (byId?.imageUrl) {
    return { ...p, imageUrl: byId.imageUrl, imageUrls: byId.imageUrls ?? (byId.imageUrl ? [byId.imageUrl] : []), fallbackImageUrl: byId.fallbackImageUrl ?? byId.imageUrl };
  }
  const byName = SAMPLE_BY_NAME.get(p.name.toLowerCase());
  if (byName?.imageUrl) {
    return { ...p, imageUrl: byName.imageUrl, imageUrls: byName.imageUrls ?? (byName.imageUrl ? [byName.imageUrl] : []), fallbackImageUrl: byName.fallbackImageUrl ?? byName.imageUrl };
  }
  return p;
}

/**
 * Menu feature state — categories + paginated products per category,
 * cached in-memory. `recentlyViewed` supports local offline caching.
 */
export type MenuStatus = "idle" | "loading" | "refreshing" | "ready" | "empty" | "error";

interface CategoryBucket {
  items: Product[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  loading: boolean;
  error?: string;
}

interface MenuState {
  storeId?: string;
  status: MenuStatus;
  error?: string;
  categories: MenuCategoryModel[];
  activeCategoryId?: string;
  buckets: Record<string, CategoryBucket>;
  viewMode: "list" | "grid";
  recentlyViewed: Product[];

  load: (storeId: string, opts?: { refresh?: boolean }) => Promise<void>;
  loadMore: (categoryId: string) => Promise<void>;
  setActiveCategory: (id: string) => void;
  setViewMode: (mode: "list" | "grid") => void;
  pushRecentlyViewed: (p: Product) => void;
  subscribeToLiveMenu: (storeId: string) => () => void;
  reset: () => void;
}

const PAGE_SIZE = 20;

const VIEW_MODE_KEY = "burgonomics.menu.viewMode";

function initialViewMode(): "list" | "grid" {
  try {
    const saved = localStorage.getItem(VIEW_MODE_KEY);
    if (saved === "list" || saved === "grid") return saved;
  } catch {
    // Ignore storage access errors (private mode, SSR).
  }
  return "grid";
}

export const useMenuStore = create<MenuState>()((set, get) => ({
  status: "idle",
  categories: [],
  buckets: {},
  viewMode: initialViewMode(),
  recentlyViewed: [],

  subscribeToLiveMenu(storeId) {
    const unsubCat = menuRepository.subscribeCategories(storeId, (res) => {
      if (res.success && res.data.length > 0) {
        const cats = [...res.data].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        set((s) => ({
          categories: cats,
          activeCategoryId:
            s.activeCategoryId && cats.some((c) => c.id === s.activeCategoryId)
              ? s.activeCategoryId
              : cats[0].id,
          status: "ready",
        }));
      }
    });

    const unsubProd = menuRepository.subscribeProducts(storeId, undefined, (res) => {
      if (res.success) {
        // Live data wins over the 30s fetch cache — drop it so the next
        // paginated loadMore re-reads instead of serving pre-sync items.
        invalidateMenuCache();
        const allProducts = res.data.items.map(enrichProduct);
        // Merge into existing buckets — the old code REPLACED every bucket
        // (pageSize 100, hasMore false), silently discarding the pagination
        // loadMore had built and resetting scroll position on every POS sync.
        set((s) => {
          const buckets: Record<string, CategoryBucket> = { ...s.buckets };
          const seen = new Set<string>();
          for (const p of allProducts) {
            seen.add(p.id);
            const existing = buckets[p.categoryId];
            if (!existing) {
              buckets[p.categoryId] = {
                items: [p],
                page: 1,
                pageSize: 100,
                total: 1,
                hasMore: false,
                loading: false,
              };
              continue;
            }
            const idx = existing.items.findIndex((i) => i.id === p.id);
            const items =
              idx >= 0
                ? existing.items.map((i, j) => (j === idx ? p : i))
                : [...existing.items, p];
            buckets[p.categoryId] = {
              ...existing,
              items,
              total: Math.max(existing.total, items.length),
            };
          }
          // Drop items deleted from the menu (present locally, absent live).
          for (const [catId, bucket] of Object.entries(buckets)) {
            const kept = bucket.items.filter((i) => seen.has(i.id));
            if (kept.length !== bucket.items.length) {
              buckets[catId] = { ...bucket, items: kept, total: kept.length };
            }
          }
          return { buckets };
        });
      }
    });

    return () => {
      unsubCat();
      unsubProd();
    };
  },

  async load(storeId, opts) {
    const isRefresh = !!opts?.refresh;
    set((s) => ({
      status: isRefresh && s.categories.length ? "refreshing" : "loading",
      storeId,
      error: undefined,
    }));

    const res = await menuRepository.listCategories(storeId);
    if (!res.success) {
      set({ status: "error", error: res.error.message });
      return;
    }
    const cats = [...res.data].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    if (cats.length === 0) {
      set({ status: "empty", categories: [], buckets: {} });
      return;
    }

    const firstId =
      get().activeCategoryId && cats.some((c) => c.id === get().activeCategoryId)
        ? get().activeCategoryId!
        : cats[0].id;

    set({
      categories: cats,
      activeCategoryId: firstId,
      status: "ready",
      buckets: {},
    });

    // Prime the first category so the initial paint has data.
    await get().loadMore(firstId);
  },

  async loadMore(categoryId) {
    const state = get();
    const bucket = state.buckets[categoryId];
    if (bucket?.loading) return;
    if (bucket && !bucket.hasMore) return;
    const nextPage = (bucket?.page ?? 0) + 1;

    set((s) => ({
      buckets: {
        ...s.buckets,
        [categoryId]: {
          items: bucket?.items ?? [],
          page: bucket?.page ?? 0,
          pageSize: PAGE_SIZE,
          total: bucket?.total ?? 0,
          hasMore: bucket?.hasMore ?? true,
          loading: true,
          error: undefined,
        },
      },
    }));

    const res = await menuRepository.listProducts(state.storeId, categoryId, nextPage, PAGE_SIZE);

    if (!res.success) {
      set((s) => ({
        buckets: {
          ...s.buckets,
          [categoryId]: {
            ...(s.buckets[categoryId] ?? {
              items: [],
              page: 0,
              pageSize: PAGE_SIZE,
              total: 0,
              hasMore: true,
            }),
            loading: false,
            error: res.error.message,
          },
        },
      }));
      return;
    }

    const page = { ...res.data, items: res.data.items.map(enrichProduct) };
    const merged = [...(bucket?.items ?? []), ...page.items];
    const hasMore = merged.length < page.total && page.items.length > 0;
    set((s) => ({
      buckets: {
        ...s.buckets,
        [categoryId]: {
          items: merged,
          page: page.page,
          pageSize: page.pageSize,
          total: page.total,
          hasMore,
          loading: false,
        },
      },
    }));
  },

  setActiveCategory(id) {
    set({ activeCategoryId: id });
    const s = get();
    if (!s.buckets[id]) void s.loadMore(id);
  },

  setViewMode(mode) {
    set({ viewMode: mode });
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode);
    } catch {
      // Ignore storage access errors.
    }
  },

  pushRecentlyViewed(p) {
    set((s) => {
      const filtered = s.recentlyViewed.filter((x) => x.id !== p.id);
      return { recentlyViewed: [p, ...filtered].slice(0, 12) };
    });
  },

  reset() {
    set({
      status: "idle",
      error: undefined,
      categories: [],
      activeCategoryId: undefined,
      buckets: {},
    });
  },
}));
