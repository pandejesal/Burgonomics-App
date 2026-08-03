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
  id: Id;
  name: string;
  address: string;
  addressLine1?: string;
  petpoojaRestId?: string;
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

  /** Read-only snapshot of the cart at placement time. */
  items: CartLine[];
  totals: CartTotals;
  promo?: AppliedPromo | null;

  /** Free-text special instructions collected on checkout. */
  notes?: string;
  fulfillmentInstructions?: string;

  payment: OrderPaymentInfo;

  placedAt: Iso8601;
  /** Estimated ready / delivery time in ISO. */
  estimatedAt?: Iso8601;
  /** Terminal timestamp (delivered / picked_up / completed / cancelled). */
  completedAt?: Iso8601;

  /** For delivery orders — populated later by the partner integration. */
  deliveryPartner?: DeliveryPartnerInfo;
  /** Repository metadata pass-through (KOT number, POS refs, …). */
  meta?: Record<string, unknown>;
}

export interface OrderTrackingSnapshot {
  orderId: Id;
  status: OrderStatusMeta;
  steps: OrderTimelineStep[];
  /** Minutes remaining until estimated ready/delivery time. */
  etaMinutes?: number;
  /** For delivery — populated when partner has been assigned. */
  deliveryPartner?: DeliveryPartnerInfo;
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
  address?: OrderAddressSnapshot;
  notes?: string;
  fulfillmentInstructions?: string;
  payment: OrderPaymentInfo;
  /** Backend confirmed order id (from payment verification). */
  confirmedOrderId?: string;
}

/** Mapping helper — build a snapshot from an existing Store model. */
export function toStoreSnapshot(store: Store): OrderStoreSnapshot {
  return {
    id: store.id,
    name: store.name,
    address: store.address,
    area: store.area,
    city: store.city,
    phone: store.phone,
    lat: store.lat,
    lng: store.lng,
  };
}
