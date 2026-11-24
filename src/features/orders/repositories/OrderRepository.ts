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
import { ok, fail, type ApiResult } from "@/core/network/http";
import { logger } from "@/core/logging/logger";
import { ordersService } from "@/features/orders/services/ordersService";
import {
  createCashOrderOnServer,
  type CashOrderRequest,
} from "@/features/payments/services/cashOrderService";
import {
  claimPendingCashOrder,
  ownsAttempt,
  type PendingCashOrder,
  clearPendingCashOrder,
  markPendingCashOrderConfirmed,
  peekConfirmedCashOrderId,
  readPendingCashOrder,
  updatePendingCashOrderAcceptedTotal,
} from "@/features/payments/services/pendingCashOrder";
import {
  createOnlineDraftOnServer,
  retireOnlineDraftOnServer,
  type OnlineDraftReceipt,
  type OnlineDraftRequest,
} from "@/features/payments/services/onlineDraftService";
import {
  claimPendingOnlineDraft,
  minimalOnlineDraftRequest,
  sameOnlineDraftContext,
  ownsOnlineDraftAttempt,
  type PendingOnlineDraft,
  clearPendingOnlineDraft,
  pendingOnlineDraftId,
  readPendingOnlineDraft,
} from "@/features/payments/services/pendingOnlineDraft";
import { generateSecureId } from "@/shared/utils/cryptoUtils";
import { buildTrackUrl } from "@/features/orders/utils/trackUrl";
import { useOrdersStore, selectAllOrders } from "@/features/orders/state/ordersStore";
import { cartRepository } from "@/features/cart/repositories/CartRepository";
import { useCartStore } from "@/features/cart/state/cartStore";
import { useStoreSelection } from "@/features/stores/state/storeStore";
import { selectSelectedAddress, useAddressStore } from "@/features/addresses";
import { useCheckoutStore } from "@/features/checkout/state/checkoutStore";
import { usePaymentStore } from "@/features/payments/state/paymentStore";
import { currentScopedUid } from "@/features/auth/utils/scopedPersistence";
import type {
  Order,
  OrderListQuery,
  OrderListResult,
  OrderTrackingSnapshot,
} from "@/features/orders/models";
import { checkMinimumOrder, minOrderShortfallMessage } from "@/shared/pricing/pricingEngine";

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

/** Keep the validated, minimal line identity; overlay only transient text. */
function withCookingNotes<T>(items: T[], lineNotes: ReadonlyArray<string | undefined>) {
  return items.map((item, index) => {
    const notes = lineNotes[index];
    return notes ? { ...item, notes } : item;
  });
}

