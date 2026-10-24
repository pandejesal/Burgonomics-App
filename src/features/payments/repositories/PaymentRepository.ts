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
import { useAuthStore, selectIsAuthenticated } from "@/features/auth/state/authStore";
import { useAddressStore, selectSelectedAddress } from "@/features/addresses";

import { useCheckoutStore } from "@/features/checkout/state/checkoutStore";
import { orderRepository } from "@/features/orders/repositories/OrderRepository";
import { usePaymentStore, loadPaymentReconciliation } from "@/features/payments/state/paymentStore";
import { toStoreSnapshot } from "@/features/orders/models";
import {
  checkMinimumOrder,
  minOrderShortfallMessage as minOrderMessage,
} from "@/shared/pricing/pricingEngine";

export class PaymentRepository {
  readonly name = "PaymentRepository";

  constructor(private readonly service = paymentsService) {}

  private lastFingerprint: string | null = null;
  private lastIdempotencyKey: string | null = null;

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
            message: minOrderMessage(check),
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
  }): Promise<ApiResult<PaymentOrder>> {
    const uid = useAuthStore.getState().user?.id ?? null;
    const pendingRecon = loadPaymentReconciliation(uid);
    if (pendingRecon || usePaymentStore.getState().reconciliationPending) {
      return fail(
        "PAYMENT_RECONCILIATION_PENDING",
        "Payment already received — order sync pending. Do not pay again.",
        false
      );
    }
    const totalsRes = await cartRepository.calculateTotals();
    if (!totalsRes.success) return totalsRes;

    const sel = useStoreSelection.getState();
    if (!sel.activeStore || !sel.fulfillment) {
      return fail("MISSING_CONTEXT", "Store and fulfillment method are required.");
    }
    const minCheck = checkMinimumOrder(
      totalsRes.data.subtotal,
      sel.fulfillment,
      sel.activeStore.pricing?.minOrderAmount,
    );
    if (!minCheck.met) {
      return fail("MIN_ORDER", minOrderMessage(minCheck), true);
    }

    const cart = useCartStore.getState();
    const auth = useAuthStore.getState();
    const address = selectSelectedAddress(useAddressStore.getState());
    const checkout = useCheckoutStore.getState();
    const loyaltyPointsToRedeem =
      opts?.loyaltyPointsToRedeem ?? checkout.loyaltyPointsToRedeem;
    const tipAmount = checkout.tipAmount;

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
    const pending = await orderRepository.createFromCurrentContext({
      confirmedOrderId:
        opts?.internalOrderId ?? usePaymentStore.getState().internalOrderId ?? undefined,
      paymentMethod: "online",
      paymentStatus: "pending",
      paymentLabel: "Pay Online",
    });
    if (!pending.success) return pending;
    usePaymentStore.getState().setInternalOrderId(pending.data.id);

    // Server reprices authoritatively from items + store pricing; the client
    // amount below is display-only. Loyalty/coupon/tip/branch are sent as
    // inputs (resolved above from opts with fallback to persisted checkout
    // state). Stable per checkout: retries reuse the open gateway order.
    const fingerprint = JSON.stringify([
      sel.activeStore.id,
      cart.lines.map((l) => [l.productId, l.quantity, l.unitPrice]),
      cart.promo?.code || null,
      loyaltyPointsToRedeem || 0,
      tipAmount || 0,
    ]);
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
      orderId: pending.data.id,
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
      idempotencyKey: this.idempotencyKeyFor(fingerprint),
      checkoutToken,
      checkoutSnapshot,
    });
    if (orderRes.success) {
      // Bind the gateway order to the pending internal order in one place so
      // verification can require the same gateway order (A3).
      usePaymentStore
        .getState()
        .setGatewayOrderId(orderRes.data.razorpayOrderId ?? orderRes.data.orderId ?? null);
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
        orderRes.error.code === "INVALID_AMOUNT" &&
        !usePaymentStore.getState().gatewayOrderId;
      if (provenPreflight) {
        await orderRepository.markPaymentFailed(pending.data.id).catch(() => undefined);
      } else {
        logger.warn("payments.create_order_failed_unproven_noncapture", {
          code: orderRes.error.code,
          internalOrderId: pending.data.id,
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
    const gatewayBound =
      !store.gatewayOrderId || store.gatewayOrderId === result.orderId;
    const pendingInternal =
      result.internalOrderId || !gatewayBound ? undefined : store.internalOrderId ?? undefined;
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
