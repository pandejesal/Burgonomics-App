import { describe, it, expect } from "vitest";
import {
  DEFAULT_DELIVERY_RADIUS_KM,
  MAX_PICKUP_DISTANCE_KM,
  OUT_OF_AREA_MESSAGE,
  PICKUP_TOO_FAR_MESSAGE,
  getDeliveryDistanceKm,
  isStoreInDeliveryArea,
} from "../src/features/stores/utils/serviceArea";

/**
 * SCR-004 delivery area guard — pure haversine checks for the
 * "I am in Ahmedabad, why can I order from Vadodara/Ayodhya?" bug.
 */
describe("serviceArea", () => {
  const user = { lat: 23.0225, lng: 72.5714 }; // Ahmedabad
  const vadodara = { lat: 22.3072, lng: 73.1812 };
  const ayodhya = { lat: 26.7922, lng: 82.1998 };

  it("keeps the store-service default radius of 7 km", () => {
    expect(DEFAULT_DELIVERY_RADIUS_KM).toBe(7);
  });

  it("accepts a store next to the user", () => {
    const local = { lat: 23.03, lng: 72.56, deliveryRadiusKm: 7 };
    expect(isStoreInDeliveryArea(local, user.lat, user.lng)).toBe(true);
  });

  it("rejects far-away cities for delivery (Vadodara, Ayodhya)", () => {
    expect(isStoreInDeliveryArea(vadodara, user.lat, user.lng)).toBe(false);
    expect(isStoreInDeliveryArea(ayodhya, user.lat, user.lng)).toBe(false);
  });

  it("honours the store's own deliveryRadiusKm", () => {
    const wideStore = { ...vadodara, deliveryRadiusKm: 150 };
    expect(isStoreInDeliveryArea(wideStore, user.lat, user.lng)).toBe(true);

    const tinyStore = { ...vadodara, deliveryRadiusKm: 50 };
    expect(isStoreInDeliveryArea(tinyStore, user.lat, user.lng)).toBe(false);
  });

  it("lets an explicit radiusKm argument override the store radius", () => {
    const wideStore = { ...vadodara, deliveryRadiusKm: 50 };
    expect(isStoreInDeliveryArea(wideStore, user.lat, user.lng, 150)).toBe(true);
    expect(isStoreInDeliveryArea(vadodara, user.lat, user.lng, 150)).toBe(true);
  });

  it("draws the default boundary at 7 km", () => {
    // ~6.5 km due east of the user (same latitude) — inside the 7 km zone.
    const inside = { lat: 23.0225, lng: 72.6348 };
    // ~7.4 km due east — outside the default zone, inside an 8 km override.
    const outside = { lat: 23.0225, lng: 72.6434 };

    expect(getDeliveryDistanceKm(inside, user.lat, user.lng)).toBeGreaterThan(6);
    expect(getDeliveryDistanceKm(inside, user.lat, user.lng)).toBeLessThan(7);
    expect(isStoreInDeliveryArea(inside, user.lat, user.lng)).toBe(true);

    expect(getDeliveryDistanceKm(outside, user.lat, user.lng)).toBeGreaterThan(7);
    expect(isStoreInDeliveryArea(outside, user.lat, user.lng)).toBe(false);
    expect(isStoreInDeliveryArea(outside, user.lat, user.lng, 8)).toBe(true);
  });

  it("fails open when the position is unknown — never lock the user out", () => {
    expect(isStoreInDeliveryArea(vadodara, Number.NaN, Number.NaN)).toBe(true);
    expect(isStoreInDeliveryArea({ lat: Number.NaN, lng: Number.NaN }, user.lat, user.lng)).toBe(
      true,
    );
  });

  it("reports unusable distances as Infinity instead of NaN", () => {
    expect(getDeliveryDistanceKm(vadodara, Number.NaN, user.lng)).toBe(Infinity);
    expect(Number.isNaN(getDeliveryDistanceKm(vadodara, Number.NaN, user.lng))).toBe(false);
  });

  it("exposes the user-facing out-of-area message with the Takeaway escape hatch", () => {
    expect(OUT_OF_AREA_MESSAGE).toContain("outside your delivery area");
    expect(OUT_OF_AREA_MESSAGE).toContain("Takeaway");
  });
});

/**
 * MT-05 pickup geofence — Takeaway & Dine-In mean the customer travels to
 * the branch, so both are capped app-wide at MAX_PICKUP_DISTANCE_KM (the
 * same rule StoreCard, FulfillmentSheet and the stores route enforce).
 */
describe("pickup geofence (MT-05)", () => {
  it("caps Takeaway & Dine-In at 25 km", () => {
    expect(MAX_PICKUP_DISTANCE_KM).toBe(25);
  });

  it("exposes the too-far message bound to the same 25 km constant", () => {
    expect(PICKUP_TOO_FAR_MESSAGE).toContain("Takeaway and Dine-In");
    expect(PICKUP_TOO_FAR_MESSAGE).toContain(`< ${MAX_PICKUP_DISTANCE_KM} km`);
  });
});
