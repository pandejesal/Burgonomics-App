/**
 * useCheckoutFees (R8) — keeps a server quote alive for the checkout/payment
 * screens.
 *
 * Quotes on entry and whenever the address, store or fulfillment changes; the
 * coordinator drops stale answers, so an in-flight quote for the previous
 * address can never land on the new one. Re-quotes shortly after expiry so a
 * customer who sat on the screen is never charged against a dead quote.
 */
import * as React from "react";
import { useHydrated } from "@/shared/hooks/useHydrated";
import { useStoreSelection } from "@/features/stores/state/storeStore";
import { useAddressStore, selectSelectedAddress } from "@/features/addresses";
import { asPricingFulfillment } from "@/shared/pricing/pricingEngine";
import { useCheckoutStore } from "@/features/checkout/state/checkoutStore";
import {
  QUOTE_REFRESH_GRACE_MS,
  buildCheckoutFeesContext,
  checkoutFeesKey,
  type CheckoutFeesState,
} from "@/features/checkout/state/checkoutFeesTypes";
import { quoteCheckoutFees } from "@/features/checkout/services/checkoutQuote";
import {
  deliveryQuoteView,
  type DeliveryQuoteView,
} from "@/features/checkout/utils/deliveryQuoteView";

export interface UseCheckoutFeesResult {
  state: CheckoutFeesState;
  view: DeliveryQuoteView;
  /** Forces a fresh quote (retry button, 409 recovery). Resolves with the state. */
  refresh: () => Promise<CheckoutFeesState>;
}

export function useCheckoutFees(): UseCheckoutFeesResult {
  const hydrated = useHydrated();
  const fulfillment = useStoreSelection((s) => s.fulfillment);
  const activeStore = useStoreSelection((s) => s.activeStore);
  const address = useAddressStore(selectSelectedAddress);
  const state = useCheckoutStore((s) => s.checkoutFees);

  const orderType = asPricingFulfillment(fulfillment);
  const storeId = activeStore?.id ?? null;
  const branchId = activeStore?.partnerBranchId ?? null;
  const dropLat = address?.lat ?? null;
  const dropLng = address?.lng ?? null;

  const ctx = React.useMemo(
    () => buildCheckoutFeesContext({ storeId, branchId, orderType, dropLat, dropLng }),
    [storeId, branchId, orderType, dropLat, dropLng],
  );
  const key = checkoutFeesKey(ctx);
  const ctxRef = React.useRef(ctx);
  ctxRef.current = ctx;

  React.useEffect(() => {
    if (!hydrated) return;
    void quoteCheckoutFees(ctx);
  }, [hydrated, key, ctx]);

  // R8: re-quote on expiry. A quote that dies while the screen is open must
  // never be retried on the stale fare.
  const expiresAt = state.status === "ready" ? state.expiresAt : null;
  React.useEffect(() => {
    if (!hydrated || expiresAt === null) return;
    const delay = Math.max(0, expiresAt - Date.now()) + QUOTE_REFRESH_GRACE_MS;
    const timer = setTimeout(() => {
      void quoteCheckoutFees(ctxRef.current);
    }, delay);
    return () => clearTimeout(timer);
  }, [hydrated, expiresAt, key]);

  const refresh = React.useCallback(() => quoteCheckoutFees(ctxRef.current), []);

  const view = deliveryQuoteView({
    state,
    fulfillment: orderType,
    hasAddress: dropLat !== null && dropLng !== null,
  });

  return { state, view, refresh };
}
