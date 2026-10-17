/**
 * Store domain model. Repositories map wire DTOs to this shape; UI
 * code consumes this model exclusively.
 */
export interface StoreHours {
  open: string; // "HH:mm"
  close: string; // "HH:mm"
}

export interface StoreSupport {
  delivery: boolean;
  takeaway: boolean;
  dineIn: boolean;
}

/**
 * Order fulfillment method. Owned by the Stores feature — a
 * fulfillment method is only meaningful in the context of a store's
 * `supports` capability set. Re-exported from `cart/models` so
 * existing cart imports continue to work.
 */
export type Fulfillment = "delivery" | "takeaway" | "dinein";

export interface Store {
  id: string;
  name: string;
  address: string;
  /** City from the store doc — `""` when absent (search-filter safe, never a default city). */
  city: string;
  /** Area/locality from the store doc — `""` when absent; UI hides empty areas. */
  area: string;
  lat: number;
  lng: number;
  phone: string;
  imageUrl: string | null;
  /**
   * Operating hours from the store doc. `null` when the doc carries no
   * (or malformed) hours — no default schedule is ever invented, so
   * readers must null-guard and fall back to "hours unavailable".
   */
  hours: StoreHours | null;
  /**
   * Open-state as the store doc states it. `undefined` when the doc carries
   * neither an `isOpen` boolean nor `status: "CLOSED"` — unknown is modelled
   * explicitly so no reader can present it as "open" (or "closed") without
   * saying so. Readers must tri-state, e.g. `isOpen === true ? … : isOpen ===
   * false ? … : "Hours unavailable"`.
   */
  isOpen: boolean | undefined;
  isBusy: boolean;
  isRecentlyOpened: boolean;
  supports: StoreSupport;
  /**
   * Estimated delivery time in minutes, straight from the store doc
   * (`etaMinutes` / `minPrepMinutes`). `null` when absent — never a
   * fabricated number; readers must omit the claim instead.
   */
  etaMinutes: number | null;
  /** Estimated preparation / pickup time in minutes (for takeaway & dine-in). `null` when the doc omits it. */
  pickupEtaMinutes?: number | null;
  /**
   * Delivery fee placeholder in INR. Repository-driven — real value
   * arrives from PETPOOJA / pricing engine at checkout.
   */
  deliveryFee?: number;
  /** Distance from the user in km. Populated by repository when coords are provided. */
  distanceKm?: number;
  /** Petpooja Restaurant ID, nullable for now. */
  petpoojaRestId?: string | null;
  /**
   * Linked Partner `branches/*` doc id, set by ops when the outlet is
   * matched on both sides (Firestore `stores/{id}.partnerBranchId`).
   * Written onto order docs as top-level `branchId` so Partner scoping and
   * server KOT restID resolution work. Null until linked.
   */
  partnerBranchId?: string | null;
  /**
   * Delivery radius in km, only when the store doc actually provides it.
   * `null`/absent means "unknown" — runtime logic may fall back to
   * `DEFAULT_DELIVERY_RADIUS_KM`, but UI must never display the fallback
   * as a fact.
   */
  deliveryRadiusKm?: number | null;
  /** Store-specific pricing configuration overrides */
  pricing?: {
    gstRate?: number;
    packingChargePerItem?: number;
    deliveryFeeFlat?: number;
    freeDeliveryThreshold?: number;
    minOrderAmount?: number;
  } | null;
}

/**
 * Legacy alias kept for cross-feature imports written before the full
 * store model existed. New code should reference `Store` directly.
 */
export type StoreLocation = Store;
