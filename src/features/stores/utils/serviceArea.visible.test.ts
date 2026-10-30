import { describe, expect, it } from "vitest";
import {
  DEFAULT_DELIVERY_RADIUS_KM,
  MAX_PICKUP_DISTANCE_KM,
  hasUsableCoords,
  selectVisibleStores,
} from "./serviceArea";

/**
 * Synthetic geometry only. 1 degree of latitude is ~111.19 km, so a 0.009
 * degree offset is ~1 km from the origin. No real coordinates, no real
 * addresses: these tests only pin the radius policy.
 */
const ORIGIN = { lat: 0, lng: 0 };
const atKm = (km: number) => ({ lat: km / 111.19, lng: 0 });
const outlet = (id: string, km: number, extra: Record<string, unknown> = {}) => ({
  id,
  ...atKm(km),
  ...extra,
});

describe("hasUsableCoords", () => {
  it("rejects absent, null and non-finite pairs", () => {
    expect(hasUsableCoords(null)).toBe(false);
    expect(hasUsableCoords(undefined)).toBe(false);
    expect(hasUsableCoords({ lat: Number.NaN, lng: 0 })).toBe(false);
    expect(hasUsableCoords({ lat: 0, lng: Number.POSITIVE_INFINITY })).toBe(false);
  });

  it("accepts a finite pair, including the origin", () => {
    expect(hasUsableCoords({ lat: 0, lng: 0 })).toBe(true);
  });

  it.each([
    { lat: 360, lng: 0 },
    { lat: -91, lng: 0 },
    { lat: 0, lng: 200 },
    { lat: 0, lng: -181 },
  ])("rejects the finite but impossible pair %o", (coords) => {
    expect(hasUsableCoords(coords as any)).toBe(false);
    // A finite-yet-impossible position must never make the directory visible.
    expect(selectVisibleStores([outlet("close", 0.5)], coords as any, "delivery")).toEqual([]);
  });

  it("still accepts the exact coordinate bounds", () => {
    expect(hasUsableCoords({ lat: 90, lng: 180 })).toBe(true);
    expect(hasUsableCoords({ lat: -90, lng: -180 })).toBe(true);
  });
});

describe("selectVisibleStores fails closed without a position", () => {
  it.each([null, undefined, { lat: Number.NaN, lng: 0 }])(
    "returns nothing for %s, even when stores are close by",
    (coords) => {
      expect(selectVisibleStores([outlet("near", 1)], coords as any, "delivery")).toEqual([]);
    },
  );

  it("excludes a store whose own coordinates are not finite", () => {
    const broken = { id: "broken", lat: Number.NaN, lng: 0 };
    expect(selectVisibleStores([broken], ORIGIN, "delivery")).toEqual([]);
  });

  it("excludes a store whose own coordinates are out of range", () => {
    expect(selectVisibleStores([{ id: "bad-lat", lat: 360, lng: 0 }], ORIGIN, "delivery")).toEqual(
      [],
    );
    expect(selectVisibleStores([{ id: "bad-lng", lat: 0, lng: 200 }], ORIGIN, "delivery")).toEqual(
      [],
    );
  });
});

describe("selectVisibleStores ? DELIVERY radius", () => {
  it("keeps a store inside its own configured radius and drops the one outside", () => {
    const stores = [outlet("inside", 1, { deliveryRadiusKm: 3 }), outlet("outside", 5, { deliveryRadiusKm: 3 })];

    expect(selectVisibleStores(stores, ORIGIN, "delivery").map((s) => s.id)).toEqual(["inside"]);
  });

  it("falls back to the logic-only default radius when the doc has none", () => {
    const stores = [outlet("inside-default", 4), outlet("outside-default", 9)];

    expect(selectVisibleStores(stores, ORIGIN, "delivery").map((s) => s.id)).toEqual([
      "inside-default",
    ]);
    expect(DEFAULT_DELIVERY_RADIUS_KM).toBeLessThan(9);
  });

  it("treats a null radius exactly like an absent one", () => {
    expect(
      selectVisibleStores([outlet("null-radius", 4, { deliveryRadiusKm: null })], ORIGIN, "delivery").map(
        (s) => s.id,
      ),
    ).toEqual(["null-radius"]);
  });

  it("applies the delivery radius, never the pickup ceiling", () => {
    const stores = [outlet("pickup-only", 20)];

    expect(selectVisibleStores(stores, ORIGIN, "delivery")).toEqual([]);
  });

  it("never trusts a stale distanceKm carried on the row", () => {
    const stale = outlet("stale", 50, { distanceKm: 0.2 });

    expect(selectVisibleStores([stale], ORIGIN, "delivery")).toEqual([]);
  });

  it("treats unknown fulfillment as delivery (the strict default)", () => {
    const stores = [outlet("close", 4), outlet("far", 20)];

    expect(selectVisibleStores(stores, ORIGIN, null).map((s) => s.id)).toEqual(["close"]);
    expect(selectVisibleStores(stores, ORIGIN, undefined).map((s) => s.id)).toEqual(["close"]);
  });
});

describe("selectVisibleStores ? PICKUP ceiling", () => {
  it.each(["takeaway", "dinein"] as const)("%s keeps stores inside the pickup ceiling", (mode) => {
    const stores = [outlet("inside", 20), outlet("outside", 30)];

    expect(selectVisibleStores(stores, ORIGIN, mode).map((s) => s.id)).toEqual(["inside"]);
    expect(MAX_PICKUP_DISTANCE_KM).toBe(25);
  });

  it("preserves the incoming order so callers keep their own ranking", () => {
    const stores = [outlet("c", 2), outlet("a", 1), outlet("b", 3)];

    expect(selectVisibleStores(stores, ORIGIN, "delivery").map((s) => s.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });
});
