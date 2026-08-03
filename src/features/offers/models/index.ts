/**
 * Offers domain models — the frontend contract.
 *
 * Every field mirrors a PETPOOJA / backend response field so the mock
 * repository can be swapped for the real HTTP call without touching UI
 * or state. NO offer is ever authored in the frontend — all values here
 * originate from `GET /v1/offers` and friends.
 */
import type { Money } from "@/core/models";
import type { Fulfillment } from "@/features/stores/models/Store";

/**
 * Offer classification. Extend freely — the UI groups sections by
 * `type` and filters unknown values into "Other", so PETPOOJA can
 * introduce new categories without a frontend release.
 */
export type OfferType =
  | "coupon"
  | "automatic"
  | "combo"
  | "store"
  | "delivery"
  | "takeaway"
  | "dinein"
  | "first_order"
  | "festival"
  | "limited_time"
  | "customer_specific";

/**
 * Discount payload as computed by the backend. The frontend NEVER
 * calculates a discount amount — `value` and `savings` arrive from the
 * repository, and the cart simply displays them.
 */
export interface OfferDiscount {
  /** How the discount was calculated by the backend (informational only). */
  mode: "flat" | "percent" | "free_delivery" | "bundle" | "other";
  /** Human-readable summary provided by the backend (e.g. "20% off"). */
  label: string;
  /** Optional numeric value for display alongside the label. */
  value?: number;
  /** Optional cap on the discount, in INR. */
  maxDiscount?: Money;
}

export interface OfferEligibility {
  /** Minimum cart subtotal required for the offer to apply, in INR. */
  minOrderValue?: Money;
  /** Store IDs the offer applies to. `undefined` = all stores. */
  applicableStoreIds?: string[];
  /** Fulfillment methods the offer applies to. `undefined` = all methods. */
  applicableFulfillments?: Fulfillment[];
  /** Product / category IDs the offer applies to, if scoped. */
  applicableCategoryIds?: string[];
  applicableProductIds?: string[];
}

export type OfferStatus = "active" | "upcoming" | "expired" | "exhausted" | "ineligible";

export interface Offer {
  id: string;
  type: OfferType;
  title: string;
  description: string;
  /** Coupon code — present when type === "coupon" or the user must enter it. */
  code?: string;
  /** Whether the offer applies automatically without user action. */
  automatic: boolean;
  discount: OfferDiscount;
  eligibility: OfferEligibility;
  imageUrl?: string;
  /** ISO-8601 timestamp; omitted for evergreen offers. */
  expiresAt?: string;
  /** Repository-driven short summary lines (used in the terms sheet). */
  termsAndConditions?: string[];
  status: OfferStatus;
  /** Free-form ordering hint from the backend (lower = higher). */
  priority?: number;
}

export interface OfferBundle {
  offers: Offer[];
  /** ISO-8601 timestamp of the backend snapshot; drives cache TTL. */
  fetchedAt: string;
  /** Refresh interval hint from the backend (seconds). */
  refreshIntervalSeconds: number;
}

/** Payload returned when applying / validating an offer. */
export interface AppliedOffer {
  offerId: string;
  code: string;
  title: string;
  /** Discount amount in INR — computed by the backend, never the client. */
  discount: Money;
  /** Optional friendly savings line (e.g. "You saved ₹80"). */
  savingsLabel?: string;
  /** Echoed for display in cart/checkout. */
  type: OfferType;
}
