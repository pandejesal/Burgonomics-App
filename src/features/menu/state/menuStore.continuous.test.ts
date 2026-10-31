import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Product } from "@/features/menu/models";

/**
 * Continuous-menu store behaviour: paged sections, store/epoch ownership,
 * bounded concurrency and live updates that never invent or delete products.
 *
 * The repository is the only seam â€” the real store, its scheduler and its
 * snapshot merge all run here.
 */

const repository = vi.hoisted(() => ({
  listCategories: vi.fn(),
  listProducts: vi.fn(),
  subscribeCategories: vi.fn(),
  subscribeStoreProducts: vi.fn(),
}));

vi.mock("@/features/menu/repositories/MenuRepository", () => ({ menuRepository: repository }));
vi.mock("@/features/menu/services/menuService", () => ({ invalidateMenuCache: vi.fn() }));

import { MENU_MAX_CONCURRENT_LOADS, MENU_PAGE_SIZE, useMenuStore } from "./menuStore";

const flush = async (ticks = 12) => {
  for (let i = 0; i < ticks; i += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function product(id: string, categoryId: string, overrides: Partial<Product> = {}): Product {
  return {
    id,
    categoryId,
    name: id,
    price: 100,
    veg: true,
    inStock: true,
    ...overrides,
  };
}

function categoryPage(
  categoryId: string,
  pageNumber: number,
  total: number,
  take = MENU_PAGE_SIZE,
) {
  const start = (pageNumber - 1) * MENU_PAGE_SIZE;
  const count = Math.max(0, Math.min(take, total - start));
  const items = Array.from({ length: count }, (_, index) =>
    product(`${categoryId}-p${start + index + 1}`, categoryId),
  );
  return {
    success: true as const,
    data: { items, page: pageNumber, pageSize: MENU_PAGE_SIZE, total },
  };
}

const categories = [
  { id: "cat_a", name: "Alpha", order: 1, itemCount: 45 },
  { id: "cat_b", name: "Beta", order: 2, itemCount: 30 },
  { id: "cat_c", name: "Gamma", order: 3, itemCount: 5 },
];

beforeEach(() => {
  useMenuStore.getState().reset();
  repository.listCategories.mockReset();
  repository.listProducts.mockReset();
  repository.subscribeCategories.mockReset();
  repository.subscribeCategories.mockReturnValue(() => {});
  repository.subscribeStoreProducts.mockReset();
  repository.subscribeStoreProducts.mockReturnValue(() => {});
});

describe("continuous menu sections", () => {
  it("primers the first two sections at 20 items each and keeps the store's category order", async () => {
    repository.listCategories.mockResolvedValue({ success: true, data: categories });
    repository.listProducts.mockImplementation(async (_storeId, categoryId, pageNumber) =>
      categoryPage(categoryId, pageNumber, categoryId === "cat_a" ? 45 : 30),
    );

    await useMenuStore.getState().load("store-1");

    const state = useMenuStore.getState();
    expect(state.categories.map((category) => category.id)).toEqual(["cat_a", "cat_b", "cat_c"]);
    expect(state.buckets.cat_a.items).toHaveLength(20);
    expect(state.buckets.cat_b.items).toHaveLength(20);
    // Not every category is fetched up front.
    expect(state.buckets.cat_c).toBeUndefined();
    expect(repository.listProducts).toHaveBeenCalledTimes(2);
    expect(repository.listProducts).toHaveBeenCalledWith("store-1", "cat_a", 1, MENU_PAGE_SIZE);

    // Category A flows into its next page; the total is the server's, not the
    // number of cards currently loaded.
    await useMenuStore.getState().loadMore("cat_a");
    const bucket = useMenuStore.getState().buckets.cat_a;
    expect(bucket.items).toHaveLength(40);
    expect(bucket.page).toBe(2);
    expect(bucket.total).toBe(45);
    expect(bucket.hasMore).toBe(true);
  });

  it("keeps at most two page reads in flight and queues the rest", async () => {
    const gates: Array<{ categoryId: string; resolve: (value: unknown) => void }> = [];
    repository.listCategories.mockResolvedValue({ success: true, data: categories });
    repository.listProducts.mockImplementation(
      (_storeId, categoryId, pageNumber) =>
        new Promise((resolve) => {
          gates.push({
            categoryId,
            resolve: (value) => resolve(value),
          });
          void pageNumber;
        }),
    );

    void useMenuStore.getState().load("store-1");
    await flush();
    expect(repository.listProducts).toHaveBeenCalledTimes(MENU_MAX_CONCURRENT_LOADS);

    const pendingThird = useMenuStore.getState().loadMore("cat_c");
    await flush();
    // Both slots are still busy: the third read must wait.
    expect(repository.listProducts).toHaveBeenCalledTimes(MENU_MAX_CONCURRENT_LOADS);

    gates.shift()!.resolve(categoryPage("cat_a", 1, 45));
    await flush();
    expect(repository.listProducts).toHaveBeenCalledTimes(3);
    expect(repository.listProducts).toHaveBeenLastCalledWith("store-1", "cat_c", 1, MENU_PAGE_SIZE);

    for (const gate of gates) gate.resolve(categoryPage(gate.categoryId, 1, 10));
    await flush();
    await pendingThird;
  });

  it("dedupes a second request for a page that is already queued", async () => {
    const gate = deferred<unknown>();
    repository.listCategories.mockResolvedValue({ success: true, data: [categories[0]] });
    repository.listProducts.mockImplementation(() => gate.promise);

    void useMenuStore.getState().load("store-1");
    await flush();
    expect(repository.listProducts).toHaveBeenCalledTimes(1);

    let settled = false;
    const duplicate = useMenuStore
      .getState()
      .loadMore("cat_a")
      .then(() => {
        settled = true;
      });
    await flush();
    // Same category already in flight: no duplicate page-1 read.
    expect(repository.listProducts).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);

    gate.resolve(categoryPage("cat_a", 1, 45));
    await flush();
    await duplicate;
    expect(settled).toBe(true);
  });

  it("turns a thrown page read into a retryable section instead of a stuck skeleton", async () => {
    repository.listCategories.mockResolvedValue({ success: true, data: [categories[0]] });
    repository.listProducts.mockRejectedValueOnce(new Error("unexpected repository rejection"));
    await useMenuStore.getState().load("store-1");
    const failed = useMenuStore.getState().buckets.cat_a;
    expect(failed.loading).toBe(false);
    expect(failed.error).toContain("Please try again");

    repository.listProducts.mockResolvedValueOnce(categoryPage("cat_a", 1, 45));
    await useMenuStore.getState().loadMore("cat_a");
    expect(repository.listProducts).toHaveBeenLastCalledWith("store-1", "cat_a", 1, MENU_PAGE_SIZE);
    expect(useMenuStore.getState().buckets.cat_a.items).toHaveLength(20);
    expect(useMenuStore.getState().buckets.cat_a.error).toBeUndefined();
  });

  it("surfaces a thrown category read without retaining a loading state", async () => {
    repository.listCategories.mockRejectedValueOnce(new Error("unexpected category rejection"));
    await useMenuStore.getState().load("store-1");
    expect(useMenuStore.getState().status).toBe("error");
    expect(useMenuStore.getState().error).toContain("Please try again");
    expect(repository.listProducts).not.toHaveBeenCalled();
  });

  it("never returns old-store inventory under a new store, even for late responses", async () => {
    const oldGate = deferred<unknown>();
    repository.listCategories.mockImplementation(async (storeId: string) => ({
      success: true,
      data: storeId === "store-a" ? [categories[0]] : [categories[1]],
    }));
    repository.listProducts.mockImplementationOnce(() => oldGate.promise);
    repository.listProducts.mockImplementation(async (_storeId, categoryId, pageNumber) =>
      categoryPage(categoryId, pageNumber, 10),
    );

    void useMenuStore.getState().load("store-a");
    await flush();
    // Still fetching store A's first page when the customer switches.
    await useMenuStore.getState().load("store-b");
    expect(useMenuStore.getState().storeId).toBe("store-b");
    expect(useMenuStore.getState().buckets.cat_a).toBeUndefined();

    oldGate.resolve(categoryPage("cat_a", 1, 45));
    await flush();

    const state = useMenuStore.getState();
    expect(state.buckets.cat_a).toBeUndefined();
    expect(state.buckets.cat_b?.items.length).toBe(10);
    expect(
      Object.values(state.buckets).flatMap((bucket) => bucket.items.map((item) => item.categoryId)),
    ).not.toContain("cat_a");
  });

  it("ignores an error that belongs to the previous store's epoch", async () => {
    const failing = deferred<unknown>();
    repository.listCategories.mockImplementation(async (storeId: string) => ({
      success: true,
      data: storeId === "store-a" ? [categories[0]] : [categories[1]],
    }));
    repository.listProducts.mockImplementationOnce(() => failing.promise);
    repository.listProducts.mockImplementation(async (_storeId, categoryId, pageNumber) =>
      categoryPage(categoryId, pageNumber, 10),
    );

    void useMenuStore.getState().load("store-a");
    await flush();
    await useMenuStore.getState().load("store-b");
    expect(useMenuStore.getState().error).toBeUndefined();

    failing.resolve({
      success: false,
      error: { code: "MENU_FETCH_FAILED", message: "old store failure" },
    });
    await flush();

    const state = useMenuStore.getState();
    expect(state.buckets.cat_a).toBeUndefined();
    expect(state.error).toBeUndefined();
  });

  it("does not read anything when no store scope is selected", async () => {
    await useMenuStore.getState().loadMore("cat_a");
    expect(repository.listProducts).not.toHaveBeenCalled();
  });
});

describe("live menu snapshots", () => {
  async function loadThreePages() {
    repository.listCategories.mockResolvedValue({ success: true, data: [categories[0]] });
    repository.listProducts.mockImplementation(async (_storeId, categoryId, pageNumber) =>
      categoryPage(categoryId, pageNumber, 60),
    );
    await useMenuStore.getState().load("store-1");
    await useMenuStore.getState().loadMore("cat_a");
    await useMenuStore.getState().loadMore("cat_a");
    expect(useMenuStore.getState().buckets.cat_a.items).toHaveLength(60);
  }

  it("updates item 41's availability in place and keeps every loaded page", async () => {
    await loadThreePages();
    let liveCallback: ((result: unknown) => void) | undefined;
    repository.subscribeStoreProducts.mockImplementation(
      (_storeId: string, callback: (result: unknown) => void) => {
        liveCallback = callback;
        return () => {};
      },
    );

    useMenuStore.getState().subscribeToLiveMenu("store-1");
    const before = useMenuStore.getState().buckets.cat_a.items;
    const target = before[40];
    expect(target.id).toBe("cat_a-p41");

    liveCallback!({
      success: true,
      data: {
        products: before.map((item) =>
          item.id === target.id ? { ...item, inStock: false, unavailableReason: "86'd" } : item,
        ),
        removedIds: [],
      },
    });

    const after = useMenuStore.getState().buckets.cat_a.items;
    expect(after).toHaveLength(60);
    expect(after[40].id).toBe("cat_a-p41");
    expect(after[40].inStock).toBe(false);
    expect(after[40].unavailableReason).toBe("86'd");
    // Cached pages are not reset by a live sync.
    expect(useMenuStore.getState().buckets.cat_a.page).toBe(3);
  });

  it("does not infer deletion from a product's absence in a limited snapshot", async () => {
    await loadThreePages();
    let liveCallback: ((result: unknown) => void) | undefined;
    repository.subscribeStoreProducts.mockImplementation(
      (_storeId: string, callback: (result: unknown) => void) => {
        liveCallback = callback;
        return () => {};
      },
    );
    useMenuStore.getState().subscribeToLiveMenu("store-1");

    const firstPageOnly = useMenuStore
      .getState()
      .buckets.cat_a.items.slice(0, 20)
      .map((item) => ({ ...item }));

    // A page-shaped payload without any explicit removal says nothing about
    // items 21..60 â€” they must all survive.
    liveCallback!({ success: true, data: { products: firstPageOnly, removedIds: [] } });
    expect(useMenuStore.getState().buckets.cat_a.items).toHaveLength(60);

    // Only an explicit removal may delete.
    liveCallback!({
      success: true,
      data: {
        products: firstPageOnly,
        removedIds: ["cat_a-p41"],
      },
    });
    const after = useMenuStore.getState().buckets.cat_a.items;
    expect(after.some((item) => item.id === "cat_a-p41")).toBe(false);
    expect(after).toHaveLength(59);
  });

  it("ignores live traffic for a store that is no longer selected", async () => {
    repository.listCategories.mockImplementation(async (storeId: string) => ({
      success: true,
      data: storeId === "store-a" ? [categories[0]] : [categories[1]],
    }));
    repository.listProducts.mockImplementation(async (_storeId, categoryId, pageNumber) =>
      categoryPage(categoryId, pageNumber, 10),
    );

    let liveA: ((result: unknown) => void) | undefined;
    repository.subscribeStoreProducts.mockImplementation(
      (_storeId: string, callback: (result: unknown) => void) => {
        liveA = callback;
        return () => {};
      },
    );

    await useMenuStore.getState().load("store-a");
    const unsubscribe = useMenuStore.getState().subscribeToLiveMenu("store-a");
    await useMenuStore.getState().load("store-b");
    unsubscribe();

    liveA!({ success: true, data: { products: [product("ghost", "cat_a")], removedIds: [] } });
    expect(useMenuStore.getState().buckets.cat_a).toBeUndefined();
  });
});
