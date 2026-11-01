import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ApiResult } from "@/core/network/http";
import type { MenuCategory } from "@/features/menu/services/menuService";
import type { Product, ProductPage } from "@/features/menu/models";

/**
 * Live-merge regression (HIGH: live menu truncation).
 *
 * menuStore used to treat a live page as the complete catalog: every product
 * absent from that page was deleted from its category bucket. The current
 * store pages 20 items at a time and the live listener is a whole-store
 * snapshot (`subscribeStoreProducts` -> {products, removedIds, complete});
 * only a PROVEN complete snapshot may prune membership. These cases pin that
 * behaviour through the paged API.
 */
const repo = vi.hoisted(() => ({
  listCategories: vi.fn(),
  listProducts: vi.fn(),
  subscribeCategories: vi.fn(),
  subscribeStoreProducts: vi.fn(),
}));

vi.mock("@/features/menu/repositories/MenuRepository", () => ({ menuRepository: repo }));

import { useMenuStore, MENU_PAGE_SIZE } from "./menuStore";

const ok = <T>(data: T): ApiResult<T> => ({ success: true, data });

function makeProducts(count: number, categoryId = "burgers"): Product[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `prod_${categoryId}_${i}`,
    categoryId,
    categoryName: categoryId === "burgers" ? "Burgers" : "Sides",
    name: `Item ${i}`,
    price: 100 + i,
    veg: true,
    inStock: true,
  }));
}

function pageOf(all: Product[], page: number, pageSize: number): ProductPage {
  const start = (page - 1) * pageSize;
  return {
    items: all.slice(start, start + pageSize),
    page,
    pageSize,
    total: all.length,
  };
}

const categories: MenuCategory[] = [
  { id: "burgers", name: "Burgers", order: 1, itemCount: 0 },
  { id: "sides", name: "Sides", order: 2, itemCount: 0 },
];

/** Swap in a repository whose catalog is `all`, and keep the live callback. */
function primeRepository(all: Product[]) {
  let liveCb:
    | ((res: ApiResult<{ products: Product[]; removedIds: string[]; complete: boolean }>) => void)
    | null = null;
  repo.listCategories.mockResolvedValue(ok(categories));
  repo.listProducts.mockImplementation(
    async (_store: string, categoryId: string | undefined, page: number, pageSize: number) => {
      const scoped = categoryId ? all.filter((p) => p.categoryId === categoryId) : all;
      return ok(pageOf(scoped, page, pageSize));
    },
  );
  repo.subscribeCategories.mockImplementation(() => () => {});
  repo.subscribeStoreProducts.mockImplementation(
    (
      _store: string,
      cb: (
        res: ApiResult<{ products: Product[]; removedIds: string[]; complete: boolean }>,
      ) => void,
    ) => {
      liveCb = cb;
      return () => {};
    },
  );
  return {
    emit(payload: { items: Product[]; complete: boolean; removedIds?: string[] }) {
      liveCb?.(
        ok({
          products: payload.items,
          removedIds: payload.removedIds ?? [],
          complete: payload.complete,
        }),
      );
    },
  };
}

/** Page a section until the server total is fully loaded. */
async function loadAll(categoryId: string) {
  await useMenuStore.getState().loadMore(categoryId);
  while (useMenuStore.getState().buckets[categoryId]?.hasMore) {
    await useMenuStore.getState().loadMore(categoryId);
  }
}

describe("menuStore live merge never deletes products it did not see", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useMenuStore.getState().reset();
    useMenuStore.setState({ storeId: undefined });
  });

  it("keeps all 45 loaded products when a complete live snapshot carries all 45", async () => {
    const all = makeProducts(45);
    const live = primeRepository(all);

    await useMenuStore.getState().load("store_45");
    await loadAll("burgers");
    expect(useMenuStore.getState().buckets.burgers.items).toHaveLength(45);

    const unsub = useMenuStore.getState().subscribeToLiveMenu("store_45");
    live.emit({ items: all, complete: true });

    const bucket = useMenuStore.getState().buckets.burgers;
    expect(bucket.items).toHaveLength(45);
    expect(new Set(bucket.items.map((p) => p.id)).size).toBe(45);
    // A complete snapshot leaves nothing to page in.
    expect(bucket.hasMore).toBe(false);
    expect(bucket.total).toBe(45);
    unsub();
  });

  it("cannot prune on an incomplete snapshot: 40 of 45 items leave the other 5 intact", async () => {
    const all = makeProducts(45);
    const live = primeRepository(all);

    await useMenuStore.getState().load("store_partial");
    await loadAll("burgers");
    expect(useMenuStore.getState().buckets.burgers.items).toHaveLength(45);

    const unsub = useMenuStore.getState().subscribeToLiveMenu("store_partial");
    // A limited/partial live page must merge-only.
    live.emit({ items: all.slice(0, 40), complete: false });

    const bucket = useMenuStore.getState().buckets.burgers;
    expect(bucket.items).toHaveLength(45);
    expect(bucket.hasMore).toBe(false);
    const ids = new Set(bucket.items.map((p) => p.id));
    for (const p of all) expect(ids.has(p.id)).toBe(true);
    unsub();
  });

  it("prunes a genuinely deleted product only from a complete snapshot", async () => {
    const all = makeProducts(45);
    const live = primeRepository(all);

    await useMenuStore.getState().load("store_delete");
    await loadAll("burgers");
    const remaining = all.filter((p) => p.id !== "prod_burgers_7");

    const unsub = useMenuStore.getState().subscribeToLiveMenu("store_delete");
    live.emit({ items: remaining, complete: true });

    const bucket = useMenuStore.getState().buckets.burgers;
    expect(bucket.items).toHaveLength(44);
    expect(bucket.items.some((p) => p.id === "prod_burgers_7")).toBe(false);
    unsub();
  });

  it("still pages in a 120-product category via loadMore without duplicating ids", async () => {
    const all = makeProducts(120);
    primeRepository(all);

    await useMenuStore.getState().load("store_120");
    expect(useMenuStore.getState().buckets.burgers.items).toHaveLength(MENU_PAGE_SIZE);
    expect(useMenuStore.getState().buckets.burgers.hasMore).toBe(true);

    await loadAll("burgers");

    const bucket = useMenuStore.getState().buckets.burgers;
    expect(bucket.items).toHaveLength(120);
    expect(new Set(bucket.items.map((p) => p.id)).size).toBe(120);
    expect(bucket.hasMore).toBe(false);
  });
});
