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
  /** Base unit price at the moment the item was added. */
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
  subtotal: Money;
  itemDiscount: Money;
  promoDiscount: Money;
  taxes: Money;
  deliveryFee: Money;
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
