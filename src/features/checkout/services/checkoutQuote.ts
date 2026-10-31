/**
 * Checkout quote coordinator (R8).
 *
 * Single entry point for asking the server what delivery + packaging cost for
 * the CURRENT basket context. It owns the staleness rule:
 *
 *   - every call takes a new sequence token from the store;
 *   - a response is applied only when its token AND context key are still the
 *     newest (`applyCheckoutFees` returns false otherwise).
 *
 * So an address change during an in-flight quote can never show (or pay) the
 * previous address's fare, even when the older HTTP response resolves later.
 */
import { requestCheckoutFees } from "@/features/checkout/services/deliveryQuoteService";
import { useCheckoutStore } from "@/features/checkout/state/checkoutStore";
import {
  checkoutFeesKey,
  type CheckoutFeesContext,
  type CheckoutFeesState,
} from "@/features/checkout/state/checkoutFeesTypes";

export interface QuoteCheckoutFeesDeps {
  request?: typeof requestCheckoutFees;
}

/** Quotes the fees for `ctx` and stores the result if it is still current. */
export async function quoteCheckoutFees(
  ctx: CheckoutFeesContext,
  deps: QuoteCheckoutFeesDeps = {},
): Promise<CheckoutFeesState> {
  const request = deps.request ?? requestCheckoutFees;
  const key = checkoutFeesKey(ctx);
  const store = useCheckoutStore.getState();
  const seq = store.beginFeesRequest(key);

  // No store selected yet, or delivery without a pinned address: there is
  // nothing the server could price. Idle keeps PAY disabled without inventing
  // a fee (the screens explain what is missing).
  if (!ctx.storeId || (ctx.orderType === "delivery" && (ctx.dropLat === null || ctx.dropLng === null))) {
    useCheckoutStore.getState().applyCheckoutFees(seq, key, { status: "idle" });
    return useCheckoutStore.getState().checkoutFees;
  }

  const res = await request(ctx);
  if (!res.success) {
    useCheckoutStore.getState().applyCheckoutFees(seq, key, { status: "error" });
    return useCheckoutStore.getState().checkoutFees;
  }

  const next: CheckoutFeesState = res.data.serviceable
    ? {
        status: "ready",
        orderType: ctx.orderType,
        packagingFee: res.data.packagingFee,
        deliveryFee: res.data.deliveryFee,
        deliveryQuoteId: res.data.deliveryQuoteId,
        provider: res.data.provider,
        expiresAt: res.data.expiresAt,
      }
    : {
        status: "unserviceable",
        packagingFee: res.data.packagingFee,
        reason: res.data.reason,
        message: res.data.message,
      };

  const current = useCheckoutStore.getState();
  if (seq !== current.feesRequestSeq || key !== current.feesKey) {
    // A newer request (new address/store/fulfillment) has already started —
    // this answer is stale and must never reach the screen.
    return current.checkoutFees;
  }
  current.applyCheckoutFees(seq, key, next);
  return useCheckoutStore.getState().checkoutFees;
}
