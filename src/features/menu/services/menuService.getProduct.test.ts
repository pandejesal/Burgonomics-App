import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Store-bound single-product reads.
 *
 * The cart/reorder path calls `getProduct(id, storeId)` and treats the answer
 * as that store's inventory. These tests pin the contract: a verified restId,
 * direct-doc ownership, an ambiguity-refusing legacy join, and fail-closed
 * behaviour when the mapping or the read is unavailable.
 */

const firestore = vi.hoisted(() => ({
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  doc: vi.fn(),
  query: vi.fn(),
  collection: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
}));

vi.mock("firebase/firestore", () => firestore);
vi.mock("@/core/config/firebase", () => ({ db: { __db: true } }));

import { menuService } from "./menuService";

let storeDocs: Map<string, Record<string, unknown> | undefined>;
let productDocs: Map<string, Record<string, unknown> | undefined>;
let legacyMatches: Record<string, unknown>[];
let lastQuery: { collection: string; constraints: Array<Record<string, unknown>> } | undefined;

const productDoc = (id: string, data: Record<string, unknown>) => ({
  id,
  exists: () => true,
  data: () => data,
  ref: { id },
});

const missingDoc = (id: string) => ({
  id,
  exists: () => false,
  data: () => undefined,
  ref: { id },
});

beforeEach(() => {
  storeDocs = new Map();
  productDocs = new Map();
  legacyMatches = [];
  lastQuery = undefined;

  firestore.doc.mockImplementation((_db: unknown, collectionName: string, id: string) => ({
    __doc: { collectionName, id },
  }));
  firestore.collection.mockImplementation((_db: unknown, name: string) => ({ __collection: name }));
  firestore.where.mockImplementation((field: string, op: string, value: unknown) => ({
    kind: "where",
    field,
    op,
    value,
  }));
  firestore.limit.mockImplementation((value: number) => ({ kind: "limit", value }));
  firestore.query.mockImplementation(
    (base: { __collection: string }, ...constraints: unknown[]) => {
      lastQuery = {
        collection: base.__collection,
        constraints: constraints as Array<Record<string, unknown>>,
      };
      return { __query: base.__collection, constraints };
    },
  );

  firestore.getDoc.mockImplementation(
    async (ref: { __doc: { collectionName: string; id: string } }) => {
      const { collectionName, id } = ref.__doc;
      if (collectionName === "stores") {
        const data = storeDocs.get(id);
        return data ? productDoc(id, data) : missingDoc(id);
      }
      const data = productDocs.get(id);
      return data ? productDoc(id, data) : missingDoc(id);
    },
  );

  firestore.getDocs.mockImplementation(async () => ({
    empty: legacyMatches.length === 0,
    docs: legacyMatches.map((data, index) => productDoc(`legacy_${index}`, data)),
  }));
});

const burgerDoc = {
  name: "Classic Burger",
  price: 199,
  inStock: true,
  restId: "rest_1",
  categoryId: "cat_burgers",
  customizations: [
    {
      id: "grp_bun",
      name: "Choose a bun",
      minSelections: 1,
      maxSelections: 1,
      options: [{ id: "opt_brioche", name: "Brioche", price: 0 }],
    },
  ],
  ingredients: ["potato"],
};

describe("getProduct(id, storeId) — store binding", () => {
  it("returns details (with real customization groups) for a doc owned by the store's restId", async () => {
    storeDocs.set("store_1", { petpoojaRestId: "rest_1" });
    productDocs.set("prod_burger", burgerDoc);

    const result = await menuService.getProduct("prod_burger", "store_1");

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data?.id).toBe("prod_burger");
    expect(result.data?.customizations).toHaveLength(1);
    expect(result.data?.customizations?.[0].options[0].priceDelta).toBe(0);
    expect(result.data?.ingredients).toEqual(["potato"]);
  });

  it("refuses a direct doc owned by a different outlet instead of claiming its inventory", async () => {
    storeDocs.set("store_1", { petpoojaRestId: "rest_1" });
    productDocs.set("prod_burger", { ...burgerDoc, restId: "rest_OTHER" });

    const result = await menuService.getProduct("prod_burger", "store_1");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBeNull();
  });

  it("treats a doc without an owner field as unverifiable, not as this store's product", async () => {
    storeDocs.set("store_1", { petpoojaRestId: "rest_1" });
    productDocs.set("prod_burger", { name: "Legacy", price: 99, inStock: true });

    const result = await menuService.getProduct("prod_burger", "store_1");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBeNull();
  });

  it("fails closed when the store has no verified restId (never reads a raw store scope)", async () => {
    storeDocs.set("store_unlinked", { name: "Unlinked outlet" });
    productDocs.set("prod_burger", burgerDoc);

    const result = await menuService.getProduct("prod_burger", "store_unlinked");

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("PRODUCT_SCOPE_UNRESOLVED");
    // No product read happened at all.
    expect(firestore.getDoc).not.toHaveBeenCalledWith(
      expect.objectContaining({ __doc: { collectionName: "products", id: "prod_burger" } }),
    );
  });

  it("scopes the legacy petpoojaItemId join to the store's restId", async () => {
    storeDocs.set("store_1", { petpoojaRestId: "rest_1" });
    productDocs.clear(); // direct doc id misses
    legacyMatches = [];

    const result = await menuService.getProduct("9001", "store_1");

    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBeNull();
    expect(lastQuery?.collection).toBe("products");
    expect(lastQuery?.constraints).toEqual(
      expect.arrayContaining([
        { kind: "where", field: "petpoojaItemId", op: "==", value: "9001" },
        { kind: "where", field: "restId", op: "==", value: "rest_1" },
        // Two rows are fetched so ambiguity is detectable; never limit(1).
        { kind: "limit", value: 2 },
      ]),
    );
  });

  it("refuses an ambiguous legacy item reference instead of picking an outlet's copy", async () => {
    storeDocs.set("store_1", { petpoojaRestId: "rest_1" });
    legacyMatches = [
      { ...burgerDoc, name: "Burger A" },
      { ...burgerDoc, name: "Burger B" },
    ];

    const result = await menuService.getProduct("9001", "store_1");

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("PRODUCT_AMBIGUOUS");
  });

  it("returns the single unambiguous legacy match", async () => {
    storeDocs.set("store_1", { petpoojaRestId: "rest_1" });
    legacyMatches = [{ ...burgerDoc, name: "Only Burger" }];

    const result = await menuService.getProduct("9001", "store_1");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data?.id).toBe("legacy_0");
      expect(result.data?.name).toBe("Only Burger");
    }
  });

  it("fails closed when the product read itself fails", async () => {
    storeDocs.set("store_1", { petpoojaRestId: "rest_1" });
    productDocs.set("prod_burger", burgerDoc);
    firestore.getDoc.mockImplementation(async (ref: { __doc: { collectionName: string } }) => {
      if (ref.__doc.collectionName === "stores")
        return productDoc("store_1", { petpoojaRestId: "rest_1" });
      throw new Error("permission-denied");
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await menuService.getProduct("prod_burger", "store_1");

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("MENU_FETCH_FAILED");
    error.mockRestore();
  });
});

