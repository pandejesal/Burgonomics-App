import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { toast } from "sonner";
import { storeRepository } from "@/features/stores/repositories/StoreRepository";
import type { Fulfillment, Store } from "@/features/stores/models/Store";
import { readCachedCoords, type Coords } from "@/features/stores/hooks/useLocationPermission";
import { useAddressStore, selectSelectedAddress } from "@/features/addresses/state/addressStore";
import {
  isStoreInDeliveryArea,
  OUT_OF_AREA_MESSAGE,
} from "@/features/stores/utils/serviceArea";
import { haversineKm } from "@/features/stores/utils/distance";

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

/**
 * User position in precedence order, shared by the delivery-area guard and
 * any consumer that needs "where the customer is" (e.g. the Directions origin):
 * (a) selected delivery address with lat/lng,
 * (b) device coords from `loadNearby`/`loadStores`, then the cached GPS fix,
 * (c) null → no blocking (a missing location must never lock the user out).
 */
export function resolveDeliveryCoords(deviceCoords: Coords | null): Coords | null {
  const address = selectSelectedAddress(useAddressStore.getState());
  if (
    typeof address?.lat === "number" &&
    typeof address?.lng === "number" &&
    Number.isFinite(address.lat) &&
    Number.isFinite(address.lng)
  ) {
    return { lat: address.lat, lng: address.lng };
  }
  return deviceCoords ?? readCachedCoords();
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

/**
 * Directory request generation (module-scoped, never persisted). Only the
 * newest in-flight read may publish; mount, retry and refresh can overlap.
 */
let directoryGeneration = 0;

/** Top-5 by straight-line distance from the rows already in memory. */
function rankNearest(stores: Store[], coords: Coords | null): Store[] {
  if (!coords) {
    return [...stores].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 5);
  }
  return [...stores]
    .map((store) => ({ store, km: haversineKm(coords, { lat: store.lat, lng: store.lng }) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, 5)
    .map(({ store }) => store);
}

export const useStoreSelection = create<StoreState>()(
  persist(
    (set, get) => ({
      // Loop: boot with NO store selected. MOCK_STORES[0] as the default
      // active store let checkout run against a fake outlet in prod when the
      // backend list was empty. Explicit selection only (stores screen).
      activeStore: null,
      recentStores: [],
      searchHistory: [],
      fulfillment: "delivery",

      // isHydrated starts FALSE and flips only in onRehydrateStorage below:
      // the home/menu store-gates treat it as the rehydrate signal, so an
      // optimistic true here bounces fresh boots to /stores before the
      // persisted selection loads.
      isHydrated: false,
      fulfillmentStatus: "none",
      // "idle" = nothing has been requested yet. A "ready" default is what let
      // the store screen render an empty catalogue before the first read.
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
        // Defensive check: prevent selecting out-of-area stores for delivery mode.
        // Takeaway/dine-in are never blocked — only DELIVERY enforces the radius,
        // and only when we actually know where the user is.
        const state = get();
        const currentF = state.fulfillment;
        if (currentF === "delivery") {
          const where = resolveDeliveryCoords(state.coords);
          if (where && !isStoreInDeliveryArea(s, where.lat, where.lng)) {
            // Rejected with user-visible feedback: the UI (StoreCard) dims these
            // stores, but any non-visual caller must hear why nothing happened.
            toast.error(OUT_OF_AREA_MESSAGE);
            return;
          }
        }
        const recents = [s, ...get().recentStores.filter((r) => r.id !== s.id)].slice(
          0,
          MAX_RECENTS,
        );
        // Re-evaluate current fulfillment against the new store's support.
        const stillSupported = storeSupportsFulfillment(s, currentF);
        set({
          activeStore: s,
          recentStores: recents,
          fulfillment: stillSupported ? currentF : null,
          fulfillmentStatus: stillSupported ? (currentF ? "selected" : "none") : "unsupported",
          // Selecting a store means persistence already happened (this set()
          // is itself persisted by the middleware). Boot-time hydration is
          // handled by RootComponent's rehydrate() on mount; flipping this
          // back to false here would strand /home and /menu on `return null`
          // forever, because nothing re-hydrates after an in-session selection.
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
        // Single-winner: only the newest directory request may publish, so a
        // slow earlier response can never overwrite a newer list.
        const generation = ++directoryGeneration;
        const where = coords ?? get().coords;
        set({ status: "loading", error: null, coords: where ?? null });
        const res = await storeRepository.list(where ?? undefined);
        if (generation !== directoryGeneration) return;
        if (!res.success) {
          // A real failure stays a failure: the screen renders its error state
          // and never an empty "no stores" catalogue.
          set({ status: "error", error: res.error.message });
          return;
        }
        set({
          status: "ready",
          stores: res.data,
          // `nearby` is a slice of the SAME read — no second directory query.
          // Ranked from the position CURRENT at publish time: a GPS fix can
          // land while the read is still in flight.
          nearby: rankNearest(res.data, get().coords),
        });
      },

      async loadNearby(coords) {
        // Deliberately NO network call. A position update used to re-read the
        // whole directory TWICE for a top-5 slice: a duplicate of the list query
        // plus a second failure mode. Proximity is a pure function of the rows
        // already in memory, recomputed from the CURRENT coordinates.
        set({ coords, nearby: rankNearest(get().stores, coords) });
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
      version: 3,
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
        if (!state) {
          useStoreSelection.setState({ isHydrated: true });
          return;
        }
        // Re-hydrate fulfillmentStatus from the persisted pair.
        const fulfillmentStatus = state.activeStore && state.fulfillment
          ? storeSupportsFulfillment(state.activeStore, state.fulfillment)
            ? "selected"
            : "unsupported"
          : "none";
        // Persist already published its snapshot; notify subscribed route gates.
        useStoreSelection.setState({ isHydrated: true, fulfillmentStatus });
      },
      migrate: (persisted, version) => {
        if (!persisted || typeof persisted !== "object") {
          return { fulfillment: null } as Partial<StoreState>;
        }
        if (version < 2) {
          return { ...(persisted as object), fulfillment: null } as Partial<StoreState>;
        }
        if (version < 3) {
          // v3 used to strip str_NNN ids as mock-booted state — but the live
          // backend issues real outlet ids in exactly that shape (str_001…),
          // so stripping wiped genuine user selections on upgrade. Keep the
          // persisted selection untouched.
          return { ...(persisted as object) } as Partial<StoreState>;
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
