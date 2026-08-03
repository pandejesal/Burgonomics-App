import { create } from "zustand";
import { menuRepository } from "@/features/menu/repositories/MenuRepository";
import type { MenuCategoryModel, Product } from "@/features/menu/models";

/**
 * Menu feature state — categories + paginated products per category,
 * cached in-memory. `recentlyViewed` is a placeholder for the offline
 * cache introduced in the offline sync prompt.
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
  reset: () => void;
}

const PAGE_SIZE = 20;

export const useMenuStore = create<MenuState>()((set, get) => ({
  status: "idle",
  categories: [],
  buckets: {},
  viewMode: "list",
  recentlyViewed: [],

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

    const page = res.data;
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
