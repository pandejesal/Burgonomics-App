import { create } from "zustand";
import { fail } from "@/core/network/http";
import { menuRepository } from "@/features/menu/repositories/MenuRepository";
import { invalidateMenuCache } from "@/features/menu/services/menuService";
import type { MenuCategoryModel, Product } from "@/features/menu/models";
import {
  emptyBucket,
  mergeCategoryPage,
  mergeLiveSnapshot,
  parseProductPage,
  type MenuCategoryBucket,
} from "./menuSnapshot";

/**
 * Menu feature state for the continuous (all-categories, natural vertical flow)
 * menu page.
 *
 * Read substrate: the service still lists a store's catalog in one scoped read
 * and slices locally — there is no cursor/network pagination behind these
 * pages. What changed here is what the UI holds: 20-item pages requested on
 * demand, at most `MENU_MAX_CONCURRENT_LOADS` in flight, and an epoch that
 * makes every in-flight response owned by the store that asked for it.
 */
export type MenuStatus = "idle" | "loading" | "refreshing" | "ready" | "empty" | "error";

/** Items per section page. Kept small so one section cannot paint a long list. */
export const MENU_PAGE_SIZE = 20;
/** Concurrent page reads. More than this pre-scrolls categories the user cannot see. */
export const MENU_MAX_CONCURRENT_LOADS = 2;
/** Sections whose first page is primed on load (the visible one + its neighbour). */
export const MENU_INITIAL_SECTIONS = 2;

interface MenuState {
  storeId?: string;
  /**
   * Ownership token. Bumped on every store switch/reset; async results carrying
   * an older epoch are discarded, so a slow response for store A can never
   * write inventory under store B.
   */
  epoch: number;
  status: MenuStatus;
  error?: string;
  /** True when live data failed and the visible menu may be out of date. */
  stale?: boolean;
  categories: MenuCategoryModel[];
  activeCategoryId?: string;
  buckets: Record<string, MenuCategoryBucket>;
  viewMode: "list" | "grid";
  recentlyViewed: Product[];

  load: (storeId: string, opts?: { refresh?: boolean }) => Promise<void>;
  /** Load the next page for a section (also loads page 1 when none is loaded). */
  loadMore: (categoryId: string) => Promise<void>;
  setActiveCategory: (id: string) => void;
  setViewMode: (mode: "list" | "grid") => void;
  pushRecentlyViewed: (p: Product) => void;
  subscribeToLiveMenu: (storeId: string) => () => void;
  reset: () => void;
}

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

