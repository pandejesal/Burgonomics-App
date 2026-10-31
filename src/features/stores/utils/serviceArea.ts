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
 * Hard ceiling (km) for the Dine-In & Takeaway pickup geofence (MT-05).
 * Delivery has its own per-store radius (`deliveryRadiusKm`); pickup modes
 * are capped app-wide at this distance so food is never collected from a
 * branch an hour away.
 */
export const MAX_PICKUP_DISTANCE_KM = 25;

/** User-facing message shown when a branch is beyond the pickup geofence. */
export const PICKUP_TOO_FAR_MESSAGE =
  "Takeaway and Dine-In are restricted to nearby branches (< 25 km).";

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

/** Structural minimum a store must expose to be judged visible. */
export interface StoreVisibilityCandidate {
  lat: number;
  lng: number;
  deliveryRadiusKm?: number | null;
}

export type StoreVisibilityFulfillment = "delivery" | "takeaway" | "dinein" | null | undefined;

/**
 * A position is usable only when it is finite AND inside the coordinate domain.
 * `lat: 360` is finite but impossible, and haversine is periodic, so an
 * out-of-range pair can compute a near-zero distance and look adjacent — an
 * invalid position must fail closed, never be treated as "next door".
 */
export function hasUsableCoords(
  coords: { lat: number; lng: number } | null | undefined,
): coords is { lat: number; lng: number } {
  if (!coords) return false;
  if (typeof coords.lat !== "number" || typeof coords.lng !== "number") return false;
  if (!Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) return false;
  return coords.lat >= -90 && coords.lat <= 90 && coords.lng >= -180 && coords.lng <= 180;
}

/**
 * The ONE radius policy for "which outlets may the customer see for this
 * fulfillment mode", shared by every list on the store-selection screen (all
 * stores, nearby, recently viewed, search results and the nearest-store
 * candidate) so they can never disagree.
 *
 * Policy — the same numbers the guards already enforce:
 *   - DELIVERY (and any unknown mode: the strict default) ->
 *     `store.deliveryRadiusKm ?? DEFAULT_DELIVERY_RADIUS_KM`, exactly as
 *     {@link isStoreInDeliveryArea} computes it. The 7 km fallback stays
 *     logic-only; callers must never present it as a fact.
 *   - TAKEAWAY / DINE-IN -> the app-wide {@link MAX_PICKUP_DISTANCE_KM} ceiling.
 *
 * Fails CLOSED, unlike {@link isStoreInDeliveryArea}: with no usable customer
 * position (or a store without a usable in-range position) nothing is visible,
 * because an unknown position cannot prove reachability. The legacy guard keeps its
 * fail-open semantics for its existing consumers (selection, checkout).
 *
 * Distances are always recomputed from the supplied coordinates; a stale
 * `distanceKm` carried on a row is never consulted.
 */
export function selectVisibleStores<T extends StoreVisibilityCandidate>(
  stores: readonly T[],
  coords: { lat: number; lng: number } | null | undefined,
  fulfillment: StoreVisibilityFulfillment,
): T[] {
  if (!hasUsableCoords(coords)) return [];
  const userLat = coords.lat;
  const userLng = coords.lng;
  return stores.filter((store) => {
    // A store whose own position is unknown or impossible cannot be proven
    // reachable — the same domain rule applies to the customer's position.
    if (!hasUsableCoords({ lat: store.lat, lng: store.lng })) return false;
    if (fulfillment === "takeaway" || fulfillment === "dinein") {
      return getDeliveryDistanceKm(store, userLat, userLng) <= MAX_PICKUP_DISTANCE_KM;
    }
    return isStoreInDeliveryArea(store, userLat, userLng);
  });
}
