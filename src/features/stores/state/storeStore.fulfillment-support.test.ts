import { describe, expect, it } from "vitest";
import type { Fulfillment, Store } from "@/features/stores/models/Store";
import { storeSupportsFulfillment } from "./storeStore";

const baseStore: Store = {
  id: "str_canonical",
  name: "Vesu Outlet",
  address: "1 Main Road",
  city: "Surat",
  area: "Vesu",
  lat: 21.15,
  lng: 72.77,
  phone: "+919876543210",
  imageUrl: null,
  hours: null,
  isOpen: true,
  isBusy: false,
  isRecentlyOpened: false,
  supports: { delivery: true, takeaway: true, dineIn: true },
  etaMinutes: 25,
  pickupEtaMinutes: 15,
  pricing: null,
};

function withSupports(
  delivery: boolean,
  takeaway: boolean,
  dineIn: boolean,
): Store {
  return { ...baseStore, supports: { delivery, takeaway, dineIn } };
}

describe("storeSupportsFulfillment — canonical boolean contract", () => {
  it("supports each normal typed store's granted modes only", () => {
    const deliveryOnly = withSupports(true, false, false);
    const takeawayOnly = withSupports(false, true, false);
    const dineInOnly = withSupports(false, false, true);

    expect(storeSupportsFulfillment(deliveryOnly, "delivery")).toBe(true);
    expect(storeSupportsFulfillment(deliveryOnly, "takeaway")).toBe(false);
    expect(storeSupportsFulfillment(deliveryOnly, "dinein")).toBe(false);

    expect(storeSupportsFulfillment(takeawayOnly, "delivery")).toBe(false);
    expect(storeSupportsFulfillment(takeawayOnly, "takeaway")).toBe(true);
    expect(storeSupportsFulfillment(takeawayOnly, "dinein")).toBe(false);

    expect(storeSupportsFulfillment(dineInOnly, "delivery")).toBe(false);
    expect(storeSupportsFulfillment(dineInOnly, "takeaway")).toBe(false);
    expect(storeSupportsFulfillment(dineInOnly, "dinein")).toBe(true);
  });

  it("returns false for a missing store or a missing/unknown mode", () => {
    expect(storeSupportsFulfillment(null, "delivery")).toBe(false);
    expect(storeSupportsFulfillment(undefined, "takeaway")).toBe(false);
    expect(storeSupportsFulfillment(baseStore, null)).toBe(false);
    expect(storeSupportsFulfillment(baseStore, undefined)).toBe(false);
    expect(
      storeSupportsFulfillment(baseStore, "curbside" as unknown as Fulfillment),
    ).toBe(false);
  });
});

describe("storeSupportsFulfillment — legacy/malformed persisted capability sets fail closed", () => {
  // Persisted `activeStore` values can predate `supports` (zustand migrate keeps
  // the object as-is). The helper must deny, never throw, and never invent a
  // delivery grant from a malformed shape.
  const legacyWithoutSupports = {
    id: "str_legacy",
    name: "Legacy Outlet",
    address: "",
    city: "",
    area: "",
    lat: 21.15,
    lng: 72.77,
    phone: "",
    imageUrl: null,
    hours: null,
    isOpen: true,
    isBusy: false,
    isRecentlyOpened: false,
    etaMinutes: null,
    pricing: null,
  } as unknown as Store;

  it("does not throw when a cached store has no supports field", () => {
    expect(() =>
      storeSupportsFulfillment(legacyWithoutSupports, "delivery"),
    ).not.toThrow();
    expect(storeSupportsFulfillment(legacyWithoutSupports, "delivery")).toBe(false);
    expect(storeSupportsFulfillment(legacyWithoutSupports, "takeaway")).toBe(false);
    expect(storeSupportsFulfillment(legacyWithoutSupports, "dinein")).toBe(false);
  });

  it("denies a null or non-object supports value", () => {
    const nullSupports = { ...baseStore, supports: null } as unknown as Store;
    expect(storeSupportsFulfillment(nullSupports, "delivery")).toBe(false);

    const stringSupports = { ...baseStore, supports: "yes" } as unknown as Store;
    expect(storeSupportsFulfillment(stringSupports, "delivery")).toBe(false);
  });

  it("denies partial or non-boolean flags instead of promoting them", () => {
    const empty = { ...baseStore, supports: {} } as unknown as Store;
    expect(storeSupportsFulfillment(empty, "delivery")).toBe(false);

    const partial = {
      ...baseStore,
      supports: { delivery: true },
    } as unknown as Store;
    expect(storeSupportsFulfillment(partial, "delivery")).toBe(true);
    expect(storeSupportsFulfillment(partial, "takeaway")).toBe(false);
    expect(storeSupportsFulfillment(partial, "dinein")).toBe(false);

    const truthyStrings = {
      ...baseStore,
      supports: { delivery: "yes", takeaway: 1, dineIn: "true" },
    } as unknown as Store;
    expect(storeSupportsFulfillment(truthyStrings, "delivery")).toBe(false);
    expect(storeSupportsFulfillment(truthyStrings, "takeaway")).toBe(false);
    expect(storeSupportsFulfillment(truthyStrings, "dinein")).toBe(false);
  });
});