/** Category order is the store's `order` field; ties keep the source order. */
function sortCategories(categories: ReadonlyArray<MenuCategoryModel>): MenuCategoryModel[] {
  return [...categories].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

interface LoadTicket {
  key: string;
  epoch: number;
  storeId: string;
  categoryId: string;
  page: number;
}

export const useMenuStore = create<MenuState>()((set, get) => {
  const queue: LoadTicket[] = [];
  const queued = new Set<string>();
  const waiting = new Map<string, Array<() => void>>();
  let activeLoads = 0;

  const ticketKey = (epoch: number, categoryId: string) => `${epoch}:${categoryId}`;

  const settle = (key: string) => {
    const resolvers = waiting.get(key);
    waiting.delete(key);
    resolvers?.forEach((resolve) => resolve());
  };

  const waitFor = (key: string): Promise<void> =>
    new Promise<void>((resolve) => {
      const resolvers = waiting.get(key) ?? [];
      resolvers.push(resolve);
      waiting.set(key, resolvers);
    });

  /**
   * Drop everything not yet started. In-flight reads cannot be cancelled, but
   * their epoch no longer matches and their results are discarded on arrival.
   */
  const clearSchedule = () => {
    queue.length = 0;
    for (const key of [...queued]) settle(key);
    queued.clear();
  };

  const fetchPage = async (ticket: LoadTicket): Promise<void> => {
    const setPageError = (message: string) => {
      const state = get();
      if (state.epoch !== ticket.epoch || state.storeId !== ticket.storeId) return;
      set((current) => {
        const bucket = current.buckets[ticket.categoryId] ?? emptyBucket(MENU_PAGE_SIZE);
        return {
          buckets: {
            ...current.buckets,
            [ticket.categoryId]: { ...bucket, loading: false, error: message },
          },
        };
      });
    };

    let result: Awaited<ReturnType<typeof menuRepository.listProducts>>;
    try {
      result = await menuRepository.listProducts(
        ticket.storeId,
        ticket.categoryId,
        ticket.page,
        MENU_PAGE_SIZE,
      );
    } catch {
      result = fail("MENU_FETCH_FAILED", "Couldn't load these items. Please try again.");
    }
    const state = get();
    if (state.epoch !== ticket.epoch || state.storeId !== ticket.storeId) return;

    if (!result.success) {
      setPageError(result.error.message);
      return;
    }

    const page = parseProductPage(result.data);
    if (!page) {
      setPageError("Couldn't read these items. Please try again.");
      return;
    }
    try {
      set((current) => {
        const bucket = current.buckets[ticket.categoryId] ?? emptyBucket(MENU_PAGE_SIZE);
        return {
          buckets: {
            ...current.buckets,
            [ticket.categoryId]: mergeCategoryPage(bucket, page, ticket.page),
          },
        };
      });
    } catch {
      // A malformed page must surface a retryable section error, not leave
      // the bucket loading forever behind an unhandled rejection.
      setPageError("Couldn't read these items. Please try again.");
    }
  };

  const pump = () => {
    while (activeLoads < MENU_MAX_CONCURRENT_LOADS && queue.length > 0) {
      const ticket = queue.shift()!;
      const state = get();
      if (ticket.epoch !== state.epoch || ticket.storeId !== state.storeId) {
        queued.delete(ticket.key);
        settle(ticket.key);
        continue;
      }
      activeLoads += 1;
      set((current) => ({
        buckets: {
          ...current.buckets,
          [ticket.categoryId]: {
            ...(current.buckets[ticket.categoryId] ?? emptyBucket(MENU_PAGE_SIZE)),
            loading: true,
            error: undefined,
          },
        },
      }));
      void fetchPage(ticket).finally(() => {
        activeLoads -= 1;
        queued.delete(ticket.key);
        settle(ticket.key);
        pump();
      });
    }
  };

  const enqueue = (categoryId: string): Promise<void> => {
    const state = get();
    if (!state.storeId) return Promise.resolve();
    const key = ticketKey(state.epoch, categoryId);
    // A second caller (notably a section jump) must await the same in-flight
    // page, rather than measuring its temporary skeleton as completed content.
    if (queued.has(key)) return waitFor(key);
    const bucket = state.buckets[categoryId];
    if (bucket?.loading) return Promise.resolve();
    if (bucket && !bucket.hasMore) return Promise.resolve();

    const promise = waitFor(key);
    queued.add(key);
    queue.push({
      key,
      epoch: state.epoch,
      storeId: state.storeId,
      categoryId,
      page: (bucket?.page ?? 0) + 1,
    });
    pump();
    return promise;
  };

  return {
    status: "idle",
    epoch: 0,
    categories: [],
    buckets: {},
    viewMode: initialViewMode(),
    recentlyViewed: [],

    subscribeToLiveMenu(storeId) {
      const epoch = get().epoch;
      const isCurrent = () => get().epoch === epoch && get().storeId === storeId;

      const unsubscribeCategories = menuRepository.subscribeCategories(storeId, (result) => {
        if (!isCurrent()) return;
        if (!result.success) {
          set({ error: result.error.message, stale: true });
          return;
        }
        // A transient empty sync (POS bulk rewrite) must not blank a usable
        // menu; deletions of the last item are covered by the products
        // listener's explicit removal events instead.
        if (result.data.length === 0) return;
        const categories = sortCategories(result.data);
        set((current) => ({
          categories,
          activeCategoryId:
            current.activeCategoryId &&
            categories.some((category) => category.id === current.activeCategoryId)
              ? current.activeCategoryId
              : categories[0].id,
          status: "ready",
          error: undefined,
        }));
      });

      const unsubscribeProducts = menuRepository.subscribeStoreProducts(storeId, (result) => {
        if (!isCurrent()) return;
        if (!result.success) {
          set({ error: result.error.message, stale: true });
          return;
        }
        // Live data wins over the 30s fetch cache.
        invalidateMenuCache();
        set((current) => ({
          buckets: mergeLiveSnapshot(
            current.buckets,
            result.data.products,
            result.data.removedIds,
            // Completeness is claimed by the whole-scoped listener only; a
            // page-shaped/unknown payload stays non-authoritative here.
            { complete: result.data.complete === true, pageSize: MENU_PAGE_SIZE },
          ),
          error: undefined,
          stale: false,
        }));
      });

      return () => {
        unsubscribeCategories();
        unsubscribeProducts();
      };
    },

    async load(storeId, opts) {
      const previous = get();
      const isRefresh = !!opts?.refresh;

      if (previous.storeId !== storeId) {
        // Cross-store switch: invalidate synchronously, before the first await,
        // so no old-store inventory can be rendered under the new store id.
        clearSchedule();
        set({
          storeId,
          epoch: previous.epoch + 1,
          status: "loading",
          error: undefined,
          stale: false,
          categories: [],
          activeCategoryId: undefined,
          buckets: {},
        });
      } else {
        set({
          status: isRefresh && previous.categories.length > 0 ? "refreshing" : "loading",
          error: undefined,
        });
      }

      const epoch = get().epoch;
      let result: Awaited<ReturnType<typeof menuRepository.listCategories>>;
      try {
        result = await menuRepository.listCategories(storeId);
      } catch {
        result = fail("MENU_FETCH_FAILED", "Couldn't load the menu. Please try again.");
      }
      const state = get();
      if (state.epoch !== epoch || state.storeId !== storeId) return;

      if (!result.success) {
        // Preserve cached categories on failure (stale but usable).
        const had = state.categories.length > 0;
        set(
          had
            ? { status: "ready", error: result.error.message, stale: true }
            : { status: "error", error: result.error.message, stale: false },
        );
        return;
      }

      const categories = sortCategories(result.data);
      if (categories.length === 0) {
        set({ status: "empty", categories: [], buckets: {}, activeCategoryId: undefined });
        return;
      }

      const buckets = Object.fromEntries(
        Object.entries(state.buckets).filter(([categoryId]) =>
          categories.some((category) => category.id === categoryId),
        ),
      );
      const activeCategoryId =
        state.activeCategoryId &&
        categories.some((category) => category.id === state.activeCategoryId)
          ? state.activeCategoryId
          : categories[0].id;

      set({ categories, activeCategoryId, status: "ready", error: undefined, stale: false, buckets });

      // Prime only the first screen's sections (visible + adjacent), never the
      // whole catalog: 2 reads at mount, both through the 2-slot scheduler.
      const primes = categories
        .slice(0, MENU_INITIAL_SECTIONS)
        .filter((category) => !buckets[category.id] || buckets[category.id].error);
      await Promise.all(primes.map((category) => enqueue(category.id)));
    },

    loadMore(categoryId) {
      return enqueue(categoryId);
    },

    setActiveCategory(id) {
      set({ activeCategoryId: id });
      if (!get().buckets[id]) void enqueue(id);
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
      set((current) => {
        const filtered = current.recentlyViewed.filter((item) => item.id !== p.id);
        return { recentlyViewed: [p, ...filtered].slice(0, 12) };
      });
    },

    reset() {
      clearSchedule();
      set((current) => ({
        storeId: undefined,
        epoch: current.epoch + 1,
        status: "idle",
        error: undefined,
        stale: false,
        categories: [],
        activeCategoryId: undefined,
        buckets: {},
      }));
    },
  };
});
