/**
 * PaymentRepository — the single entry point the UI uses for anything
 * payment-related. Wraps `paymentsService` (transport) and adapts the
 * response envelope into stable shapes.
 *
 * Future backend wiring: replace the injected `service` with an
 * httpClient-backed implementation. Method signatures and returns
 * (ApiResult<T>) MUST stay identical so no screen changes are needed.
 *
 *   POST   /v1/payments/orders          → createOrder
 *   POST   /v1/payments/verify          → verifyPayment
 *   POST   /v1/payments/:id/cancel      → cancelPayment
 *   POST   /v1/payments/:id/retry       → retryPayment
 *   GET    /v1/payments/:id             → getPaymentStatus
 *   POST   /v1/payments/preflight       → validateForPayment
 */
import type { ApiResult } from "@/core/network/http";
import { fail, ok } from "@/core/network/http";
import { logger } from "@/core/logging/logger";
import type { CartTotals } from "@/features/cart/models";
import { paymentsService } from "@/features/payments/services/paymentsService";
import type {
  PaymentOrder,
  PaymentPreflight,
  PaymentResult,
  PaymentStatus,
  PaymentVerification,
} from "@/features/payments/models";
import { cartRepository } from "@/features/cart/repositories/CartRepository";
import { useCartStore } from "@/features/cart/state/cartStore";
import { useStoreSelection } from "@/features/stores/state/storeStore";
import {
  DEFAULT_DELIVERY_RADIUS_KM,
  getDeliveryDistanceKm,
  isStoreInDeliveryArea,
} from "@/features/stores/utils/serviceArea";
import { useAuthStore, selectIsAuthenticated } from "@/features/auth/state/authStore";
import { useAddressStore, selectSelectedAddress } from "@/features/addresses";

import { useCheckoutStore } from "@/features/checkout/state/checkoutStore";
import { orderRepository } from "@/features/orders/repositories/OrderRepository";
import { usePaymentStore, loadPaymentReconciliation } from "@/features/payments/state/paymentStore";
import { toStoreSnapshot, type Order } from "@/features/orders/models";
import { resumeContextFromOrder } from "@/features/payments/utils/resumeContext";
import { checkMinimumOrder, minOrderShortfallMessage } from "@/shared/pricing/pricingEngine";

export class PaymentRepository {
  readonly name = "PaymentRepository";

  constructor(private readonly service = paymentsService) {}

  private lastFingerprint: string | null = null;
  private lastIdempotencyKey: string | null = null;

  /**
   * CUS-09: the checkout this repository has ALREADY created — the internal
   * `orders/{id}` document plus the Razorpay order bound to it.
   *
   * `firestore.rules` only allows CREATE on `orders/{id}` (never a client
   * update), so re-running the create path for the same checkout is not a
   * harmless retry: `setDoc` is denied with "Missing or insufficient
   * permissions", the order surfaces as PERSIST_FAILED and the gateway never
   * opens. That is exactly what happened when a reprice acceptance (or a
   * retry after a dismissed modal / a gateway 500) re-entered
   * `createPaymentOrder`.
   *
   * This is the explicit "already persisted" signal: a second call for the
   * SAME fingerprint and the SAME internal order id reuses this record instead
   * of writing the document again. It is only ever set AFTER a successful
   * create — a genuine first-attempt persist failure still returns
   * PERSIST_FAILED and records nothing.
   */
  private createdCheckout: {
    fingerprint: string;
    /**
     * D1: the delivery quote this gateway order was minted against. A re-quote
     * (409 DELIVERY_QUOTE_EXPIRED, or an expiry refresh) changes the payable
     * amount, and the server answers a known idempotency key BEFORE it validates
     * the quote — so the cached gateway order may never be handed back for a
     * different quote. It then needs a new attempt on a new document.
     */
    deliveryQuoteId: string | null;
    internalOrderId: string;
    gatewayOrder: PaymentOrder | null;
  } | null = null;

