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
  initializeFirestore: vi.fn(() => ({ kind: "firestore" })),
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
    docChanges: () => [],
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
    const unsub = menuService.subscribeStoreProducts("store_large", (res) => results.push(res));

    await vi.waitFor(() => expect(results.length).toBe(1));

    const page = results[0].data;
    expect(results[0].success).toBe(true);
    expect(page.products).toHaveLength(45);
    expect(new Set(page.products.map((p: any) => p.id)).size).toBe(45);
    // The listener held the complete query result, so absence is a deletion.
    expect(page.complete).toBe(true);
    // Scoped read only: no unscoped fallback, no artificial page cap.
    expect(firestore.where).toHaveBeenCalledWith("restId", "==", "rest_large");
    expect(firestore.limit).not.toHaveBeenCalled();

    unsub();
  });

  it("keeps every category in the whole-store stream so changing categories loses no products", async () => {
    const docs = productDocs(45, "rest_cat");
    firestore.getDoc.mockResolvedValue({ data: () => ({ petpoojaRestId: "rest_cat" }) });
    firestore.onSnapshot.mockImplementation((_q, next) => {
      next(snapshotOf(docs));
      return () => {};
    });

    const results: any[] = [];
    menuService.subscribeStoreProducts("store_cat", (res) => results.push(res));

    await vi.waitFor(() => expect(results.length).toBe(1));

    expect(results[0].data.products).toHaveLength(45);
    expect(results[0].data.products.filter((p: any) => p.categoryId === "burgers")).toHaveLength(
      23,
    );
    expect(results[0].data.products.filter((p: any) => p.categoryId === "sides")).toHaveLength(22);
    expect(results[0].data.complete).toBe(true);
  });

  it("reports unresolved scope and never reads the unscoped collection", async () => {
    firestore.onSnapshot.mockImplementation(() => () => {});

    const results: any[] = [];
    const unsub = menuService.subscribeStoreProducts(undefined, (res) => results.push(res));

    await vi.waitFor(() => expect(results.length).toBe(1));

    expect(results[0]).toMatchObject({
      success: false,
      error: { code: "MENU_SCOPE_UNRESOLVED" },
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

    expect(results[0]).toMatchObject({ success: false, error: { code: "MENU_SCOPE_UNRESOLVED" } });
    expect(firestore.onSnapshot).not.toHaveBeenCalled();
    expect(firestore.limit).not.toHaveBeenCalled();
    expect(() => unsub()).not.toThrow();
  });
});
