/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Store } from "@/features/stores/models/Store";

/**
 * Store-load state honesty + single-winner loads.
 *
 * The screen derives "no stores" from this state, so two properties matter:
 *   1. `status` must start at "idle" ? a "ready" default is what let the first
 *      paint claim an empty catalogue before any read had happened.
 *   2. Only the newest directory read may publish, and a position update must
 *      never re-read the directory (it used to cost two extra full reads).
 */

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

const atKm = (km: number) => ({ lat: km / 111.19, lng: 0 });

const outlet = (id: string, km: number): Store => ({
  id,
  name: `Outlet ${id}`,
  address: "",
  city: "",
  area: "",
  ...atKm(km),
  phone: "",
  imageUrl: null,
  hours: null,
  isOpen: undefined,
  isBusy: false,
  isRecentlyOpened: false,
  supports: { delivery: true, takeaway: true, dineIn: true },
  etaMinutes: null,
});

const okList = (data: Store[]) => ({ success: true as const, data });
const failList = (message: string) => ({
  success: false as const,
  error: { code: "STORES_UNAVAILABLE", message, retryable: true },
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

let store: typeof import("./storeStore").useStoreSelection;
let repo: {
  list: ReturnType<typeof vi.fn>;
  nearby: ReturnType<typeof vi.fn>;
  search: ReturnType<typeof vi.fn>;
};

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  repo = (await import("@/features/stores/repositories/StoreRepository")).storeRepository as any;
  store = (await import("./storeStore")).useStoreSelection;
});

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("first paint", () => {
  it("starts idle with no rows, so nothing can claim an empty catalogue yet", () => {
    expect(store.getState().status).toBe("idle");
    expect(store.getState().stores).toEqual([]);
    expect(store.getState().error).toBeNull();
  });
});

describe("loadStores", () => {
  it("moves idle -> loading -> ready and publishes the rows", async () => {
    repo.list.mockResolvedValueOnce(okList([outlet("a", 1)]));

    const pending = store.getState().loadStores();
    expect(store.getState().status).toBe("loading");

    await pending;

    expect(store.getState().status).toBe("ready");
    expect(store.getState().stores.map((s) => s.id)).toEqual(["a"]);
    expect(store.getState().error).toBeNull();
    expect(repo.list).toHaveBeenCalledTimes(1);
  });

  it("keeps a real failure as an error state instead of an empty list", async () => {
    repo.list.mockResolvedValueOnce(failList("The store directory could not be loaded."));

    await store.getState().loadStores();

    expect(store.getState().status).toBe("error");
    expect(store.getState().error).toBe("The store directory could not be loaded.");
  });

  it("lets only the newest overlapping read publish", async () => {
    const older = deferred<ReturnType<typeof okList>>();
    const newer = deferred<ReturnType<typeof okList>>();
    repo.list.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);

    const first = store.getState().loadStores();
    const second = store.getState().loadStores();

    newer.resolve(okList([outlet("new", 1)]));
    await second;
    older.resolve(okList([outlet("old", 1)]));
    await first;

    expect(store.getState().stores.map((s) => s.id)).toEqual(["new"]);
    expect(store.getState().status).toBe("ready");
  });
});

describe("loadNearby", () => {
  it("records the position without re-reading the directory", async () => {
    repo.list.mockResolvedValueOnce(okList([outlet("a", 1), outlet("b", 9)]));
    await store.getState().loadStores();
    const readsAfterList = repo.list.mock.calls.length;

    await store.getState().loadNearby({ lat: 0, lng: 0 });

    expect(repo.list.mock.calls.length).toBe(readsAfterList);
    expect(repo.nearby).not.toHaveBeenCalled();
    expect(store.getState().coords).toEqual({ lat: 0, lng: 0 });
    expect(store.getState().nearby.map((s) => s.id)).toEqual(["a", "b"]);
    // A position update is not a load state.
    expect(store.getState().status).toBe("ready");
  });

  it("re-ranks from the rows already in memory", async () => {
    repo.list.mockResolvedValueOnce(okList([outlet("far", 9), outlet("near", 1)]));
    await store.getState().loadStores();

    await store.getState().loadNearby({ lat: 0, lng: 0 });

    expect(store.getState().nearby.map((s) => s.id)).toEqual(["near", "far"]);
  });
});

describe("publish-time ranking", () => {
  it("ranks from the position current at publish time, not the one at request time", async () => {
    const pending = deferred<ReturnType<typeof okList>>();
    repo.list.mockReturnValueOnce(pending.promise);

    // Request starts with no position, then a GPS fix lands mid-flight.
    const loading = store.getState().loadStores();
    await store.getState().loadNearby({ lat: 0, lng: 0 });
    pending.resolve(okList([outlet("far", 9), outlet("near", 1)]));
    await loading;

    // Alphabetical would be far, near; distance ordering proves the fix.
    expect(store.getState().nearby.map((s) => s.id)).toEqual(["near", "far"]);
  });
});

describe("refresh", () => {
  it("re-reads the directory exactly once", async () => {
    repo.list.mockResolvedValue(okList([outlet("a", 1)]));

    await store.getState().loadStores();
    await store.getState().refresh();

    expect(repo.list).toHaveBeenCalledTimes(2);
  });
});
