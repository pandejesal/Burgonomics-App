import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Live menu subscription scope (HIGH: live menu truncation).
 *
 * The listener already reads the store's whole `products` query, but it used
 * to hand consumers page 1 of a 40-item page. menuStore treated the page as
 * the live catalog and pruned everything absent from it, so a >40-product
 * store silently lost items for the session. The live payload must therefore
 * carry the whole in-scope catalog and say so (`complete: true`).
 *
 * It must also never fall back to an unscoped `limit(100)` read when the store
 * scope is unresolved — that is the first 100 products of every outlet.
 */
const firestore = vi.hoisted(() => ({
  collection: vi.fn((_db: unknown, path: string) => ({ kind: "collection", path })),
  where: vi.fn((field: string, op: string, value: unknown) => ({
    kind: "where",
    field,
    op,
    value,
  })),
  limit: vi.fn((n: number) => ({ kind: "limit", n })),
  query: vi.fn((...parts: unknown[]) => ({ kind: "query", parts })),
  doc: vi.fn((_db: unknown, ...path: string[]) => ({ kind: "doc", path })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  ...firestore,
  // @/core/config/firebase initialises Firestore at import time.
  getFirestore: () => ({ kind: "firestore" }),
}));

import { menuService } from "./menuService";

function productDocs(count: number, restId: string) {
  return Array.from({ length: count }, (_, i) => ({
    id: `prod_${i}`,
    data: () => ({
      restId,
      name: `Item ${i}`,
      price: 100 + i,
      categoryId: i < Math.ceil(count / 2) ? "burgers" : "sides",
    }),
  }));
}

function snapshotOf(docs: ReturnType<typeof productDocs>) {
  return {
    forEach: (cb: (d: { id: string; data: () => unknown }) => void) => docs.forEach(cb),
  };
}

describe("menuService live menu subscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emits the whole store catalog (45 products), not the old 40-item page", async () => {
    const docs = productDocs(45, "rest_large");
    firestore.getDoc.mockResolvedValue({ data: () => ({ petpoojaRestId: "rest_large" }) });
    firestore.onSnapshot.mockImplementation((_q, next) => {
      next(snapshotOf(docs));
      return () => {};
    });

    const results: any[] = [];
    const unsub = menuService.subscribeProducts("store_large", undefined, (res) =>
      results.push(res)
    );

    await vi.waitFor(() => expect(results.length).toBe(1));

    const page = results[0].data;
    expect(results[0].success).toBe(true);
    expect(page.items).toHaveLength(45);
    expect(page.total).toBe(45);
    // The listener held the complete query result, so absence is a deletion.
    expect(page.complete).toBe(true);
    // Scoped read only: no unscoped fallback, no artificial page cap.
    expect(firestore.where).toHaveBeenCalledWith("restId", "==", "rest_large");
    expect(firestore.limit).not.toHaveBeenCalled();

    unsub();
  });

  it("keeps the category filter but still sends every product in that category", async () => {
    const docs = productDocs(45, "rest_cat");
    firestore.getDoc.mockResolvedValue({ data: () => ({ petpoojaRestId: "rest_cat" }) });
    firestore.onSnapshot.mockImplementation((_q, next) => {
      next(snapshotOf(docs));
      return () => {};
    });

    const results: any[] = [];
    menuService.subscribeProducts("store_cat", "burgers", (res) => results.push(res));

    await vi.waitFor(() => expect(results.length).toBe(1));

    expect(results[0].data.items).toHaveLength(23);
    expect(results[0].data.items.every((p: any) => p.categoryId === "burgers")).toBe(true);
    expect(results[0].data.total).toBe(23);
    expect(results[0].data.complete).toBe(true);
  });

  it("returns an empty snapshot and never reads the unscoped collection when the store scope is unresolved", async () => {
    firestore.onSnapshot.mockImplementation(() => () => {});

    const results: any[] = [];
    const unsub = menuService.subscribeProducts(undefined, undefined, (res) =>
      results.push(res)
    );

    await vi.waitFor(() => expect(results.length).toBe(1));

    expect(results[0]).toMatchObject({
      success: true,
      data: { items: [], total: 0, complete: true },
    });
    expect(firestore.onSnapshot).not.toHaveBeenCalled();
    expect(firestore.limit).not.toHaveBeenCalled();

    // Unsubscribing a no-op subscription is safe.
    expect(() => unsub()).not.toThrow();
  });

  it("returns empty categories and no unscoped listener when the store scope is unresolved", async () => {
    const results: any[] = [];
    const unsub = menuService.subscribeCategories(undefined, (res) => results.push(res));

    await vi.waitFor(() => expect(results.length).toBe(1));

    expect(results[0]).toMatchObject({ success: true, data: [] });
    expect(firestore.onSnapshot).not.toHaveBeenCalled();
    expect(firestore.limit).not.toHaveBeenCalled();
    expect(() => unsub()).not.toThrow();
  });
});