  /**
   * Stable idempotency key per cart contents: retries of the same checkout
   * reuse the open gateway order instead of minting a second payable order.
   */
  private idempotencyKeyFor(fingerprint: string): string {
    if (this.lastFingerprint !== fingerprint) {
      this.lastFingerprint = fingerprint;
      this.lastIdempotencyKey = `chk_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
    }
    return this.lastIdempotencyKey as string;
  }

  // -- Preflight -------------------------------------------------------

  /**
   * Repository-owned checkout preflight. The frontend gets a single
   * boolean + a list of user-facing issues; backends can extend this
   * later without any component-level changes.
   */
  async validateForPayment(): Promise<ApiResult<PaymentPreflight>> {
    const cart = useCartStore.getState();
    const sel = useStoreSelection.getState();
    const auth = useAuthStore.getState();
    const address = selectSelectedAddress(useAddressStore.getState());

    const issues: PaymentPreflight["issues"] = [];

    if (cart.lines.length === 0) {
      issues.push({ code: "cart_empty", message: "Your cart is empty." });
    }
    if (!sel.activeStore) {
      issues.push({ code: "no_store", message: "Choose a store to continue." });
    }
    if (!sel.fulfillment) {
      issues.push({
        code: "no_fulfillment",
        message: "Choose a fulfillment method.",
      });
    }
    if (sel.fulfillment === "delivery" && !address) {
      issues.push({
        code: "no_address",
        message: "Add a delivery address to continue.",
      });
    }
    // CUS-02: delivery geofence. checkout.tsx has always blocked out-of-range
    // pins before placing an order, but the payment preflight (reachable by
    // deep-link / browser history straight to /payment) only checked that an
    // address EXISTED, so a pin hundreds of km away could be paid for and
    // dispatched. Same validator as checkout: per-store `deliveryRadiusKm`,
    // falling back to DEFAULT_DELIVERY_RADIUS_KM. Unknown coordinates stay
    // fail-open (documented isStoreInDeliveryArea semantics) — the existing
    // missing-pin gate on checkout is what blocks those.
    if (sel.fulfillment === "delivery" && address && sel.activeStore) {
      const lat = Number(address.lat);
      const lng = Number(address.lng);
      const storeLat = Number(sel.activeStore.lat);
      const storeLng = Number(sel.activeStore.lng);
      if (
        [lat, lng, storeLat, storeLng].every(Number.isFinite) &&
        !isStoreInDeliveryArea(sel.activeStore, lat, lng)
      ) {
        const radiusKm = sel.activeStore.deliveryRadiusKm ?? DEFAULT_DELIVERY_RADIUS_KM;
        const distanceKm = getDeliveryDistanceKm(sel.activeStore, lat, lng);
        issues.push({
          code: "out_of_range",
          message:
            `This address is ${distanceKm.toFixed(1)} km from the store — outside our ` +
            `${radiusKm} km delivery area. Switch to Takeaway or pick a nearer store.`,
        });
      }
    }
    if (!selectIsAuthenticated(auth)) {
      issues.push({
        code: "not_authenticated",
        message: "Sign in to complete your payment.",
      });
    }
    // Min-order gate: the pricing code exists but was never enforced
    // pre-gateway. Block here with the shortfall, not at the gateway.
    if (sel.activeStore && cart.lines.length > 0) {
      const totalsRes = await cartRepository.calculateTotals();
      if (totalsRes.success) {
        const check = checkMinimumOrder(
          totalsRes.data.subtotal,
          sel.fulfillment,
          sel.activeStore.pricing?.minOrderAmount,
        );
        if (!check.met) {
          issues.push({
            code: "min_order",
            message: minOrderShortfallMessage(check),
          });
        }
      }
    }
    // Closed-store gate: never open the gateway for a closed store.
    if (sel.activeStore && sel.activeStore.isOpen === false) {
      issues.push({
        code: "closed_store",
        message: "This store is currently closed. Try again during opening hours.",
      });
    }

    if (issues.length === 0) {
      const cartCheck = await cartRepository.validateCart();
      if (!cartCheck.success || !cartCheck.data.valid) {
        issues.push({
          code: "cart_invalid",
          message: cartCheck.success
            ? (cartCheck.data.issues[0]?.message ?? "Some items are no longer available.")
            : cartCheck.error.message,
        });
      }
    }

    return ok({ valid: issues.length === 0, issues });
  }

  // -- Order lifecycle -------------------------------------------------

  async createPaymentOrder(opts?: {
    loyaltyPointsToRedeem?: number;
    internalOrderId?: string;
    /**
     * R8: the server courier quote this checkout was priced from. Callers pass
     * the live quote; when omitted the repository reads the current ready quote
     * (delivery only) so a screen cannot accidentally send a payment without it.
     */
    deliveryQuoteId?: string;
    /**
     * CUS-16: finish paying for an order that already exists (created before
     * Razorpay opened, then abandoned). The server asserts that doc is unpaid
     * and owned by this customer; the client must NOT create another order.
     */
    resumeOrderId?: string;
    /**
     * CUS-16 follow-up: the ORDER DOCUMENT being resumed. When present the
     * attempt is priced from that document — its store, fulfillment, items,
     * total and address — and NOT from the cart, which is normally empty by
     * the time a customer returns to an unpaid order. Nothing is written.
     */
    resumeOrder?: Order;
  }): Promise<ApiResult<PaymentOrder>> {
    const uid = useAuthStore.getState().user?.id ?? null;
    const pendingRecon = loadPaymentReconciliation(uid);
    if (pendingRecon || usePaymentStore.getState().reconciliationPending) {
      return fail(
        "PAYMENT_RECONCILIATION_PENDING",
        "Payment already received — order sync pending. Do not pay again.",
        false,
      );
    }
    const resumeOrder = opts?.resumeOrder ?? null;
    const resume = resumeContextFromOrder(resumeOrder);
    // Resuming is priced from the order document; a cart read would bill ₹0
    // (empty cart) or, worse, a different basket than the one on file.
    const totalsRes: ApiResult<CartTotals> = resume
      ? ok(resume.totals)
      : await cartRepository.calculateTotals();
    if (!totalsRes.success) return totalsRes;

    const sel = resume
      ? {
          activeStore: resume.store,
          fulfillment: resume.fulfillment,
        }
      : useStoreSelection.getState();
    if (!sel.activeStore || !sel.fulfillment) {
      return fail("MISSING_CONTEXT", "Store and fulfillment method are required.");
    }

    const cart = resume ? resume.cart : useCartStore.getState();
    const auth = useAuthStore.getState();
    const address = resume ? resume.address : selectSelectedAddress(useAddressStore.getState());
    const checkout = useCheckoutStore.getState();
    // R8/D1: the delivery fee is server-quoted and the payment create binds to
    // that exact quote. Resolved ONCE here — before any reuse decision — so the
    // cached gateway order and the create call can never disagree about which
    // quote they belong to. Off-delivery there is no quote id at all.
    const deliveryQuoteId =
      sel.fulfillment === "delivery"
        ? (opts?.deliveryQuoteId ??
          (checkout.checkoutFees.status === "ready"
            ? (checkout.checkoutFees.deliveryQuoteId ?? undefined)
            : undefined))
        : undefined;
    // D31–D33: loyalty redemption is not offered to customers any more. The
    // transport pins 0 unconditionally — an explicit caller argument, a legacy
    // persisted value, or a deep link without the cart cannot redeem points.
    void opts?.loyaltyPointsToRedeem;
    const loyaltyPointsToRedeem = 0;
    const tipAmount = resume ? resume.tipAmount : checkout.tipAmount;

    const checkoutSnapshot = {
      store: toStoreSnapshot(sel.activeStore),
      fulfillment: sel.fulfillment,
      items: cart.lines.map((l) => ({
        id: l.productId,
        productId: l.productId,
        price: l.unitPrice,
        unitPrice: l.unitPrice,
        name: l.name,
        quantity: l.quantity,
        customizations: l.customizations,
      })),
      totals: totalsRes.data,
      promo: cart.promo,
      address: address
        ? {
            label: address.label,
            contactName: address.contactName || auth.user?.name || "",
            contactPhone: address.contactPhone || auth.user?.phone || "",
            line1: address.line1,
            line2: address.line2,
            city: address.city,
            state: address.state || "",
            pincode: address.pincode,
          }
        : null,
      notes: checkout.orderNotes,
      fulfillmentInstructions:
        sel.fulfillment === "delivery"
          ? checkout.deliveryInstructions
          : sel.fulfillment === "takeaway"
            ? checkout.pickupInstructions
            : checkout.diningNotes,
      userId: auth.user?.id,
      tipAmount,
      loyaltyPointsToRedeem,
    };

    // Checkout fingerprint: identifies "this attempt" — same store, same
    // fulfillment (mode), same drop pin/address, same cart lines/prices, same
    // promo/loyalty/tip. Computed BEFORE anything is created so a re-entry can
    // recognise the checkout it already persisted (CUS-09).
    // Server reprices authoritatively from items + store pricing; the client
    // amount below is display-only.
    // CUS-16: a resumed attempt is identified by the ORDER id too. Two
    // different unpaid orders can carry the same basket, and the server binds
    // an idempotency key to one order (a live intent for another is refused);
    // the key must therefore never be shared across orders.
    //
    // D1: the mode and the delivery DROP ADDRESS are part of the identity. A
    // takeaway order must never reuse the pending delivery document (which
    // carries the old mode + address), and a changed address is a different
    // delivery even when the map pin is identical (a moved flat/floor or a new
    // contact at the same building). The identity therefore binds the ACTUAL
    // address snapshot the order is created from — every field the document
    // carries — plus the coordinates, which the snapshot omits. Off-delivery
    // there is no address context: an unused selected address must not
    // invalidate a takeaway checkout.
    const snapshotAddress = checkoutSnapshot.address;
    const contextAddressKey =
      sel.fulfillment === "delivery" && snapshotAddress
        ? [
            snapshotAddress.label,
            snapshotAddress.contactName,
            snapshotAddress.contactPhone,
            snapshotAddress.line1,
            snapshotAddress.line2 ?? null,
            snapshotAddress.city,
            snapshotAddress.state,
            snapshotAddress.pincode,
            address?.lat ?? null,
            address?.lng ?? null,
          ]
        : null;
    const fingerprint = JSON.stringify([
      opts?.resumeOrderId?.trim() || null,
      sel.activeStore.id,
      sel.fulfillment,
      contextAddressKey,
      cart.lines.map((l) => [l.productId, l.quantity, l.unitPrice]),
      cart.promo?.code || null,
      loyaltyPointsToRedeem || 0,
      tipAmount || 0,
    ]);

    const requestedInternalId =
      opts?.internalOrderId ?? usePaymentStore.getState().internalOrderId ?? null;
    const recorded =
      this.createdCheckout &&
      this.createdCheckout.fingerprint === fingerprint &&
      requestedInternalId === this.createdCheckout.internalOrderId
        ? this.createdCheckout
        : null;

    // D1: a gateway order already minted for this checkout may only be reused
    // while it is still bound to the SAME delivery quote. The server's
    // idempotency map answers BEFORE it validates the quote
    // (`razorpay.service.ts`: reuse intent → verify order/cart/availability →
    // *then* quote), so re-sending the old key after a re-quote would hand back
    // the OLD gateway order and amount — that is, relabel a stale payable order
    // as the new fare. Never that.
    const quoteChangedAfterGateway =
      !!recorded?.gatewayOrder && recorded.deliveryQuoteId !== (deliveryQuoteId ?? null);
    // A re-quote AFTER a live gateway order therefore needs a NEW idempotent
    // attempt: a fresh key (the old key still resolves to the old intent) bound
    // to a fresh pending document (the old one describes the previous fare and
    // cannot be rewritten — firestore.rules allow create only). The previous
    // document and gateway order are left untouched for the server to expire.
    // A 409 BEFORE any gateway attempt is unaffected: `recorded.gatewayOrder`
    // is null there, so the same document AND key are retried idempotently.
    const requiresFreshAttempt = !opts?.resumeOrderId && quoteChangedAfterGateway;

    // D1: the requested id may belong to the document of a DIFFERENT checkout
    // (mode switched delivery→takeaway, the drop pin moved, the basket
    // changed) or to the previous fare after a re-quote. Adopting it would bind
    // the new order to a document that still describes the old one — and
    // `firestore.rules` refuse to rewrite it. Such an id is not reusable: a
    // fresh pending document is created and the old one is left untouched for
    // the server to expire.
    const requestedIdBelongsToOtherCheckout =
      requestedInternalId !== null &&
      this.createdCheckout !== null &&
      this.createdCheckout.fingerprint !== fingerprint &&
      requestedInternalId === this.createdCheckout.internalOrderId;
    const adoptableInternalId =
      requiresFreshAttempt || requestedIdBelongsToOtherCheckout ? null : requestedInternalId;

    // A gateway order already minted for this exact checkout is reused as-is:
    // exactly ONE Razorpay order per attempt, on the server's own amount, and
    // no second order write or network round-trip.
    if (
      !opts?.resumeOrderId &&
      recorded?.gatewayOrder &&
      !quoteChangedAfterGateway
    ) {
      usePaymentStore.getState().setInternalOrderId(recorded.internalOrderId);
      usePaymentStore
        .getState()
        .setGatewayOrderId(
          recorded.gatewayOrder.razorpayOrderId ?? recorded.gatewayOrder.orderId ?? null,
        );
      return ok(recorded.gatewayOrder);
    }

    // The checkout token would normally come from the cart-prepare step
    // and be signed by the backend. Mock: request one.
    const prep = await cartRepository.prepareCheckout();
    const checkoutToken = prep.success ? prep.data.checkoutToken : undefined;

    // PAYMENTS_CONTRACT_SPEC §3: an internal `orders/{id}` doc MUST exist
    // before the gateway opens, so the Razorpay order binds to a real, unpaid
    // order the server can price and hand to the kitchen. Creating it here
    // (rather than per screen) means no caller can open Razorpay without that
    // binding. The id lives in the payment store so retries re-create the
    // SAME doc instead of a second order for one checkout.
    //
    // CUS-09: when THIS checkout's document was already created successfully,
    // reuse it — never write it again (the second write is an UPDATE, which
    // firestore.rules deny, and it surfaced as PERSIST_FAILED).
    let internalOrderId: string;
    const resumeOrderId = opts?.resumeOrderId?.trim() || null;
    if (resumeOrderId) {
      // RESUMING an abandoned unpaid order: the document already exists and
      // firestore.rules allow create only, so writing it again would be denied
      // (the CUS-09 trap) and would also duplicate the order in the customer's
      // history. Bind the gateway order to the existing id.
      internalOrderId = resumeOrderId;
      usePaymentStore.getState().setInternalOrderId(resumeOrderId);
    } else if (recorded && !requiresFreshAttempt) {
      internalOrderId = recorded.internalOrderId;
    } else {
      const pending = await orderRepository.createFromCurrentContext({
        // D1: a requested id that belongs to another checkout's document is
        // never adopted — that doc still describes the old mode/address.
        confirmedOrderId: adoptableInternalId ?? undefined,
        paymentMethod: "online",
        paymentStatus: "pending",
        paymentLabel: "Pay Online",
      });
      if (!pending.success) return pending;
      internalOrderId = pending.data.id;
      this.createdCheckout = {
        fingerprint,
        deliveryQuoteId: deliveryQuoteId ?? null,
        internalOrderId,
        gatewayOrder: null,
      };
    }
    usePaymentStore.getState().setInternalOrderId(internalOrderId);

    const orderRes = await this.service.createOrder({
      amount: totalsRes.data.grandTotal,
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
      storeId: sel.activeStore.id,
      // PAYMENTS_CONTRACT_SPEC §1: `orderType` is canonical (server enum is
      // delivery | takeaway | dinein — the app's Fulfillment maps 1:1).
      // `fulfillment` stays as the legacy alias for pre-contract servers.
      orderType: sel.fulfillment,
      fulfillment: sel.fulfillment,
      // PAYMENTS_CONTRACT_SPEC §1/§3: the internal order id above, so the
      // server can refuse to charge for an already-paid or foreign order.
      orderId: internalOrderId,
      branchId: sel.activeStore.partnerBranchId ?? undefined,
      items: cart.lines.map((l) => ({
        id: l.productId,
        productId: l.productId,
        price: l.unitPrice,
        unitPrice: l.unitPrice,
        name: l.name,
        quantity: l.quantity,
        customizations: l.customizations,
        modifiers: l.modifiers,
      })),
      couponCode: cart.promo?.code,
      loyaltyPointsToRedeem,
      tipAmount,
      deliveryQuoteId,
      // D1: the idempotency key is derived from the checkout identity PLUS the
      // document this attempt is bound to, resolved AFTER the document exists.
      //   - a re-quote after a live gateway order mints a NEW document, so the
      //     key changes and the server cannot answer from the old intent
      //     (it resolves a known key BEFORE it validates the quote);
      //   - a 409 reprice on the SAME document, and any unchanged retry of a
      //     failed/ambiguous gateway call, keep the SAME key — including when
      //     the retry now sees `gatewayOrder: null` and no longer looks like a
      //     "fresh attempt".
      idempotencyKey: this.idempotencyKeyFor(
        JSON.stringify([fingerprint, internalOrderId]),
      ),
      checkoutToken,
      checkoutSnapshot,
    });
    if (orderRes.success) {
      // Bind the gateway order to the pending internal order in one place so
      // verification can require the same gateway order (A3).
      usePaymentStore
        .getState()
        .setGatewayOrderId(orderRes.data.razorpayOrderId ?? orderRes.data.orderId ?? null);
      // Record the gateway order against the checkout that already owns the
      // internal document, so a retry reuses this SAME payable order (CUS-09)
      // — but only while it is still bound to the same delivery quote (D1).
      this.createdCheckout = {
        fingerprint,
        deliveryQuoteId: deliveryQuoteId ?? null,
        internalOrderId,
        gatewayOrder: orderRes.data,
      };
    } else {
      // Flip the pending internal order to failed ONLY when the failure is
      // provably pre-gateway: `INVALID_AMOUNT` is refused by the transport
      // before any HTTP request, and no gateway order is bound to this
      // checkout. Every transport/HTTP failure may have minted the gateway
      // order (the idempotent 503-retry path exists for exactly that) and an
      // earlier attempt may already have captured — marking failed there
      // poisons the local order while the server keeps it pending (A08 B2),
      // so those stay untouched and honest (`paymentStatus: pending`) for the
      // server-owned `payment.failed` webhook to resolve.
      const provenPreflight =
        orderRes.error.code === "INVALID_AMOUNT" && !usePaymentStore.getState().gatewayOrderId;
      if (provenPreflight) {
        await orderRepository.markPaymentFailed(internalOrderId).catch(() => undefined);
      } else {
        logger.warn("payments.create_order_failed_unproven_noncapture", {
          code: orderRes.error.code,
          internalOrderId,
        });
      }
    }
    return orderRes;
  }

  verifyPayment(result: PaymentResult): Promise<ApiResult<PaymentVerification>> {
    // checkout opens the gateway without stamping the pending internal order
    // id onto `PaymentResult`. Attach it centrally here (from the payment
    // store) so verification always binds to the internal order instead of
    // the gateway id. Do not require every screen to remember this.
    const store = usePaymentStore.getState();
    const gatewayBound = !store.gatewayOrderId || store.gatewayOrderId === result.orderId;
    const pendingInternal =
      result.internalOrderId || !gatewayBound ? undefined : (store.internalOrderId ?? undefined);
    const enriched: PaymentResult =
      result.internalOrderId || !pendingInternal
        ? result
        : { ...result, internalOrderId: pendingInternal };
    return this.service.verify(enriched);
  }

  cancelPayment(orderId: string): Promise<ApiResult<null>> {
    return this.service.cancel(orderId);
  }

  /**
   * Retry mirrors createPaymentOrder — the backend will decide whether
   * to reuse the existing gateway order or mint a new one.
   */
  retryPayment(): Promise<ApiResult<PaymentOrder>> {
    return this.createPaymentOrder();
  }

  getPaymentStatus(orderId: string): Promise<ApiResult<PaymentStatus>> {
    return this.service.getStatus(orderId);
  }
}

export const paymentRepository = new PaymentRepository();
