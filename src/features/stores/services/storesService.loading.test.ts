import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Directory-read honesty: a Firestore failure is NOT an empty catalogue.
 *
 * Before this lane, `fetchFirestoreStores` swallowed every read error and the
 * public methods wrapped the result in `ok([])`, so the store-selection screen
 * rendered "no stores" as a fact and only a manual Retry could recover. These
 * tests pin the contract: failure => ApiResult failure, genuinely-empty
 * directory => ok([]), and the two never collapse into each other.
 */

const firestoreMock = vi.hoisted(() => ({ getDocs: vi.fn() }));

vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, name: string) => ({ name }),
  query: (ref: unknown) => ref,
  limit: (n: number) => n,
  doc: (_db: unknown, name: string, id: string) => ({ name, id }),
  getDoc: vi.fn(),
  getDocs: firestoreMock.getDocs,
}));

vi.mock("@/core/config/firebase", () => ({ db: {} }));

import { storesService } from "./storesService";

const getDocs = firestoreMock.getDocs;

/** Firestore snapshot double: `empty` + `forEach`, nothing else is used. */
const snap = (docs: Array<Record<string, unknown>>) => ({
  empty: docs.length === 0,
  forEach: (fn: (doc: { id: string; data: () => Record<string, unknown> }) => void) => {
    docs.forEach((data, index) => fn({ id: `store_${index}`, data: () => data }));
  },
});

const ORIGIN = { lat: 0, lng: 0 };
const atKm = (km: number) => ({ lat: km / 111.19, lng: 0 });

beforeEach(() => {
  getDocs.mockReset();
});

describe("storesService.list ? failure is a failure", () => {
  it("returns a retryable failure instead of ok([]) when the read rejects", async () => {
    getDocs.mockRejectedValueOnce(new Error("permission-denied"));

    const res = await storesService.list();

    expect(res.success).toBe(false);
    if (res.success) throw new Error("unreachable");
    expect(res.error.code).toBe("STORES_UNAVAILABLE");
    expect(res.error.retryable).toBe(true);
  });

  it("does not leak the raw provider message into customer-visible copy", async () => {
    getDocs.mockRejectedValueOnce(new Error("projects/secret-project/databases/(default)"));

    const res = await storesService.list();

    expect(res.success).toBe(false);
    if (res.success) throw new Error("unreachable");
    expect(res.error.message).not.toMatch(/secret-project/);
  });
});

describe("storesService.list ? a genuinely empty directory stays ok([])", () => {
  it("returns success with no rows when both collections are empty", async () => {
    getDocs.mockResolvedValueOnce(snap([])).mockResolvedValueOnce(snap([]));

    const res = await storesService.list();

    expect(res.success).toBe(true);
    if (!res.success) throw new Error("unreachable");
    expect(res.data).toEqual([]);
  });

  it("falls back to admin_stores only when the stores collection is empty", async () => {
    getDocs
      .mockResolvedValueOnce(snap([]))
      .mockResolvedValueOnce(snap([{ name: "Admin outlet", ...atKm(1) }]));

    const res = await storesService.list(ORIGIN);

    expect(res.success).toBe(true);
    if (!res.success) throw new Error("unreachable");
    expect(res.data.map((s) => s.name)).toEqual(["Admin outlet"]);
    expect(getDocs).toHaveBeenCalledTimes(2);
  });

  it("does not fall back to admin_stores when the stores read itself failed", async () => {
    getDocs.mockRejectedValueOnce(new Error("unavailable"));

    const res = await storesService.list();

    expect(res.success).toBe(false);
    expect(getDocs).toHaveBeenCalledTimes(1);
  });

  it("still drops docs without finite coordinates rather than inventing a position", async () => {
    getDocs
      .mockResolvedValueOnce(snap([{ name: "No coords" }, { name: "Real", ...atKm(2) }]))
      .mockResolvedValueOnce(snap([]));

    const res = await storesService.list(ORIGIN);

    expect(res.success).toBe(true);
    if (!res.success) throw new Error("unreachable");
    expect(res.data.map((s) => s.name)).toEqual(["Real"]);
    expect(res.data[0].distanceKm).toBeDefined();
  });
});

describe("storesService.nearby / search ? same failure contract", () => {
  it("nearby() fails instead of returning an empty ranked list", async () => {
    getDocs.mockRejectedValueOnce(new Error("deadline-exceeded"));

    const res = await storesService.nearby(ORIGIN.lat, ORIGIN.lng);

    expect(res.success).toBe(false);
  });

  it("search() fails instead of returning no matches", async () => {
    getDocs.mockRejectedValueOnce(new Error("deadline-exceeded"));

    const res = await storesService.search("pizza", ORIGIN);

    expect(res.success).toBe(false);
  });

  it("search() keeps a real no-match as success with zero rows", async () => {
    getDocs
      .mockResolvedValueOnce(snap([{ name: "Real outlet", ...atKm(2) }]))
      .mockResolvedValueOnce(snap([]));

    const res = await storesService.search("does-not-exist", ORIGIN);

    expect(res.success).toBe(true);
    if (!res.success) throw new Error("unreachable");
    expect(res.data).toEqual([]);
  });
});