describe("getProduct(id) — unscoped legacy path is preserved", () => {
  it("reads the exact doc without requiring or touching a store mapping", async () => {
    productDocs.set("prod_burger", { ...burgerDoc, restId: undefined });

    const result = await menuService.getProduct("prod_burger");

    expect(result.success).toBe(true);
    if (result.success) expect(result.data?.id).toBe("prod_burger");
    expect(
      firestore.getDoc.mock.calls.some(
        (call) =>
          (call[0] as { __doc?: { collectionName?: string } }).__doc?.collectionName === "stores",
      ),
    ).toBe(false);
  });

  it("uses the unscoped item-id join (limit 1, no restId constraint) for legacy link ids", async () => {
    productDocs.clear();
    legacyMatches = [{ name: "Shared SKU", price: 50, inStock: true }];

    const result = await menuService.getProduct("9001");

    expect(result.success).toBe(true);
    expect(lastQuery?.constraints).toEqual([
      { kind: "where", field: "petpoojaItemId", op: "==", value: "9001" },
      { kind: "limit", value: 1 },
    ]);
  });
});

describe("unscoped catalog reads", () => {
  it("does not query the global products collection when no store is selected", async () => {
    const result = await menuService.listProducts(undefined, undefined, 1, 20);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items).toEqual([]);
      expect(result.data.total).toBe(0);
    }
    expect(firestore.getDocs).not.toHaveBeenCalled();
  });
});

const tick = async () => {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe("real-time menu snapshots", () => {
  it("refuses to stream the global products collection when no store scope exists", async () => {
    const callback = vi.fn();
    const unsubscribe = menuService.subscribeStoreProducts(undefined, callback);
    await tick();

    expect(firestore.onSnapshot).not.toHaveBeenCalled();
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: "MENU_SCOPE_UNRESOLVED" }),
      }),
    );
    unsubscribe();
  });

  it("streams a restId-scoped query and reports only explicit removals", async () => {
    storeDocs.set("store_9", { petpoojaRestId: "rest_9" });
    let deliver: ((snapshot: unknown) => void) | undefined;
    firestore.onSnapshot.mockImplementation(
      (_query: unknown, onNext: (snapshot: unknown) => void) => {
        deliver = onNext;
        return () => {};
      },
    );

    const callback = vi.fn();
    const unsubscribe = menuService.subscribeStoreProducts("store_9", callback);
    await tick();

    expect(firestore.onSnapshot).toHaveBeenCalledTimes(1);
    const queryArg = firestore.onSnapshot.mock.calls[0][0] as {
      constraints: unknown[];
    };
    expect(queryArg.constraints).toEqual([
      { kind: "where", field: "restId", op: "==", value: "rest_9" },
    ]);

    const docs = [
      productDoc("p1", { name: "A", price: 1, inStock: true, restId: "rest_9", categoryId: "c" }),
    ];
    deliver!({
      forEach: (visit: (doc: unknown) => void) => docs.forEach(visit),
      docChanges: () => [
        { type: "removed", doc: { id: "gone" } },
        { type: "modified", doc: { id: "p1" } },
      ],
    });

    const payload = callback.mock.calls.at(-1)![0];
    expect(payload.success).toBe(true);
    expect(payload.data.products.map((product: { id: string }) => product.id)).toEqual(["p1"]);
    // A modified doc is not a removal — only shortfeed evidence may delete.
    expect(payload.data.removedIds).toEqual(["gone"]);
    unsubscribe();
  });
});
