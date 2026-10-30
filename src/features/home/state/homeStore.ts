import { create } from "zustand";
import { homeRepository } from "@/features/home/repositories/HomeRepository";
import type { HomeBundle } from "@/features/home/models";

export type HomeStatus = "idle" | "loading" | "refreshing" | "ready" | "empty" | "error";

interface HomeState {
  status: HomeStatus;
  bundle: HomeBundle | null;
  error: string | null;
  lastLoadedStoreId: string | null;
  lastLoadedUserId: string | null;
  lastFetchedAt: number | null;

  load: (storeId: string, userId?: string, opts?: { refresh?: boolean }) => Promise<void>;
  reset: () => void;
}

const EMPTY_BUNDLE: HomeBundle = {
  banners: [],
  categories: [],
  featuredOffers: [],
  bestSellers: [],
  popularCombos: [],
  recommendations: [],
  recentlyViewed: [],
  quickReorder: [],
};

/** Latest request wins; reset also advances this to strand in-flight results. */
let requestSequence = 0;

function isBundleEmpty(b: HomeBundle) {
  return (
    b.banners.length === 0 &&
    b.categories.length === 0 &&
    b.featuredOffers.length === 0 &&
    b.bestSellers.length === 0 &&
    b.popularCombos.length === 0 &&
    b.recommendations.length === 0
  );
}

export const useHomeStore = create<HomeState>((set, get) => ({
  status: "idle",
  bundle: null,
  error: null,
  lastLoadedStoreId: null,
  lastLoadedUserId: null,
  lastFetchedAt: null,

  async load(storeId, userId, opts) {
    const refresh = opts?.refresh === true;
    const scopedUserId = userId ?? null;
    const current = get();
    const sameScope =
      current.lastLoadedStoreId === storeId && current.lastLoadedUserId === scopedUserId;
    if (!refresh && current.status === "ready" && sameScope && current.bundle) {
      return;
    }

    const retainsCachedBundle = refresh && sameScope && current.bundle !== null;
    const requestId = ++requestSequence;
    // Cross-store/user loads must not expose the previous scope before the await.
    set({
      status: retainsCachedBundle ? "refreshing" : "loading",
      bundle: retainsCachedBundle ? current.bundle : null,
      error: null,
      lastLoadedStoreId: retainsCachedBundle ? current.lastLoadedStoreId : null,
      lastLoadedUserId: retainsCachedBundle ? current.lastLoadedUserId : null,
      lastFetchedAt: retainsCachedBundle ? current.lastFetchedAt : null,
    });
    const res = await homeRepository.getHome(storeId, userId);
    if (requestId !== requestSequence) return;
    if (!res.success) {
      set({
        status: "error",
        error: res.error.message,
        bundle: null,
        lastLoadedStoreId: null,
        lastLoadedUserId: null,
        lastFetchedAt: null,
      });
      return;
    }
    set({
      status: isBundleEmpty(res.data) ? "empty" : "ready",
      bundle: res.data,
      lastLoadedStoreId: storeId,
      lastLoadedUserId: scopedUserId,
      lastFetchedAt: Date.now(),
    });
  },

  reset() {
    requestSequence += 1;
    set({
      status: "idle",
      bundle: null,
      error: null,
      lastLoadedStoreId: null,
      lastLoadedUserId: null,
      lastFetchedAt: null,
    });
  },
}));

export { EMPTY_BUNDLE };
