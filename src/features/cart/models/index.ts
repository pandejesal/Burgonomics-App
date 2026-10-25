/**
 * Cart domain models — the frontend contract. Repositories will map
 * PETPOOJA wire DTOs into these types.
 *
 * The cart is always scoped to a single store (see `storeId` on CartLine
 * and `useCartStore.storeId`). Cross-store carts are not permitted.
 */
import type { Id, Money } from "@/core/models";
import type { Fulfillment } from "@/features/stores/models/Store";

export type { Fulfillment };

export interface CartModifier {
  /** Customization group id (e.g. "size", "extras"). */
  groupId: string;
  groupName: string;
  optionId: string;
  name: string;
  /** Price delta vs base — may be 0 or negative. */
  priceDelta: Money;
}

export type CartLineAvailability = "available" | "unavailable";

export interface CartLine {
  lineId: string;
  id?: string;
  productId: Id;
  storeId: Id;
  name: string;
  imageUrl?: string;
  fallbackImageUrl?: string;
  veg?: boolean;
  /**
   * All-in unit price at the moment the item was added: base menu price plus
   * every selected modifier delta (`Σ priceDelta`). Consumers multiply this by
   * `quantity` directly, and it is what Petpooja receives — never add modifier
   * deltas on top of it again (see `computeItemUnitPrice`).
   */
  unitPrice: Money;
  price?: Money;
  quantity: number;
  modifiers: CartModifier[];
  customizations?:
    | Array<{ groupName?: string; optionName?: string; name?: string; price: number }>
    | CartModifier[];
  /** Free-text special instructions for the kitchen. */
  notes?: string;
  availability: CartLineAvailability;
  unavailableReason?: string;
  /** Opaque repository metadata for future PETPOOJA sync (variant ids etc.). */
  meta?: Record<string, unknown>;
}

export interface AppliedPromo {
  /** Backend offer id — required when the promo comes from the offers repo. */
  offerId?: string;
  code: string;
  description?: string;
  discount: Money;
  /** Repository-provided savings summary (e.g. "You saved ₹80"). */
  savingsLabel?: string;
  /** Offer category as returned by the backend. */
  type?: string;
}

export interface CartTotals {
  /**
   * Sum of all line totals, GST-INCLUSIVE. The 5% GST is already inside this
   * number — it is never added on top (see `calculateOrderTotals`).
   */
  subtotal: Money;
  itemDiscount: Money;
  promoDiscount: Money;
  /** CGST + SGST embedded in `subtotal`. Informational — a breakdown, not an addition. */
  taxes: Money;
  /** Central GST half of `taxes`. */
  cgst: Money;
  /** State GST half of `taxes`. */
  sgst: Money;
  /** Rate `cgst`/`sgst` were computed at (0.05 = 5%). */
  gstRate: number;
  deliveryFee: Money;
  /** Flat packaging charge for the whole order, by fulfillment mode. */
  packingFee: Money;
  grandTotal: Money;
  currency: "INR";
  deliveryCharge?: Money;
  discount?: Money;
  packagingCharge?: Money;
  tax?: Money;
}

export type CartStatus =
  "idle" | "empty" | "loading" | "updating" | "ready" | "error" | "sync_pending";

export interface CartValidation {
  valid: boolean;
  issues: Array<{
    lineId?: string;
    code: "unavailable" | "min_order" | "closed_store" | "other";
    message: string;
  }>;
}
