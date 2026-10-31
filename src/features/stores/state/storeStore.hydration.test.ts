/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Fulfillment, Store } from "@/features/stores/models/Store";

vi.mock("@/features/stores/repositories/StoreRepository", () => ({
  storeRepository: { list: vi.fn(), nearby: vi.fn(), search: vi.fn() },
}));
vi.mock("@/features/stores/hooks/useLocationPermission", () => ({
  readCachedCoords: () => null,
}));
vi.mock("@/features/addresses/state/addressStore", () => ({
  useAddressStore: { getState: () => ({ addresses: [], selectedId: null }) },
  selectSelectedAddress: () => null,
}));

const selectedStore: Store = {
  id: "str_001",
  name: "Selected outlet",
  address: "Selected outlet address",
  city: "",
  area: "",
  lat: 23.0225,
  lng: 72.5714,
  phone: "",
  imageUrl: null,
  hours: null,
  isOpen: true,
  isBusy: false,
  isRecentlyOpened: false,
  supports: { delivery: true, takeaway: true, dineIn: true },
  etaMinutes: null,
};

let store: typeof import("./storeStore").useStoreSelection;
type StoreState = ReturnType<typeof store.getState>;
type HydrationSnapshot = Pick<
  StoreState,
  "isHydrated" | "activeStore" | "fulfillment" | "fulfillmentStatus"
>;

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  ({ useStoreSelection: store } = await import("./storeStore"));
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

function persistSelection(activeStore: Store, fulfillment: Fulfillment | null) {
  const state = {
    activeStore,
    recentStores: [activeStore],
    searchHistory: ["selected outlet"],
    fulfillment,
  };
  localStorage.setItem("burg.store", JSON.stringify({ state, version: 3 }));
  return state;
}

async function observeHydration() {
  const snapshots: HydrationSnapshot[] = [];
  const publishedStates: StoreState[] = [];
  const unsubscribe = store.subscribe((state) => {
    publishedStates.push(state);
    // Copy primitives at notification time: later mutation must not fake a notification.
    snapshots.push({
      isHydrated: state.isHydrated,
      activeStore: state.activeStore,
      fulfillment: state.fulfillment,
      fulfillmentStatus: state.fulfillmentStatus,
    });
  });
  try {
    await store.persist.rehydrate();
  } finally {
    unsubscribe();
  }
  return { snapshots, publishedStates };
}

describe("store selection hydration notifications", () => {
  it("publishes completion to existing subscribers with empty storage and no default store", async () => {
    expect(store.persist.getOptions().skipHydration).toBe(true);
    expect(store.getState()).toMatchObject({ isHydrated: false, activeStore: null });

    const { snapshots, publishedStates } = await observeHydration();

    expect(snapshots.at(-1)).toEqual({
      isHydrated: true,
      activeStore: null,
      fulfillment: "delivery",
      fulfillmentStatus: "none",
    });
    expect(publishedStates[0].isHydrated).toBe(false);
    expect(publishedStates.at(-1)).not.toBe(publishedStates[0]);
  });

  it.each<Fulfillment>(["delivery", "takeaway", "dinein"])(
    "publishes a supported persisted %s selection without changing it",
    async (fulfillment) => {
      const persisted = persistSelection(selectedStore, fulfillment);

      const { snapshots, publishedStates } = await observeHydration();

      expect(snapshots.at(-1)).toEqual({
        isHydrated: true,
        activeStore: selectedStore,
        fulfillment,
        fulfillmentStatus: "selected",
      });
      expect(store.getState()).toMatchObject(persisted);
      expect(publishedStates[0].fulfillmentStatus).toBe("none");
      expect(publishedStates[0].isHydrated).toBe(false);
    },
  );

  it.each<Fulfillment>(["delivery", "takeaway", "dinein"])(
    "publishes an unsupported persisted %s selection without inventing a replacement",
    async (fulfillment) => {
      const unsupportedStore: Store = {
        ...selectedStore,
        supports: { delivery: false, takeaway: false, dineIn: false },
      };
      const persisted = persistSelection(unsupportedStore, fulfillment);

      const { snapshots } = await observeHydration();

      expect(snapshots.at(-1)).toEqual({
        isHydrated: true,
        activeStore: unsupportedStore,
        fulfillment,
        fulfillmentStatus: "unsupported",
      });
      expect(store.getState()).toMatchObject(persisted);
    },
  );

  it("publishes no fulfillment when the persisted store has no fulfillment selection", async () => {
    const persisted = persistSelection(selectedStore, null);

    const { snapshots } = await observeHydration();

    expect(snapshots.at(-1)).toEqual({
      isHydrated: true,
      activeStore: selectedStore,
      fulfillment: null,
      fulfillmentStatus: "none",
    });
    expect(store.getState()).toMatchObject(persisted);
  });

  it.each(["unreadable storage", "invalid persisted JSON"])(
    "notifies existing subscribers even with %s, without selecting a fake store",
    async (failure) => {
      if (failure === "unreadable storage") {
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
          throw new Error("Storage access denied");
        });
      } else {
        localStorage.setItem("burg.store", "{invalid JSON");
      }

      const { snapshots } = await observeHydration();

      expect(snapshots.at(-1)).toEqual({
        isHydrated: true,
        activeStore: null,
        fulfillment: "delivery",
        fulfillmentStatus: "none",
      });
    },
  );
});
