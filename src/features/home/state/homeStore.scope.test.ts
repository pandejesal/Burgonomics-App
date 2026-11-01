import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok, type ApiResult } from "@/core/network/http";
import type { HomeBundle } from "@/features/home/models";
import type { MenuCategory } from "@/features/menu/services/menuService";
import { resolveHomeMenuShortcuts } from "@/features/home/utils/menuShortcuts";

vi.mock("@/features/home/repositories/HomeRepository", () => ({
  homeRepository: { getHome: vi.fn() },
}));

import { homeRepository } from "@/features/home/repositories/HomeRepository";
import { useHomeStore } from "./homeStore";

function makeBundle(storeId: string, user?: string, categoryName = "Classic Burgers"): HomeBundle {
  const category: MenuCategory = {
    id: `${storeId}-category`,
    name: categoryName,
    order: 1,
    itemCount: 2,
  };
  return {
    banners: [],
    categories: [category],
    featuredOffers: [],
    bestSellers: [],
    popularCombos: [],
    recommendations: [],
    recentlyViewed: [],
    quickReorder: [
      {
        id: `${storeId}-${user ?? "guest"}-reorder`,
        orderId: `order-${storeId}`,
        title: categoryName,
        subtitle: "Previous order",
        total: 250,
        placedAt: "2026-10-29T00:00:00.000Z",
      },
    ],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

const getHome = vi.mocked(homeRepository.getHome);

beforeEach(() => {
  useHomeStore.getState().reset();
  getHome.mockReset();
});

describe("Home store scope and request ownership", () => {
  it("ignores an older store's success after a newer store has loaded", async () => {
    const pendingA = deferred<ApiResult<HomeBundle>>();
    const pendingB = deferred<ApiResult<HomeBundle>>();
    getHome.mockReturnValueOnce(pendingA.promise).mockReturnValueOnce(pendingB.promise);

    const loadA = useHomeStore.getState().load("store-A");
    const loadB = useHomeStore.getState().load("store-B");
    expect(useHomeStore.getState()).toMatchObject({
      status: "loading",
      bundle: null,
      lastLoadedStoreId: null,
    });

    pendingB.resolve(ok(makeBundle("store-B", undefined, "Sizzling")));
    await loadB;
    pendingA.resolve(ok(makeBundle("store-A")));
    await loadA;

    expect(useHomeStore.getState()).toMatchObject({
      status: "ready",
      lastLoadedStoreId: "store-B",
      lastLoadedUserId: null,
    });
    expect(useHomeStore.getState().bundle?.categories[0].name).toBe("Sizzling");
    expect(
      resolveHomeMenuShortcuts(useHomeStore.getState().bundle!.categories)[0].members,
    ).toHaveLength(1);
  });

  it.each(["success", "failure"] as const)(
    "ignores an older store's late %s after a newer store succeeds",
    async (lateResult) => {
      const pendingA = deferred<ApiResult<HomeBundle>>();
      const pendingB = deferred<ApiResult<HomeBundle>>();
      getHome.mockReturnValueOnce(pendingA.promise).mockReturnValueOnce(pendingB.promise);

      const loadA = useHomeStore.getState().load("store-A");
      const loadB = useHomeStore.getState().load("store-B");
      pendingB.resolve(ok(makeBundle("store-B")));
      await loadB;

      pendingA.resolve(
        lateResult === "success"
          ? ok(makeBundle("store-A"))
          : fail("HOME_UPSTREAM", "Late A failure"),
      );
      await loadA;

      expect(useHomeStore.getState()).toMatchObject({
        status: "ready",
        error: null,
        lastLoadedStoreId: "store-B",
      });
      expect(useHomeStore.getState().bundle?.categories[0].id).toBe("store-B-category");
    },
  );

  it("clears A's ready bundle synchronously when B starts, and keeps it absent when B fails", async () => {
    getHome.mockResolvedValueOnce(ok(makeBundle("store-A")));
    await useHomeStore.getState().load("store-A");
    expect(useHomeStore.getState().bundle?.categories[0].id).toBe("store-A-category");

    const pendingB = deferred<ApiResult<HomeBundle>>();
    getHome.mockReturnValueOnce(pendingB.promise);
    const loadB = useHomeStore.getState().load("store-B");

    expect(useHomeStore.getState()).toMatchObject({
      status: "loading",
      bundle: null,
      lastLoadedStoreId: null,
      lastLoadedUserId: null,
    });
    expect(resolveHomeMenuShortcuts([])).toEqual([]);

    pendingB.resolve(fail("MENU_FETCH_FAILED", "B menu unavailable"));
    await loadB;

    const state = useHomeStore.getState();
    expect(state).toMatchObject({
      status: "error",
      error: "B menu unavailable",
      bundle: null,
      lastLoadedStoreId: null,
      lastLoadedUserId: null,
    });
    expect(resolveHomeMenuShortcuts(state.bundle?.categories ?? [])).toEqual([]);
  });

  it("keys cached categories and quick reorder by both store and signed-in user", async () => {
    getHome.mockResolvedValueOnce(ok(makeBundle("store-A", "user-a")));
    await useHomeStore.getState().load("store-A", "user-a");
    expect(useHomeStore.getState().lastLoadedUserId).toBe("user-a");

    const pendingB = deferred<ApiResult<HomeBundle>>();
    getHome.mockReturnValueOnce(pendingB.promise);
    const loadB = useHomeStore.getState().load("store-A", "user-b");
    expect(useHomeStore.getState()).toMatchObject({
      status: "loading",
      bundle: null,
      lastLoadedUserId: null,
    });
    pendingB.resolve(ok(makeBundle("store-A", "user-b")));
    await loadB;

    expect(getHome).toHaveBeenLastCalledWith("store-A", "user-b");
    expect(useHomeStore.getState().lastLoadedUserId).toBe("user-b");
    expect(useHomeStore.getState().bundle?.quickReorder[0].id).toBe("store-A-user-b-reorder");
  });

  it("retains a safe same-scope refresh but surfaces its failure instead of cached data", async () => {
    const initial = makeBundle("store-A", "user-a");
    getHome.mockResolvedValueOnce(ok(initial));
    await useHomeStore.getState().load("store-A", "user-a");

    const pendingRefresh = deferred<ApiResult<HomeBundle>>();
    getHome.mockReturnValueOnce(pendingRefresh.promise);
    const refresh = useHomeStore.getState().load("store-A", "user-a", { refresh: true });
    expect(useHomeStore.getState()).toMatchObject({
      status: "refreshing",
      bundle: initial,
      lastLoadedStoreId: "store-A",
      lastLoadedUserId: "user-a",
    });

    pendingRefresh.resolve(fail("HOME_UPSTREAM", "Refresh failed"));
    await refresh;
    expect(useHomeStore.getState()).toMatchObject({
      status: "error",
      error: "Refresh failed",
      bundle: null,
      lastLoadedStoreId: null,
      lastLoadedUserId: null,
    });
  });

  it("invalidates an in-flight request on reset", async () => {
    const pendingA = deferred<ApiResult<HomeBundle>>();
    getHome.mockReturnValueOnce(pendingA.promise);
    const loadA = useHomeStore.getState().load("store-A");

    useHomeStore.getState().reset();
    pendingA.resolve(ok(makeBundle("store-A")));
    await loadA;

    expect(useHomeStore.getState()).toMatchObject({
      status: "idle",
      bundle: null,
      error: null,
      lastLoadedStoreId: null,
      lastLoadedUserId: null,
    });
  });
});
