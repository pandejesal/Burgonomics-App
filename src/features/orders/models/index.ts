/**
 * Orders domain models — the frontend contract.
 *
 * Repositories map wire DTOs (PETPOOJA order push responses, KOT
 * callbacks, delivery-partner webhooks) into these types. The UI
 * consumes only these shapes so swapping mocks for the live backend is
 * a repository/service change with zero component edits.
 *
 * Status naming is intentionally *not* hardcoded in the UI. The
 * repository emits a `code` + human-readable `label` + a lifecycle
 * `kind` (`upcoming` / `completed` / `cancelled`). Unknown future codes
 * fall through as `unknown` without breaking any screen.
 */
import type { Money, Iso8601, Id } from "@/core/models";
import type { Fulfillment, Store } from "@/features/stores/models/Store";
import type { CartLine, CartTotals, AppliedPromo } from "@/features/cart/models";
import type { PaymentMethod } from "@/features/payments/models";

export type { CartLine, CartTotals, AppliedPromo };

/** Canonical status codes we handle today. Repository may return others. */
export type KnownOrderStatusCode =
  | "PLACED"
  | "CONFIRMED"
  | "PREPARING"
  | "READY_FOR_PICKUP"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "PICKED_UP"
  | "READY_TO_SERVE"
  | "COMPLETED"
  | "CANCELLED"
  | "FAILED";

/**
 * Opaque status code — anything the repository returns. UI must render
 * via `OrderStatusMeta` (label + kind) rather than by matching strings.
 */
export type OrderStatusCode = KnownOrderStatusCode | (string & {});

export type OrderStatusKind =
  "upcoming" | "in_progress" | "completed" | "cancelled" | "failed" | "unknown";

export interface OrderStatusMeta {
  code: OrderStatusCode;
  label: string;
  kind: OrderStatusKind;
  /** True when this is the terminal status of the order. */
  terminal: boolean;
}

/**
 * A single milestone rendered by <OrderTimeline />. Every field is
 * repository-driven — `title`, `description`, and timestamps flow in
 * from the backend so PETPOOJA-specific wording (e.g. "KOT accepted")
 * can be surfaced verbatim.
 */
export interface OrderTimelineStep {
  code: OrderStatusCode;
  title: string;
  description?: string;
  /** Repository-provided timestamp when the step completed. */
  timestamp?: Iso8601;
  state: "completed" | "current" | "future";
}

export type PaymentDisplayStatus =
  "paid" | "pending" | "failed" | "refunded" | "PAY_AT_STORE" | "CASH_PENDING";

export interface OrderPaymentInfo {
  method: PaymentMethod | "cod" | "unknown";
  /** Human-readable label — e.g. "UPI · GPay", "Card ****4242". */
  label: string;
  status: PaymentDisplayStatus;
  transactionId?: string;
  paidAt?: Iso8601;
}

/** Snapshot of the store at the moment the order was placed. */
export interface OrderStoreSnapshot {
  etaMinutes?: number | null;
  pickupEtaMinutes?: number | null;
  id: Id;
  name: string;
  address: string;
  addressLine1?: string;
  petpoojaRestId?: string;
  /** Linked Partner branch id (if the outlet was linked by ops). */
  partnerBranchId?: string | null;
  area: string;
  city: string;
  phone: string;
  lat?: number;
  lng?: number;
}

/** Snapshot of the delivery address (delivery orders only). */
export interface OrderAddressSnapshot {
  label: string;
  contactName: string;
  contactPhone: string;
  name?: string;
  phone?: string;
  line1: string;
  line2?: string;
  landmark?: string;
  city: string;
  state: string;
  pincode: string;
  lat?: number;
  lng?: number;
}

/** Placeholder — the real integration owns partner assignment. */
export interface DeliveryPartnerInfo {
  name?: string;
  phone?: string;
  vehicleNumber?: string;
  /** ETA in minutes from now. */
  etaMinutes?: number;
}

export interface Order {
  id: Id;
  /** Human-readable short code shown in the UI (e.g. "BG-24H8K"). */
  shortCode: string;
  status: OrderStatusMeta;
  fulfillment: Fulfillment;

  store: OrderStoreSnapshot;
  address?: OrderAddressSnapshot;
  /** Delivery address mirror (with coords) for downstream partner/dispatch readers. */
  deliveryAddress?: OrderAddressSnapshot;

  /** Read-only snapshot of the cart at placement time. */
  items: CartLine[];
  totals: CartTotals;
  promo?: AppliedPromo | null;
  /** Delivery-partner tip (₹) and redeemed loyalty points, as placed. */
  tipAmount?: number;
  loyaltyPointsRedeemed?: number;

  /** Free-text special instructions collected on checkout. */
  notes?: string;
  fulfillmentInstructions?: string;
  tableNumber?: string;
  /** WhatsApp order-alert opt-in, persisted on the order doc (P0-3). */
  whatsappOptIn?: boolean;

  payment: OrderPaymentInfo;

