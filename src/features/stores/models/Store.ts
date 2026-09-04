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
  city: string;
  area: string;
  lat: number;
  lng: number;
  phone: string;
  imageUrl: string | null;
  hours: StoreHours;
  isOpen: boolean;
  isBusy: boolean;
  isRecentlyOpened: boolean;
  supports: StoreSupport;
  /** Estimated delivery time in minutes. */
  etaMinutes: number;
  /** Estimated preparation / pickup time in minutes (for takeaway & dine-in). */
  pickupEtaMinutes?: number;
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
  /** Delivery radius in km. */
  deliveryRadiusKm?: number;
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