export class OrderRepository {
  readonly name = "OrderRepository";
  private cashNotes?: {
    attemptId: string;
    uid: string;
    fields: Pick<CashOrderRequest, "notes" | "fulfillmentInstructions">;
    lineNotes: Array<string | undefined>;
  };

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
    const pending = typeof window === "undefined" ? null : readPendingCashOrder();
    const res = await this.service.getOrder(id);
    if (res.success && res.data) {
      if (
        pending?.confirmed &&
        pending.orderId === id &&
        res.data.id === id &&
        ownsAttempt(pending)
      )
        clearPendingCashOrder();
      useOrdersStore.getState().upsert(res.data);
    }
    return res;
  }

  /**
   * M8 r2 — owner-scoped fresh read for the downloaded receipt.
   *
   * The plain `getOrder` serves the session cache first, so a cash collection
   * stamped after an earlier read would never reach a receipt printed from
   * that cached order. This re-reads the server doc under the current uid and
   * returns null on any failure (read error, auth change, not found, not
   * owner). The caller MUST withhold every payment claim on null — a cached
   * copy is not proof of the current payment state.
   */
  async getOrderForReceipt(order: Order): Promise<Order | null> {
    const res = await this.service.refreshOrderStrict(order.id);
    if (!res.success || !res.data) return null;
    useOrdersStore.getState().upsert(res.data);
    return res.data;
  }

  // -- Create ----------------------------------------------------------

  /**
   * CASH ON DELIVERY / PAY AT STORE (owner decision 2026-11-20).
   *
   * The SERVER creates this order: `POST /orders/createCashOrder` resolves the
   * branch, prices every line from the catalogue, enforces the branch's COD
   * switch and per-order ceiling, and stamps `paymentChannel: "cash"`. The app
   * never writes a cash order itself, because the amount a rider collects at
   * the door must be the server's number — not the cart's.
   *
   * The order id is generated here and reused across retries, so a lost
   * response can never create two orders (the route replays its receipt).
   */
  async createCashOrder(
    opts: {
      orderId?: string;
      /** A server total the customer reconfirmed after PRICE_CHANGED (M5). */
      acceptedTotalPaise?: number;
      attemptId?: string;
      zeroDueOnly?: true;
    } = {},
  ): Promise<ApiResult<Order>> {
    const uid = currentScopedUid();
    if (!uid) return fail("UNAUTHENTICATED", "Sign in to place a cash order.");
    try {
      const prior = readPendingCashOrder();
      if (opts.attemptId && (!prior || prior.attemptId !== opts.attemptId || prior.uid !== uid))
        return fail("ATTEMPT_CHANGED", "Please review your current checkout.");
      if (prior) {
        if (opts.zeroDueOnly && !prior.request.zeroDueOnly) {
          return fail("ATTEMPT_CHANGED", "Finish your previous cash checkout first.");
        }
        if (!prior.request.zeroDueOnly && opts.attemptId && opts.acceptedTotalPaise !== undefined) {
          updatePendingCashOrderAcceptedTotal(opts.acceptedTotalPaise);
          prior.request.expectedTotalPaise = opts.acceptedTotalPaise;
        }
        return this.submitCashAttempt(prior);
      }
      const online = readPendingOnlineDraft();
      if (online) {
        const retired = await this.retireOnlineAttempt(online);
        if (!retired.success) return retired;
      }
    } catch {
      return fail("CASH_STORAGE_UNAVAILABLE", "Your saved checkout could not be read.", true);
    }
    const cart = useCartStore.getState();
    const sel = useStoreSelection.getState();
    const address = selectSelectedAddress(useAddressStore.getState());
    const checkout = useCheckoutStore.getState();
    if (!sel.activeStore || !sel.fulfillment) {
      return {
        success: false,
        error: {
          code: "MISSING_CONTEXT",
          message: "Store and fulfillment method are required.",
        },
      };
    }
    if (cart.lines.length === 0) {
      return fail("CART_EMPTY", "Your cart is empty.", false);
    }
    const totalsRes = await cartRepository.calculateTotals();
    if (!totalsRes.success) return totalsRes;
    const minCheck = checkMinimumOrder(
      totalsRes.data.subtotal,
      sel.fulfillment,
      sel.activeStore.pricing?.minOrderAmount,
    );
    if (!minCheck.met) {
      return fail("MIN_ORDER", minOrderShortfallMessage(minCheck), true);
    }

    const isDelivery = sel.fulfillment === "delivery";
    const deliveryQuoteId =
      isDelivery && checkout.checkoutFees.status === "ready"
        ? (checkout.checkoutFees.deliveryQuoteId ?? undefined)
        : undefined;
    const orderId = opts.orderId ?? `ord_${Date.now()}_${generateSecureId(6)}`;
    const request: CashOrderRequest = {
      orderId,
      storeId: sel.activeStore.id,
      ...(sel.activeStore.partnerBranchId ? { branchId: sel.activeStore.partnerBranchId } : {}),
      orderType: sel.fulfillment,
      items: cart.lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        ...(Array.isArray(line.customizations) && line.customizations.length > 0
          ? { customizations: line.customizations as unknown as Array<Record<string, unknown>> }
          : {}),
        ...(Array.isArray(line.modifiers) && line.modifiers.length > 0
          ? { modifiers: line.modifiers as unknown as Array<Record<string, unknown>> }
          : {}),
        ...(line.notes ? { notes: line.notes } : {}),
      })),
      // The bill the customer is looking at. The server refuses a different
      // number (PRICE_CHANGED) instead of silently moving it. After an explicit
      // reconfirmation we send the SERVER's total back (M5).
      expectedTotalPaise: opts.zeroDueOnly
        ? 0
        : (opts.acceptedTotalPaise ?? Math.round(totalsRes.data.grandTotal * 100)),
      ...(opts.zeroDueOnly ? { zeroDueOnly: true } : {}),
      ...(deliveryQuoteId ? { deliveryQuoteId } : {}),
      ...(cart.promo?.code ? { couponCode: cart.promo.code } : {}),
      ...(checkout.tipAmount ? { tipAmount: checkout.tipAmount } : {}),
      ...(checkout.orderNotes ? { notes: checkout.orderNotes } : {}),
      ...(sel.fulfillment === "dinein" && checkout.tableNumber
        ? { tableNumber: checkout.tableNumber }
        : {}),
    };
    const instructions = isDelivery
      ? checkout.deliveryInstructions
      : sel.fulfillment === "takeaway"
        ? checkout.pickupInstructions
        : checkout.diningNotes;
    if (instructions) request.fulfillmentInstructions = instructions;

    // Persist BEFORE the first send. A terminal refusal proves no order was
    // written, so its pending record is cleared; an ambiguous transport failure
    // keeps it so the next Retry replays the exact same request.
    let saved: PendingCashOrder;
    if (isDelivery && address) request.addressId = address.id;
    try {
      const attemptId = generateSecureId(22);
      saved = await claimPendingCashOrder(uid, attemptId, request);
      // Keep free text out of the durable replay record. In this tab, reuse
      // the original draft through a retry or explicit price confirmation.
      if (saved.attemptId === attemptId) {
        this.cashNotes = {
          attemptId,
          uid,
          lineNotes: request.items.map((item) => item.notes),
          fields: {
            ...(request.notes ? { notes: request.notes } : {}),
            ...(request.fulfillmentInstructions
              ? { fulfillmentInstructions: request.fulfillmentInstructions }
              : {}),
          },
        };
      }
    } catch {
      return fail(
        "CASH_STORAGE_UNAVAILABLE",
        "Cannot safely save this checkout. Please retry.",
        true,
      );
    }
    if (opts.zeroDueOnly && !saved.request.zeroDueOnly) {
      return fail("ATTEMPT_CHANGED", "Finish your previous cash checkout first.");
    }
    return this.submitCashAttempt(saved);
  }

  private async submitCashAttempt(saved: PendingCashOrder): Promise<ApiResult<Order>> {
    const changed = () => fail("ATTEMPT_CHANGED", "This checkout is no longer active.");
    if (!ownsAttempt(saved)) return changed();
    if (saved.confirmed) return this.hydrateCashOrder(saved.orderId, saved);
    const draft = this.cashNotes;
    const hasDraft = draft?.attemptId === saved.attemptId && draft.uid === saved.uid;
    const created = await createCashOrderOnServer({
      ...saved.request,
      ...(saved.request.zeroDueOnly ? { expectedTotalPaise: 0 } : {}),
      ...(hasDraft ? draft.fields : {}),
      items: withCookingNotes(saved.request.items, hasDraft ? draft.lineNotes : []),
      attemptId: saved.attemptId,
    });
    if (!ownsAttempt(saved)) return changed();
    if (!created.success) {
      if (saved.request.zeroDueOnly && created.error.code === "PRICE_CHANGED") {
        clearPendingCashOrder();
        if (hasDraft && this.cashNotes === draft) this.cashNotes = undefined;
        return created; // no attempt id: never offer a cash reconfirmation
      }
      // A PRICE_CHANGED is a verified no-write, but the customer must reconfirm
      // the SERVER's total — keep the same account-bound id for that retry.
      if (created.error.code === "PRICE_CHANGED")
        return {
          ...created,
          error: {
            ...created.error,
            details: { ...created.error.details, attemptId: saved.attemptId },
          },
        };
      if (created.error.retryable === false && created.error.code !== "IDEMPOTENCY_CONFLICT") {
        clearPendingCashOrder();
        if (hasDraft && this.cashNotes === draft) this.cashNotes = undefined;
      }
      return created;
    }

    if (saved.request.zeroDueOnly && created.data.cashDuePaise !== 0) {
      return fail(
        "RECEIPT_UNAVAILABLE",
        "We couldn't confirm the zero-due order. Check your orders before trying again.",
      );
    }

    // Success is recorded durably: any later retry only hydrates this id and
    // never POSTs again, even if the read-back failed here (M4).
    if (hasDraft && this.cashNotes === draft) this.cashNotes = undefined;
    markPendingCashOrderConfirmed(saved.orderId, created.data.orderId);
    return this.hydrateCashOrder(created.data.orderId, saved);
  }

  /**
   * The confirmed cash order id to recover BEFORE checkout preflight (M4 r2).
   * No network call, no write: the payment screen can navigate straight to the
   * receipt even when the cart/store context is gone after a reload.
   */
  pendingCashOrderId(): string | null {
    return peekConfirmedCashOrderId();
  }

  /** Read a cash order's server document back into the UI (M4 retry path). */
  private async hydrateCashOrder(
    orderId: string,
    saved?: PendingCashOrder,
  ): Promise<ApiResult<Order>> {
    const hydrated = await this.service.getOrder(orderId);
    if (saved && !ownsAttempt(saved))
      return fail("ATTEMPT_CHANGED", "This checkout is no longer active.");
    if (hydrated.success && hydrated.data?.id === orderId) {
      const order = hydrated.data;
      useOrdersStore.getState().upsert(order);
      useOrdersStore.getState().setActiveOrderId(order.id);
      if (saved) clearPendingCashOrder();
      return ok(order);
    }
    return fail(
      "ORDER_SYNC_PENDING",
      "Your order was placed, but we couldn't load it yet. Check your orders before trying again.",
      true,
    );
  }

  /** Create the payable order draft on the server; never write Firestore here. */
  async createOnlineDraft(
    opts: { orderId?: string; deliveryQuoteId?: string } = {},
  ): Promise<ApiResult<OnlineDraftReceipt>> {
    const uid = currentScopedUid();
    if (!uid) return fail("UNAUTHENTICATED", "Sign in to place an online order.");
    let prior: PendingOnlineDraft | null;
    try {
      prior = readPendingOnlineDraft();
    } catch {
      return fail(
        "ONLINE_DRAFT_STORAGE_UNAVAILABLE",
        "Your saved checkout could not be read.",
        true,
      );
    }
    const cart = useCartStore.getState();
    const sel = useStoreSelection.getState();
    const address = selectSelectedAddress(useAddressStore.getState());
    const checkout = useCheckoutStore.getState();
    const totalsRes = await cartRepository.calculateTotals();
    if (!totalsRes.success) return totalsRes;
    if (!sel.activeStore || !sel.fulfillment) {
      return fail("MISSING_CONTEXT", "Store and fulfillment method are required.");
    }
    const minCheck = checkMinimumOrder(
      totalsRes.data.subtotal,
      sel.fulfillment,
      sel.activeStore.pricing?.minOrderAmount,
    );
    if (!minCheck.met) return fail("MIN_ORDER", minOrderShortfallMessage(minCheck), true);
    if (sel.fulfillment === "delivery" && !address)
      return fail("ADDRESS_REQUIRED", "Select a delivery address.");
    if (sel.fulfillment === "dinein" && !checkout.tableNumber.trim())
      return fail("TABLE_REQUIRED", "Enter a table number.");

    const attemptId = generateSecureId(22);
    const quoteId =
      opts.deliveryQuoteId ??
      (checkout.checkoutFees.status === "ready"
        ? checkout.checkoutFees.deliveryQuoteId
        : undefined);
    const request: OnlineDraftRequest = {
      orderId: opts.orderId ?? `ord_${Date.now()}_${generateSecureId(6)}`,
      attemptId,
      storeId: sel.activeStore.id,
      ...(sel.activeStore.partnerBranchId ? { branchId: sel.activeStore.partnerBranchId } : {}),
      orderType: sel.fulfillment,
      items: cart.lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        ...(Array.isArray(line.customizations) && line.customizations.length
          ? { customizations: line.customizations as unknown as Array<Record<string, unknown>> }
          : {}),
        ...(Array.isArray(line.modifiers) && line.modifiers.length
          ? { modifiers: line.modifiers as unknown as Array<Record<string, unknown>> }
          : {}),
        ...(line.notes ? { notes: line.notes } : {}),
      })),
      ...(sel.fulfillment === "delivery" && quoteId ? { deliveryQuoteId: quoteId } : {}),
      ...(sel.fulfillment === "delivery" && address ? { addressId: address.id } : {}),
      ...(cart.promo?.code ? { couponCode: cart.promo.code } : {}),
      ...(checkout.tipAmount ? { tipAmount: checkout.tipAmount } : {}),
      ...(checkout.orderNotes ? { notes: checkout.orderNotes } : {}),
      ...(sel.fulfillment === "dinein" && checkout.tableNumber
        ? { tableNumber: checkout.tableNumber }
        : {}),
    };
    const instructions =
      sel.fulfillment === "delivery"
        ? checkout.deliveryInstructions
        : sel.fulfillment === "takeaway"
          ? checkout.pickupInstructions
          : checkout.diningNotes;
    if (instructions) request.fulfillmentInstructions = instructions;

    let saved: PendingOnlineDraft;
    try {
      if (prior && !sameOnlineDraftContext(prior.request, minimalOnlineDraftRequest(request))) {
        const retired = await this.retireOnlineAttempt(prior);
        if (!retired.success) return retired;
        request.orderId = `ord_${Date.now()}_${generateSecureId(6)}`;
      }
      saved = await claimPendingOnlineDraft(uid, attemptId, request);
      if (!sameOnlineDraftContext(saved.request, minimalOnlineDraftRequest(request))) {
        return fail(
          "CHECKOUT_CONTEXT_CHANGED",
          "Your checkout changed. Review the current cart before retrying.",
          true,
        );
      }
    } catch {
      return fail(
        "ONLINE_DRAFT_STORAGE_UNAVAILABLE",
        "Cannot safely save this checkout. Please retry.",
        true,
      );
    }
    // The verified current basket also supplies free text for an inherited
    // claim: its first POST may not have reached the server. Bind these notes
    // to this submission, not to repository lifetime or durable storage.
    return this.submitOnlineDraft(saved, request);
  }

  private async submitOnlineDraft(
    saved: PendingOnlineDraft,
    verified: OnlineDraftRequest,
  ): Promise<ApiResult<OnlineDraftReceipt>> {
    if (!ownsOnlineDraftAttempt(saved))
      return fail("ATTEMPT_CHANGED", "This checkout is no longer active.");
    const created = await createOnlineDraftOnServer({
      ...saved.request,
      ...(verified.notes ? { notes: verified.notes } : {}),
      ...(verified.fulfillmentInstructions
        ? { fulfillmentInstructions: verified.fulfillmentInstructions }
        : {}),
      items: withCookingNotes(
        saved.request.items,
        verified.items.map((item) => item.notes),
      ),
      attemptId: saved.attemptId,
    });
    if (!ownsOnlineDraftAttempt(saved))
      return fail("ATTEMPT_CHANGED", "This checkout is no longer active.");
    if (!created.success && created.error.details?.draftRefused === true) {
      // A HTTP refusal alone cannot rule out a concurrent tab having committed.
      // Clear only after the server fences the attempt and any never-payable doc.
      await this.retireOnlineAttempt(saved);
    }
    // The pending draft remains durable until the gateway intent is safely
    // bound/reconciled; a second tab must reuse this same order and attempt.
    return created;
  }

  private async retireOnlineAttempt(saved: PendingOnlineDraft): Promise<ApiResult<void>> {
    if (!ownsOnlineDraftAttempt(saved))
      return fail("ATTEMPT_CHANGED", "This checkout is no longer active.");
    const retired = await retireOnlineDraftOnServer(saved.orderId, saved.attemptId);
    if (!retired.success) return retired;
    if (!ownsOnlineDraftAttempt(saved))
      return fail("ATTEMPT_CHANGED", "This checkout is no longer active.");
    this.clearPendingOnlineOrder(saved.orderId);
    return retired;
  }

  pendingOnlineOrderId(): string | null {
    try {
      return pendingOnlineDraftId();
    } catch {
      return null;
    }
  }
  clearPendingOnlineOrder(orderId?: string): void {
    if (orderId && readPendingOnlineDraft()?.orderId !== orderId) return;
    clearPendingOnlineDraft();
  }

  /**
   * R24 — paid-order finalization (read-only, server truth).
   *
   * After backend verify confirms the pending `orders/{id}` doc, callers
   * must land HERE. The retired client create path could overwrite
   * server-owned payment/status/totals on the confirmed id; this path only
   * reads server truth.
   *
   * Delegates to `ordersService.finalizePaidOrder`, which reads the doc
   * fresh from the server and validates owner binding + server-paid state
   * + the expected transaction id. This layer only hydrates the UI store
   * from that SERVER-truth result: failures never touch the store and
   * never mint a placeholder order (no false order, no new id).
   */
  async finalizePaidOrder(opts: {
    confirmedOrderId?: string;
    transactionId?: string;
  }): Promise<ApiResult<Order>> {
    const res = await this.service.finalizePaidOrder({
      confirmedOrderId: opts.confirmedOrderId ?? "",
      expectedTransactionId: opts.transactionId,
    });
    if (res.success && res.data) {
      useOrdersStore.getState().upsert(res.data);
      useOrdersStore.getState().setActiveOrderId(res.data.id);
    }
    return res;
  }

  // -- Actions ---------------------------------------------------------

  /**
   * Persist the WhatsApp order-alert opt-in (P0-3). Upserts the store on
   * success so readers converge without a refetch.
   */
  async setWhatsappOptIn(id: string, optIn: boolean): Promise<ApiResult<Order>> {
    const res = await this.service.setWhatsappOptIn(id, optIn);
    if (res.success) useOrdersStore.getState().upsert(res.data);
    return res;
  }

  async cancelOrder(id: string): Promise<ApiResult<Order | null>> {
    const res = await this.service.cancelOrder(id);
    if (res.success && res.data) useOrdersStore.getState().upsert(res.data);
    return res;
  }

  /**
   * PAYMENTS_CONTRACT_SPEC §3: an order created BEFORE the gateway opened is
   * "payment pending" — a failed verification must mark it failed (never
   * leave a phantom pending order, and never mark it paid client-side).
   */
  async markPaymentFailed(id: string): Promise<ApiResult<Order>> {
    const res = await this.service.markPaymentFailed(id);
    if (res.success) useOrdersStore.getState().upsert(res.data);
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
      } else {
        // success with NO data: the order is not (or no longer) visible to
        // this account — deleted doc, wrong id, or another user's order. Map
        // results used to fall through BOTH branches, which polled forever
        // with the UI stuck at the loading state. Treat not-found as
        // terminal: surface it once and stop the poll; the Firestore
        // listener below remains for a doc that reappears.
        options.onError?.({
          code: "TRACKING_NOT_FOUND",
          message: "Order not found.",
        });
        return; // stop polling
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
              try {
                const res = await this.service.getTracking(id);
                if (!stopped && res.success && res.data) {
                  listener(res.data);
                }
              } catch (err: unknown) {
                logger.warn("orders.tracking_refresh_failed", {
                  id,
                  message: err instanceof Error ? err.message : String(err),
                });
              }
            })();
          },
          (err) => {
            logger.warn("orders.tracking_snapshot_failed", {
              id,
              message: err?.message,
            });
            options.onError?.({
              code: "TRACKING_SNAPSHOT_FAILED",
              message: err?.message || "Live tracking connection failed.",
            });
          },
        );
      } catch (err: unknown) {
        logger.warn("orders.tracking_bind_failed", {
          id,
          message: err instanceof Error ? err.message : String(err),
        });
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
