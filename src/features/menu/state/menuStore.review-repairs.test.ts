import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Product } from "@/features/menu/models";

/**
 * Review repairs (A + D) against the real store:
 * - a complete delete-all snapshot followed by a re-add must recover (the old
 *   merge computed `hasMore` before appending, skipped the item, and then
 *   asked for page N instead of page 1);
 * - partial/unknown snapshots must keep loaded pages and pagination;
 * - a malformed success page must surface a retryable error and recover.
 */

const repository = vi.hoisted(() => ({
  listCategories: vi.fn(),
  listProducts: vi.fn(),
  subscribeCategories: vi.fn(),
  subscribeStoreProducts: vi.fn(),
}));

vi.mock("@/features/menu/repositories/MenuRepository", () => ({ menuRepository: repository }));
vi.mock("@/features/menu/services/menuService", () => ({ invalidateMenuCache: vi.fn() }));

import { MENU_PAGE_SIZE, useMenuStore } from "./menuStore";

const flush = async () => {
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

function product(id: string, categoryId = "cat_a"): Product {
  return { id, categoryId, name: id, price: 100, veg: true, inStock: true };
}

function page(categoryId: string, pageNumber: number, total: number) {
  const start = (pageNumber - 1) * MENU_PAGE_SIZE;
  const count = Math.max(0, Math.min(MENU_PAGE_SIZE, total - start));
  return {
    success: true as const,
    data: {
      items: Array.from({ length: count }, (_, index) =>
        product(`${categoryId}-p${start + index + 1}`, categoryId),
      ),
      page: pageNumber,
      pageSize: MENU_PAGE_SIZE,
      total,
    },
  };
}

let liveCallback: ((result: unknown) => void) | undefined;

async function loadThreeCategoriesWithPages() {
  repository.listCategories.mockResolvedValue({
    success: true,
    data: [{ id: "cat_a", name: "Alpha", order: 1, itemCount: 60 }],
  });
  repository.listProducts.mockImplementation(
    async (_storeId: string, categoryId: string, pageNumber: number) =>
      page(categoryId, pageNumber, 60),
  );
  await useMenuStore.getState().load("store-1");
  await useMenuStore.getState().loadMore("cat_a");
  expect(useMenuStore.getState().buckets.cat_a.items).toHaveLength(40);
  repository.subscribeStoreProducts.mockImplementation((_storeId, callback) => {
    liveCallback = callback as (result: unknown) => void;
    return () => {};
  });
  useMenuStore.getState().subscribeToLiveMenu("store-1");
}

beforeEach(() => {
  useMenuStore.getState().reset();
  liveCallback = undefined;
  repository.listCategories.mockReset();
  repository.listProducts.mockReset();
  repository.subscribeCategories.mockReset();
  repository.subscribeCategories.mockReturnValue(() => {});
  repository.subscribeStoreProducts.mockReset();
  repository.subscribeStoreProducts.mockReturnValue(() => {});
});

describe("live snapshot recovery (A)", () => {
  it("reaches a re-added item after the whole scope was emptied", async () => {
    await loadThreeCategoriesWithPages();
    const loadedIds = useMenuStore.getState().buckets.cat_a.items.map((item) => item.id);

    liveCallback!({
      success: true,
      data: { products: [], removedIds: loadedIds, complete: true },
    });
    expect(useMenuStore.getState().buckets.cat_a.items).toHaveLength(0);
    expect(useMenuStore.getState().buckets.cat_a.hasMore).toBe(false);

    liveCallback!({
      success: true,
      data: { products: [product("a1")], removedIds: [], complete: true },
    });
    const recovered = useMenuStore.getState().buckets.cat_a;
    expect(recovered.items.map((item) => item.id)).toEqual(["a1"]);
    // Page 1 restarted, so paging no longer asks for a stale page 3.
    expect(recovered.page).toBe(1);
    expect(recovered.hasMore).toBe(false);
    expect(recovered.total).toBe(1);
  });

  it("seeds page 1 then paginates from page 2 when the scope comes back larger", async () => {
    await loadThreeCategoriesWithPages();
    const loadedIds = useMenuStore.getState().buckets.cat_a.items.map((item) => item.id);
    liveCallback!({ success: true, data: { products: [], removedIds: loadedIds, complete: true } });

    const readded = Array.from({ length: 30 }, (_, index) => product(`b${index + 1}`));
    liveCallback!({ success: true, data: { products: readded, removedIds: [], complete: true } });

    let bucket = useMenuStore.getState().buckets.cat_a;
    expect(bucket.items).toHaveLength(MENU_PAGE_SIZE);
    expect(bucket.page).toBe(1);
    expect(bucket.total).toBe(30);
    expect(bucket.hasMore).toBe(true);

    await useMenuStore.getState().loadMore("cat_a");
    expect(repository.listProducts).toHaveBeenLastCalledWith("store-1", "cat_a", 2, MENU_PAGE_SIZE);
    bucket = useMenuStore.getState().buckets.cat_a;
    expect(bucket.items.length).toBeGreaterThan(MENU_PAGE_SIZE);
  });

  it("keeps loaded pages, counts and hasMore for a partial snapshot", async () => {
    await loadThreeCategoriesWithPages();
    const loaded = useMenuStore.getState().buckets.cat_a.items;
    expect(loaded).toHaveLength(40);

    liveCallback!({
      success: true,
      data: { products: loaded.slice(0, 40), removedIds: [], complete: false },
    });

    const after = useMenuStore.getState().buckets.cat_a;
    expect(after.items).toHaveLength(40);
    expect(after.page).toBe(2);
    expect(after.total).toBe(60);
    // Absence from a page-shaped payload never shuts remaining pagination.
    expect(after.hasMore).toBe(true);
  });

  it("pages through a bulk growth instead of skipping the first window", async () => {
    repository.listCategories.mockResolvedValue({
      success: true,
      data: [{ id: "cat_a", name: "Alpha", order: 1, itemCount: 3 }],
    });
    repository.listProducts.mockImplementation(
      async (_storeId: string, categoryId: string, pageNumber: number) =>
        page(categoryId, pageNumber, 3),
    );

    await useMenuStore.getState().load("store-1");
    expect(useMenuStore.getState().buckets.cat_a.items).toHaveLength(3);

    repository.subscribeStoreProducts.mockImplementation((_storeId, callback) => {
      liveCallback = callback as (result: unknown) => void;
      return () => {};
    });
    useMenuStore.getState().subscribeToLiveMenu("store-1");

    // 97 inserts land on top of the 3 known rows; canonical order is what the
    // paged reads slice.
    const canonical = Array.from({ length: 100 }, (_, index) => product(`n${index + 1}`));
    repository.listProducts.mockImplementation(
      async (_storeId: string, _categoryId: string, pageNumber: number) => ({
        success: true as const,
        data: {
          items: canonical.slice((pageNumber - 1) * MENU_PAGE_SIZE, pageNumber * MENU_PAGE_SIZE),
          page: pageNumber,
          pageSize: MENU_PAGE_SIZE,
          total: canonical.length,
        },
      }),
    );

    liveCallback!({ success: true, data: { products: canonical, removedIds: [], complete: true } });
    let bucket = useMenuStore.getState().buckets.cat_a;
    expect(bucket.items).toHaveLength(MENU_PAGE_SIZE);
    expect(bucket.page).toBe(1);
    expect(bucket.hasMore).toBe(true);

    const seen = new Set(bucket.items.map((item) => item.id));
    for (let guard = 0; guard < 10 && bucket.hasMore; guard += 1) {
      await useMenuStore.getState().loadMore("cat_a");
      bucket = useMenuStore.getState().buckets.cat_a;
      bucket.items.forEach((item) => seen.add(item.id));
    }

    // Every row is reachable exactly once, and rows 1-20 were not skipped.
    expect(seen.size).toBe(100);
    expect(seen.has("n1")).toBe(true);
    expect(seen.has("n17")).toBe(true);
    expect(bucket.hasMore).toBe(false);
  });

  it("re-homes a product that moved category exactly once", async () => {
    repository.listCategories.mockResolvedValue({
      success: true,
      data: [
        { id: "cat_a", name: "Alpha", order: 1, itemCount: 2 },
        { id: "cat_b", name: "Beta", order: 2, itemCount: 1 },
      ],
    });
    repository.listProducts.mockImplementation(async (_storeId: string, categoryId: string) => ({
      success: true as const,
      data: {
        items:
          categoryId === "cat_a" ? [product("keepA"), product("mover")] : [product("b1", "cat_b")],
        page: 1,
        pageSize: MENU_PAGE_SIZE,
        total: categoryId === "cat_a" ? 2 : 1,
      },
    }));

    await useMenuStore.getState().load("store-1");
    repository.subscribeStoreProducts.mockImplementation((_storeId, callback) => {
      liveCallback = callback as (result: unknown) => void;
      return () => {};
    });
    useMenuStore.getState().subscribeToLiveMenu("store-1");

    liveCallback!({
      success: true,
      data: {
        products: [product("keepA"), product("mover", "cat_b"), product("b1", "cat_b")],
        removedIds: [],
        complete: true,
      },
    });

    const state = useMenuStore.getState();
    expect(state.buckets.cat_a.items.map((item) => item.id)).toEqual(["keepA"]);
    expect(state.buckets.cat_b.items.map((item) => item.id)).toEqual(["mover", "b1"]);
    expect(Object.keys(state.buckets)).toEqual(["cat_a", "cat_b"]);
  });
});

describe("malformed page retryability (D)", () => {
  it("turns a malformed success page into a retryable section error and recovers", async () => {
    repository.listCategories.mockResolvedValue({
      success: true,
      data: [{ id: "cat_a", name: "Alpha", order: 1, itemCount: 20 }],
    });
    repository.listProducts
      .mockResolvedValueOnce({
        success: true,
        data: { items: null, page: 1, pageSize: 20, total: 20 },
      })
      .mockImplementation(async (_storeId: string, categoryId: string, pageNumber: number) =>
        page(categoryId, pageNumber, 20),
      );

    await useMenuStore.getState().load("store-1");
    let bucket = useMenuStore.getState().buckets.cat_a;
    expect(bucket.loading).toBe(false);
    expect(bucket.error).toMatch(/read these items/i);
    expect(bucket.items).toHaveLength(0);

    await useMenuStore.getState().loadMore("cat_a");
    bucket = useMenuStore.getState().buckets.cat_a;
    expect(bucket.error).toBeUndefined();
    expect(bucket.items).toHaveLength(20);
    expect(bucket.page).toBe(1);
  });
});
