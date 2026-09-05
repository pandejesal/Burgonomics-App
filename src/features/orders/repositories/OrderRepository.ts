/**
 * OrderRepository — sole entry point for the UI to read or mutate
 * order state. Wraps `ordersService`, which is live against Firestore
 * (plus the Petpooja KOT gateway) — not a mock awaiting a swap.
 *
 * The tracking surface (`subscribeTracking`) is polling-based today but
 * exposes the exact shape a WebSocket / push-notification adapter will
 * fill later:
 *
 *   ws://…/v1/orders/:id/track       → subscribeTracking (updates$)
 *   POST /v1/notifications/register   → future push token registration
 *
 * Screens never manage timers themselves — they call `subscribeTracking`
 * and receive a `stop()` on unmount.
 */
import { ok, type ApiResult } from "@/core/network/http";
import { ordersService } from "@/features/orders/services/ordersService";
import { buildTrackUrl } from "@/features/orders/utils/trackUrl";
import { useOrdersStore, selectAllOrders } from "@/features/orders/state/ordersStore";
import { cartRepository } from "@/features/cart/repositories/CartRepository";
import { useCartStore } from "@/features/cart/state/cartStore";
import { useStoreSelection } from "@/features/stores/state/storeStore";
import { selectSelectedAddress, useAddressStore } from "@/features/addresses";
import { useCheckoutStore } from "@/features/checkout/state/checkoutStore";
import { usePaymentStore } from "@/features/payments/state/paymentStore";
import type { PaymentMethod } from "@/features/payments/models";
import type {
  CreateOrderInput,
  Order,
  OrderAddressSnapshot,
  OrderListQuery,
  OrderListResult,
  OrderPaymentInfo,
  OrderTrackingSnapshot,
  PaymentDisplayStatus,
} from "@/features/orders/models";
import { toStoreSnapshot } from "@/features/orders/models";

// -- Tracking subscription contract ----------------------------------

export interface TrackingSubscription {
  /** Cancel the subscription. Idempotent. */
  stop: () => void;
  /** Force an immediate refresh outside the polling cadence. */
  refresh: () => Promise<void>;
}

export type TrackingListener = (snapshot: OrderTrackingSnapshot) => void;
export type TrackingErrorListener = (error: { code: string; message: string }) => void;

interface SubscribeOptions {
  intervalMs?: number;
  onError?: TrackingErrorListener;
}

const paymentMethodLabel: Record<PaymentMethod, string> = {
  online: "Paid Online",
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  netbanking: "Net Banking",
  wallet: "Wallet",
};

export class OrderRepository {
  readonly name = "OrderRepository";

  constructor(private readonly service = ordersService) {}

  // -- History ---------------------------------------------------------

  async listOrders(query: OrderListQuery = {}): Promise<ApiResult<OrderListResult>> {
    const res = await this.service.listOrders(query);
    if (res.success && res.data.items.length === 0) {
      const localOrders = selectAllOrders(useOrdersStore.getState());
      if (localOrders.length > 0) {
        let filtered = localOrders;
        if (query.bucket) {
          filtered = filtered.filter((o: Order) => {
            if (query.bucket === "ongoing")
              return o.status.kind === "upcoming" || o.status.kind === "in_progress";
            if (query.bucket === "cancelled")
              return o.status.kind === "cancelled" || o.status.kind === "failed";
            return o.status.kind === "completed";
          });
        }
        return ok({
          items: filtered,
          page: 1,
          pageSize: query.pageSize ?? 20,
          total: filtered.length,
          hasMore: false,
        });
      }
    }
    return res;
  }

  async getOrder(id: string): Promise<ApiResult<Order | null>> {
    const res = await this.service.getOrder(id);
    if (res.success && res.data) {
      useOrdersStore.getState().upsert(res.data);
    }
    return res;
  }

  // -- Create ----------------------------------------------------------

  /**
   * Compose an order from the current cart / store / address / payment
   * context. Used by the payment screen after a successful verification.
   */
  async createFromCurrentContext(opts: {
    confirmedOrderId?: string;
    paymentMethod: PaymentMethod;
    transactionId?: string;
    paymentStatus?: PaymentDisplayStatus;
    paymentLabel?: string;
  }): Promise<ApiResult<Order>> {
    const cart = useCartStore.getState();
    const sel = useStoreSelection.getState();
    const address = selectSelectedAddress(useAddressStore.getState());
    const checkout = useCheckoutStore.getState();
    const totalsRes = await cartRepository.calculateTotals();
    if (!totalsRes.success) return totalsRes;
    if (!sel.activeStore || !sel.fulfillment) {
      return {
        success: false,
        error: {
          code: "MISSING_CONTEXT",
          message: "Store and fulfillment method are required.",
        },
      };
    }

    const fulfillmentInstructions =
      sel.fulfillment === "delivery"
        ? checkout.deliveryInstructions
        : sel.fulfillment === "takeaway"
          ? checkout.pickupInstructions
          : checkout.diningNotes;

    const addressSnapshot: OrderAddressSnapshot | undefined =
      sel.fulfillment === "delivery" && address
        ? {
            label: address.label === "other" ? (address.customLabel ?? "Address") : address.label,
            contactName: address.contactName ?? "",
            contactPhone: address.contactPhone ?? "",
            line1: address.line1,
            line2: address.line2,
            landmark: address.landmark,
            city: address.city,
            state: address.state ?? "",
            pincode: address.pincode,
          }
        : undefined;

    const isCash = opts.paymentMethod === "cash";
    const payment: OrderPaymentInfo = {
      method: isCash ? "cod" : opts.paymentMethod,
      label: opts.paymentLabel ?? paymentMethodLabel[opts.paymentMethod] ?? "Payment",
      status: opts.paymentStatus ?? (isCash ? "CASH_PENDING" : "paid"),
      transactionId: opts.transactionId,
      paidAt: isCash ? undefined : new Date().toISOString(),
    };

    const input: CreateOrderInput = {
      store: toStoreSnapshot(sel.activeStore),
      fulfillment: sel.fulfillment,
      items: cart.lines,
      totals: totalsRes.data,
      promo: cart.promo,
      address: addressSnapshot,
      notes: checkout.orderNotes,
      fulfillmentInstructions,
      tableNumber: sel.fulfillment === "dinein" ? checkout.tableNumber : undefined,
      payment,
      confirmedOrderId: opts.confirmedOrderId,
    };

    const res = await this.service.createOrder(input);
    if (res.success) {
      useOrdersStore.getState().upsert(res.data);
      useOrdersStore.getState().setActiveOrderId(res.data.id);
    }
    return res;
  }