  /**
   * Server-written, customer-VISIBLE marker for money we could not apply to
   * this order (A08 B5). Read-only to the client: the server sets it when a
   * captured payment is parked (amount mismatch/unknown, currency mismatch, or
   * a capture against a cancelled/refunded order), because every park
   * collection is brand-only and the payer would otherwise have no self-serve
   * view of their money. The app must never write this field.
   */
  reconciliation?: {
    state: "payment_review";
    /**
     * Ops-facing machine code. Live writers emit exactly one of:
     * confirm_currency_mismatch, confirm_amount_mismatch, confirm_amount_unknown,
     * capture_on_cancelled_order, capture_on_refunded_order. Optional here only
     * because this is an unvalidated read of a server doc; never render it.
     */
    reason?: string;
    razorpayPaymentId?: string | null;
    /**
     * Firestore serverTimestamp(), not an ISO string: the value is a Timestamp
     * object in memory and a `{seconds,nanoseconds}`-shaped map once the
     * persisted orders cache round-trips through JSON. Nothing in the app reads
     * it, so it stays `unknown` rather than inviting a string assumption.
     */
    updatedAt?: unknown;
  } | null;

  placedAt: Iso8601;
  /** Estimated ready / delivery time in ISO. */
  estimatedAt?: Iso8601;
  /** Terminal timestamp (delivered / picked_up / completed / cancelled). */
  completedAt?: Iso8601;
  /**
   * Server-written document clock — every status/ownership lane in
   * `firestore.rules` merge-writes `updatedAt` (Firestore serverTimestamp
   * in memory, `{seconds,nanoseconds}` once the persisted cache round-trips
   * through JSON). Passthrough from the raw order doc (unvalidated — same
   * class as `reconciliation.updatedAt` above): read ONLY for cache
   * freshness ranking in ordersStore; never render it.
   */
  updatedAt?: unknown;

  /** Petpooja POS sync status and details */
  petpoojaStatus?: "Pending" | "Processing" | "Synced" | "Failed" | "Bypassed";
  petpoojaDetails?: {
    kotId?: string | null;
    posOrderId?: string | null;
    syncedAt?: string;
    syncError?: string;
    lastAttemptAt?: string;
  };

  /** For delivery orders — populated later by the partner integration. */
  deliveryPartner?: DeliveryPartnerInfo;
  /** Repository metadata pass-through (KOT number, POS refs, …). */
  meta?: Record<string, unknown>;
}

/**
 * Amount the customer still owes on this order, or null when the document
 * does not carry a readable grand total. Mirrors the checkout payable rule:
 * grand total plus tip minus redeemed loyalty points, floored at zero.
 */
export function orderPayableAmount(
  order: Pick<Order, "totals" | "tipAmount" | "loyaltyPointsRedeemed">,
): number | null {
  const grandTotal = order.totals?.grandTotal;
  if (typeof grandTotal !== "number" || !Number.isFinite(grandTotal)) return null;
  const tip =
    typeof order.tipAmount === "number" && Number.isFinite(order.tipAmount) ? order.tipAmount : 0;
  const points =
    typeof order.loyaltyPointsRedeemed === "number" && Number.isFinite(order.loyaltyPointsRedeemed)
      ? order.loyaltyPointsRedeemed
      : 0;
  return Math.max(0, grandTotal + tip - points);
}

export interface OrderTrackingSnapshot {
  orderId: Id;
  status: OrderStatusMeta;
  steps: OrderTimelineStep[];
  /** Minutes remaining until estimated ready/delivery time. */
  etaMinutes?: number;
  /** For delivery — populated when partner has been assigned. */
  deliveryPartner?: DeliveryPartnerInfo;
  tableNumber?: string;
  refreshedAt: Iso8601;
}

// -- Repository input / query shapes ----------------------------------

export type OrderHistoryBucket = "ongoing" | "past" | "cancelled";
export type OrderSortKey = "recent" | "oldest" | "amount_high" | "amount_low";

export interface OrderListQuery {
  bucket?: OrderHistoryBucket;
  search?: string;
  sort?: OrderSortKey;
  page?: number;
  pageSize?: number;
}

export interface OrderListResult {
  items: Order[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface CreateOrderInput {
  store: OrderStoreSnapshot;
  fulfillment: Fulfillment;
  items: CartLine[];
  totals: CartTotals;
  promo?: AppliedPromo | null;
  /** Delivery-partner tip (₹) chosen on the cart screen. */
  tipAmount?: number;
  /** Loyalty points redeemed (1 pt = ₹1, server re-caps at 20%). */
  loyaltyPointsRedeemed?: number;
  address?: OrderAddressSnapshot;
  /** Delivery address pass-through for downstream (partner/dispatch) systems. */
  deliveryAddress?: OrderAddressSnapshot;
  notes?: string;
  fulfillmentInstructions?: string;
  tableNumber?: string;
  /** WhatsApp order-alert opt-in at placement time (defaults true). */
  whatsappOptIn?: boolean;
  payment: OrderPaymentInfo;
  /** Backend confirmed order id (from payment verification). */
  confirmedOrderId?: string;
}

/** Mapping helper — build a snapshot from an existing Store model. */
export function toStoreSnapshot(store: Store): OrderStoreSnapshot {
  return {
    ...(store.etaMinutes != null ? { etaMinutes: store.etaMinutes } : {}),
    ...(store.pickupEtaMinutes != null ? { pickupEtaMinutes: store.pickupEtaMinutes } : {}),
    id: store.id,
    name: store.name,
    address: store.address,
    area: store.area,
    city: store.city,
    phone: store.phone,
    lat: store.lat,
    lng: store.lng,
    partnerBranchId: store.partnerBranchId ?? null,
  };
}
