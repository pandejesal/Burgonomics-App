import { beforeEach, describe, expect, it, vi } from "vitest";

const firestore = vi.hoisted(() => ({
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  doc: vi.fn(),
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
}));
vi.mock("firebase/firestore", () => firestore);
vi.mock("@/core/config/firebase", () => ({ db: {} }));

import { invalidateMenuCache, menuService } from "./menuService";

let sequence = 0;
let storeId: string;
let restId: string;
let linked: boolean;
let rows: Array<{ id: string; data: Record<string, unknown> }>;

beforeEach(() => {
  vi.clearAllMocks();
  invalidateMenuCache();
  storeId = `home-store-${++sequence}`;
  restId = `home-rest-${sequence}`;
  linked = true;
  rows = [];
  firestore.doc.mockImplementation((_db, collection, id) => ({ collection, id }));
  firestore.collection.mockImplementation((_db, name) => ({ collection: name }));
  firestore.where.mockImplementation((field, op, value) => ({ field, op, value }));
  firestore.query.mockImplementation((base, ...constraints) => ({ ...base, constraints }));
  firestore.getDoc.mockImplementation(async () => ({
    exists: () => true,
    data: () => (linked ? { petpoojaRestId: restId } : { name: "Unlinked outlet" }),
  }));
  firestore.getDocs.mockImplementation(async (query) => {
    const owner = query.constraints.find(
      (constraint: { field: string }) => constraint.field === "restId",
    )?.value;
    const docs = rows
      .filter((row) => row.data.restId === owner)
      .map((row) => ({
        id: row.id,
        data: () => row.data,
      }));
    return { docs, forEach: (visit: (doc: (typeof docs)[number]) => void) => docs.forEach(visit) };
  });
});

describe("Home's full canonical catalog snapshot", () => {
  it("returns categories and normalized products from one verified store scope, including meals after page one", async () => {
    rows = Array.from({ length: 150 }, (_, index) => ({
      id: `burger-${index}`,
      data: {
        restId,
        categoryId: "burgers",
        categoryName: "Burgers",
        name: `Burger ${index}`,
        price: 200,
        inStock: true,
      },
    }));
    rows.push({
      id: "numeric-meal-812",
      data: {
        restId,
        categoryId: "meals",
        categoryName: "Burger Meals",
        name: "An actual meal",
        price: "327",
        inStock: true,
        isBestSeller: true,
      },
    });
    rows.push({
      id: "wrong-store",
      data: { restId: "other-rest", name: "Not this outlet", price: 1, inStock: true },
    });

    const result = await menuService.listHomeCatalog(storeId);

    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error.message);
    expect(result.data.products).toHaveLength(151);
    expect(result.data.products.at(-1)).toMatchObject({
      id: "numeric-meal-812",
      price: 327,
      inStock: true,
      badges: [expect.objectContaining({ id: "bestseller" })],
    });
    expect(result.data.categories).toEqual([
      expect.objectContaining({ id: "burgers", itemCount: 150 }),
      expect.objectContaining({ id: "meals", itemCount: 1 }),
    ]);
    expect(firestore.getDocs).toHaveBeenCalledTimes(1);
    expect(firestore.getDocs).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "products",
        constraints: [{ field: "restId", op: "==", value: restId }],
      }),
    );
    expect(firestore.limit).not.toHaveBeenCalled();
  });

  it("fails closed for an unlinked store instead of querying raw/global inventory", async () => {
    linked = false;
    const result = await menuService.listHomeCatalog(storeId);
    expect(result).toMatchObject({ success: false, error: { code: "MENU_SCOPE_UNRESOLVED" } });
    expect(firestore.getDocs).not.toHaveBeenCalled();
  });

  it("does not convert a failed menu read into a successful empty Home", async () => {
    firestore.getDocs.mockRejectedValueOnce(new Error("catalog read failed"));
    const result = await menuService.listHomeCatalog(storeId);
    expect(result).toMatchObject({ success: false, error: { code: "MENU_FETCH_FAILED" } });
  });

  it("keeps a genuinely empty linked catalog empty", async () => {
    const result = await menuService.listHomeCatalog(storeId);
    expect(result).toEqual({ success: true, data: { products: [], categories: [] } });
  });
});