  // -- Actions ---------------------------------------------------------

  async cancelOrder(id: string): Promise<ApiResult<Order | null>> {
    const res = await this.service.cancelOrder(id);
    if (res.success && res.data) useOrdersStore.getState().upsert(res.data);
    return res;
  }

  /**
   * Placeholder reorder flow. Returns the source line-items and store
   * id so the caller can decide to rebuild the cart / prompt the user.
   */
  async reorder(id: string) {
    return this.service.reorder(id);
  }

  /** Placeholder — Support screen hand-off. */
  async contactStore(id: string): Promise<ApiResult<{ phone: string | null }>> {
    const res = await this.getOrder(id);
    if (!res.success) return res;
    return ok({ phone: res.data?.store.phone ?? null });
  }

  /** Placeholder — hooked up when the invoice service ships. */
  async downloadInvoice(id: string): Promise<ApiResult<{ url: string | null }>> {
    void id;
    return ok({ url: null });
  }

  /**
   * Canonical customer tracking URL for an order. Delegates to the pure
   * utils/trackUrl helper (unit-tested; keeps this repo method honest).
   */
  buildTrackUrl(id: string, origin?: string): string {
    return buildTrackUrl(id, origin);
  }

  /**
   * Compose a share payload. Uses the Web Share API where available
   * (see route handler); repository only produces the message.
   */
  async buildShareMessage(id: string): Promise<ApiResult<{ title: string; text: string }>> {
    const res = await this.getOrder(id);
    if (!res.success) return res;
    const order = res.data;
    if (!order) {
      return {
        success: false,
        error: { code: "NOT_FOUND", message: "Order not found." },
      };
    }
    return ok({
      title: `Burgonomics order ${order.shortCode}`,
      text: `My order ${order.shortCode} from ${order.store.name} — status: ${order.status.label}.`,
    });
  }

  // -- Tracking --------------------------------------------------------

  async getTracking(id: string): Promise<ApiResult<OrderTrackingSnapshot | null>> {
    return this.service.getTracking(id);
  }

  /**
   * Start a repository-managed real-time tracking subscription (<5s sync).
   * Backed by Firestore onSnapshot listeners with graceful polling fallback.
   */
  subscribeTracking(
    id: string,
    listener: TrackingListener,
    options: SubscribeOptions = {},
  ): TrackingSubscription {
    const intervalMs = options.intervalMs ?? 8000;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let fsUnsubscribe: (() => void) | null = null;

    const fetchOnce = async () => {
      if (stopped) return;
      const res = await this.service.getTracking(id);
      if (stopped) return;
      if (res.success && res.data) {
        listener(res.data);
        if (res.data.status.terminal) return; // stop polling
      } else if (!res.success) {
        options.onError?.(res.error);
      }
      timer = setTimeout(fetchOnce, intervalMs);
    };

    // Initialize real-time Firestore onSnapshot listener
    void (async () => {
      try {
        const { db } = await import("@/core/config/firebase");
        const { doc, onSnapshot } = await import("firebase/firestore");
        if (stopped) return;

        fsUnsubscribe = onSnapshot(
          doc(db, "orders", id),
          (snapshot) => {
            if (stopped || !snapshot.exists()) return;
            // Immediate refresh tracking on snapshot event
            void (async () => {
              const res = await this.service.getTracking(id);
              if (!stopped && res.success && res.data) {
                listener(res.data);
              }
            })();
          },
          (err) => {
            console.warn("OrderRepository: Firestore tracking onSnapshot error:", err);
            options.onError?.({
              code: "TRACKING_SNAPSHOT_FAILED",
              message: err?.message || "Live tracking connection failed.",
            });
          },
        );
      } catch (err) {
        console.warn("OrderRepository: Could not bind Firestore onSnapshot listener:", err);
      }
    })();

    void fetchOnce();

    return {
      stop: () => {
        stopped = true;
        if (timer) clearTimeout(timer);
        if (fsUnsubscribe) fsUnsubscribe();
      },
      refresh: fetchOnce,
    };
  }
}

export const orderRepository = new OrderRepository();
