import { create } from "zustand";
import { homeRepository } from "@/features/home/repositories/HomeRepository";
import type { HomeBundle } from "@/features/home/models";

export type HomeStatus = "idle" | "loading" | "refreshing" | "ready" | "empty" | "error";

interface HomeState {
  status: HomeStatus;
  bundle: HomeBundle | null;
  error: string | null;
  lastLoadedStoreId: string | null;
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
  lastFetchedAt: null,

  async load(storeId, userId, opts) {
    const refresh = opts?.refresh === true;
    const current = get();
    if (
      !refresh &&
      current.status === "ready" &&
      current.lastLoadedStoreId === storeId &&
      current.bundle
    ) {
      return;
    }
    set({
      status: refresh ? "refreshing" : "loading",
      error: null,
    });
    const res = await homeRepository.getHome(storeId, userId);
    if (!res.success) {
      set({ status: "error", error: res.error.message });
      return;
    }
    set({
      status: isBundleEmpty(res.data) ? "empty" : "ready",
      bundle: res.data,
      lastLoadedStoreId: storeId,
      lastFetchedAt: Date.now(),
    });
  },

  reset() {
    set({
      status: "idle",
      bundle: null,
      error: null,
      lastLoadedStoreId: null,
      lastFetchedAt: null,
    });
  },
}));

export { EMPTY_BUNDLE };
