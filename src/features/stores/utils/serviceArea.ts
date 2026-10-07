/**
 * Delivery area utilities.
 *
 * Pure functions only — no React, no Firebase, no storage — so they stay
 * unit-testable and safe to call from routes, hooks and Zustand reducers.
 */
import { haversineKm } from "./distance";

/** Fallback radius when a store carries no `deliveryRadiusKm` (matches storesService). */
export const DEFAULT_DELIVERY_RADIUS_KM = 7;

/** User-facing message shown when a store sits outside the active delivery radius. */
export const OUT_OF_AREA_MESSAGE =
  "This store is outside your delivery area — switch to Takeaway or pick a nearer store.";

/**
 * Straight-line kilometres between a store and the user.
 * Returns `Infinity` when either side has no usable coordinates, so callers
 * can tell "unknown position" apart from "very far away".
 */
export function getDeliveryDistanceKm(
  store: { lat: number; lng: number },
  userLat: number,
  userLng: number,
): number {
  return haversineKm({ lat: userLat, lng: userLng }, { lat: store.lat, lng: store.lng });
}

/**
 * Checks whether a store can deliver to the user's coordinates.
 *
 * Radius precedence: explicit `radiusKm` argument → `store.deliveryRadiusKm`
 * → {@link DEFAULT_DELIVERY_RADIUS_KM} (7 km). The fallback is **logic-only**:
 * it may gate geofence/PAY verdicts but must never be displayed as a fact.
 * `null` (doc omitted the field) is treated exactly like "absent".
 *
 * Fails OPEN: when the position (or the store coords) is unknown/invalid the
 * store counts as in-area, so a missing location never locks the user out.
 *
 * @param store - The store to check
 * @param userLat - User's latitude
 * @param userLng - User's longitude
 * @param radiusKm - Optional override for the store's delivery radius
 * @returns true if the store may deliver to the user's location
 */
export function isStoreInDeliveryArea(
  store: { lat: number; lng: number; deliveryRadiusKm?: number | null },
  userLat: number,
  userLng: number,
  radiusKm?: number,
): boolean {
  const radius = radiusKm ?? store.deliveryRadiusKm ?? DEFAULT_DELIVERY_RADIUS_KM;
  const distanceKm = getDeliveryDistanceKm(store, userLat, userLng);
  if (!Number.isFinite(distanceKm)) return true;
  return distanceKm <= radius;
}
