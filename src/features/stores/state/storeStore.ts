import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { storeRepository } from "@/features/stores/repositories/StoreRepository";
import type { Fulfillment, Store } from "@/features/stores/models/Store";
import type { Coords } from "@/features/stores/hooks/useLocationPermission";

export type { Store, Fulfillment } from "@/features/stores/models/Store";
/**
 * Historical alias — pre-refactor code imported `StoreLocation` from
 * this module. Keep the export so no downstream imports break.
 */
export type StoreLocation = Store;

export type StoreLoadStatus =
  "idle" | "detecting_location" | "loading" | "ready" | "permission_denied" | "error";

export type FulfillmentStatus = "none" | "selecting" | "selected" | "changed" | "unsupported";

const MAX_RECENTS = 5;
const MAX_SEARCH_HISTORY = 8;

interface StoreState {
  // Selection (persisted)
  activeStore: Store | null;
  recentStores: Store[];
  searchHistory: string[];
  fulfillment: Fulfillment | null;

  // Runtime
  isHydrated: boolean;
  fulfillmentStatus: FulfillmentStatus;
  status: StoreLoadStatus;
  stores: Store[];
  nearby: Store[];
  coords: Coords | null;
  error: string | null;

  // Actions
  setActiveStore: (s: Store | null) => void;
  clearActiveStore: () => void;
  setFulfillment: (f: Fulfillment | null) => void;
  markFulfillmentSelecting: () => void;
  loadStores: (coords?: Coords) => Promise<void>;
  loadNearby: (coords: Coords) => Promise<void>;
  refresh: () => Promise<void>;
  searchStores: (query: string) => Promise<Store[]>;
  addSearchTerm: (term: string) => void;
  clearSearchHistory: () => void;
  markPermissionDenied: () => void;
  setError: (message: string | null) => void;
}

/** Check whether a store supports a given fulfillment method. */
export function storeSupportsFulfillment(
  store: Store | null | undefined,
  f: Fulfillment | null | undefined,
): boolean {
  if (!store || !f) return false;
  if (f === "delivery") return !!store.supports.delivery;
  if (f === "takeaway") return !!store.supports.takeaway;
  if (f === "dinein") return !!store.supports.dineIn;
  return false;
}

export const useStoreSelection = create<StoreState>()(
  persist(
    (set, get) => ({
      activeStore: null,
      recentStores: [],
      searchHistory: [],
      fulfillment: null,

      isHydrated: false,
      fulfillmentStatus: "none",
      status: "idle",
      stores: [],
      nearby: [],
      coords: null,
      error: null,

      setActiveStore: (s) => {
        if (!s) {
          set({ activeStore: null, fulfillmentStatus: "none", isHydrated: true });
          return;
        }
        const recents = [s, ...get().recentStores.filter((r) => r.id !== s.id)].slice(
          0,
          MAX_RECENTS,
        );
        // Re-evaluate current fulfillment against the new store's support.
        const currentF = get().fulfillment;
        const stillSupported = storeSupportsFulfillment(s, currentF);
        set({
          activeStore: s,
          recentStores: recents,
          fulfillment: stillSupported ? currentF : null,
          fulfillmentStatus: stillSupported ? (currentF ? "selected" : "none") : "unsupported",
          isHydrated: true,
        });
      },

      clearActiveStore: () =>
        set({
          activeStore: null,
          fulfillment: null,
          fulfillmentStatus: "none",
        }),

      setFulfillment: (f) => {
        if (!f) {
          set({ fulfillment: null, fulfillmentStatus: "none" });
          return;
        }
        const prev = get().fulfillment;
        set({
          fulfillment: f,
          fulfillmentStatus: prev && prev !== f ? "changed" : "selected",
        });
      },

      markFulfillmentSelecting: () => set({ fulfillmentStatus: "selecting" }),

      async loadStores(coords) {
        set({ status: "loading", error: null, coords: coords ?? get().coords });
        const res = await storeRepository.list(coords ?? get().coords ?? undefined);
        if (!res.success) {
          set({ status: "error", error: res.error.message });
          return;
        }
        set({ status: "ready", stores: res.data });
      },

      async loadNearby(coords) {
        set({ status: "detecting_location", coords, error: null });
        const res = await storeRepository.nearby(coords.lat, coords.lng);
        if (!res.success) {
          set({ status: "error", error: res.error.message });
          return;
        }
        // Also refresh full list so the screen has both.
        const full = await storeRepository.list(coords);
        set({
          status: "ready",
          nearby: res.data,
          stores: full.success ? full.data : get().stores,
        });
      },

      async refresh() {
        await get().loadStores(get().coords ?? undefined);
      },

      async searchStores(query) {
        const res = await storeRepository.search(query, get().coords ?? undefined);
        if (!res.success) {
          set({ error: res.error.message });
          return [];
        }
        return res.data;
      },

      addSearchTerm: (term) => {
        const t = term.trim();
        if (!t) return;
        const next = [t, ...get().searchHistory.filter((x) => x !== t)].slice(
          0,
          MAX_SEARCH_HISTORY,
        );
        set({ searchHistory: next });
      },

      clearSearchHistory: () => set({ searchHistory: [] }),

      markPermissionDenied: () => set({ status: "permission_denied" }),

      setError: (message) => set({ error: message, status: message ? "error" : get().status }),
    }),
    {
      name: "burg.store",
      version: 2,
      storage: createJSONStorage(() => {
        if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
        const memoryStorage = new Map<string, string>();
        return {
          getItem: (key: string) => memoryStorage.get(key) ?? null,
          setItem: (key: string, value: string) => {
            memoryStorage.set(key, value);
          },
          removeItem: (key: string) => {
            memoryStorage.delete(key);
          },
          clear: () => {
            memoryStorage.clear();
          },
          length: memoryStorage.size,
          key: (index: number) => Array.from(memoryStorage.keys())[index] ?? null,
        } as Storage;
      }),
      skipHydration: true,
      partialize: (s) => ({
        activeStore: s.activeStore,
        recentStores: s.recentStores,
        searchHistory: s.searchHistory,
        fulfillment: s.fulfillment,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // Re-hydrate fulfillmentStatus from the persisted pair.
        if (state.activeStore && state.fulfillment) {
          state.fulfillmentStatus = storeSupportsFulfillment(state.activeStore, state.fulfillment)
            ? "selected"
            : "unsupported";
        } else {
          state.fulfillmentStatus = "none";
        }
        state.isHydrated = true;
      },
      migrate: (persisted, version) => {
        if (!persisted || typeof persisted !== "object") {
          return { fulfillment: null } as Partial<StoreState>;
        }
        if (version < 2) {
          return { ...(persisted as object), fulfillment: null } as Partial<StoreState>;
        }
        return persisted as Partial<StoreState>;
      },
    },
  ),
);

// Selectors
export const selectHasActiveStore = (s: StoreState) => !!s.activeStore;
export const selectFulfillment = (s: StoreState) => s.fulfillment;
export const selectHasFulfillment = (s: StoreState) => !!s.fulfillment;
export const selectStoreAndFulfillment = (s: StoreState) => ({
  store: s.activeStore,
  fulfillment: s.fulfillment,
});
