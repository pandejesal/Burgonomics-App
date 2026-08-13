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
import { toStoreSnapshot } from "@/features/orders/models";

export class PaymentRepository {
  readonly name = "PaymentRepository";

  constructor(private readonly service = paymentsService) {}

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

  async createPaymentOrder(): Promise<ApiResult<PaymentOrder>> {
    const totalsRes = await cartRepository.calculateTotals();
    if (!totalsRes.success) return totalsRes;

    const sel = useStoreSelection.getState();
    if (!sel.activeStore || !sel.fulfillment) {
      return fail("MISSING_CONTEXT", "Store and fulfillment method are required.");
    }

    const cart = useCartStore.getState();
    const auth = useAuthStore.getState();
    const address = selectSelectedAddress(useAddressStore.getState());
    const checkout = useCheckoutStore.getState();

    const checkoutSnapshot = {
      store: toStoreSnapshot(sel.activeStore),
      fulfillment: sel.fulfillment,
      items: cart.lines,
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
    };

    // The checkout token would normally come from the cart-prepare step
    // and be signed by the backend. Mock: request one.
    const prep = await cartRepository.prepareCheckout();
    const checkoutToken = prep.success ? prep.data.checkoutToken : undefined;

    return this.service.createOrder({
      amount: totalsRes.data.grandTotal,
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
      storeId: sel.activeStore.id,
      fulfillment: sel.fulfillment,
      checkoutToken,
      checkoutSnapshot,
    });
  }

  verifyPayment(result: PaymentResult): Promise<ApiResult<PaymentVerification>> {
    return this.service.verify(result);
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
