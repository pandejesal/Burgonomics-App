/**
 * Delivery-quote view model (R8) — the customer-facing contract for fee states,
 * shared by the checkout and payment screens so the two can never disagree.
 *
 * Copy is fixed here (never provider text):
 *  - loading: "Getting delivery price"
 *  - unserviceable: "Delivery isn't available to this address"
 *  - error/503: the same sentence plus a retry action
 *
 * PAY is enabled only when the server has quoted this order type. A delivery
 * quote never enables payment for a different fulfillment, and takeaway stays
 * selectable whenever delivery is unavailable.
 */
import type { PricingFulfillment } from "@/shared/pricing/pricingEngine";
import {
  isCheckoutFeesUsable,
  type CheckoutFeesState,
} from "@/features/checkout/state/checkoutFeesTypes";

export const GETTING_DELIVERY_PRICE = "Getting delivery price";
export const GETTING_ORDER_PRICE = "Getting your order price";
export const DELIVERY_UNAVAILABLE_COPY = "Delivery isn't available to this address";
export const DELIVERY_ADDRESS_REQUIRED_COPY = "Add a delivery address to see the delivery fee";
export const FEES_UNAVAILABLE_COPY = "We couldn't get your order price. Please try again.";

export interface DeliveryQuoteView {
  status: "idle" | "loading" | "ready" | "unserviceable" | "error";
  /** True only when the server has quoted the CURRENT order type and it is fresh. */
  payEnabled: boolean;
  /** True when a live delivery fee may be displayed. */
  showDeliveryFee: boolean;
  /** True when every bill figure on screen is server-quoted and final. */
  showTotal: boolean;
  deliveryFee: number | null;
  /** Server packaging figure, when known. */
  packagingFee: number | null;
  deliveryQuoteId: string | null;
  expiresAt: number | null;
  /** Banner copy for non-ready states. */
  message: string | null;
  canRetry: boolean;
  /** Takeaway must remain reachable whenever delivery cannot be quoted. */
  takeawaySelectable: boolean;
}

export function deliveryQuoteView(input: {
  state: CheckoutFeesState;
  fulfillment: PricingFulfillment | string | null | undefined;
  hasAddress: boolean;
  now?: number;
}): DeliveryQuoteView {
  const now = input.now ?? Date.now();
  const isDelivery = input.fulfillment === "delivery";
  const state = input.state;

  if (!isDelivery) {
    if (state.status === "ready") {
      return {
        status: "ready",
        payEnabled: true,
        showDeliveryFee: false,
        showTotal: true,
        deliveryFee: 0,
        packagingFee: state.packagingFee,
        deliveryQuoteId: null,
        expiresAt: null,
        message: null,
        canRetry: false,
        takeawaySelectable: false,
      };
    }
    if (state.status === "idle" || state.status === "loading") {
      return {
        status: state.status,
        payEnabled: false,
        showDeliveryFee: false,
        showTotal: false,
        deliveryFee: null,
        packagingFee: null,
        deliveryQuoteId: null,
        expiresAt: null,
        message: GETTING_ORDER_PRICE,
        canRetry: false,
        takeawaySelectable: false,
      };
    }
    return {
      status: state.status,
      payEnabled: false,
      showDeliveryFee: false,
      showTotal: false,
      deliveryFee: null,
      packagingFee: state.status === "unserviceable" ? state.packagingFee : null,
      deliveryQuoteId: null,
      expiresAt: null,
      message: FEES_UNAVAILABLE_COPY,
      canRetry: true,
      takeawaySelectable: false,
    };
  }

  const takeawaySelectable = true;

  if (!input.hasAddress) {
    return {
      status: "idle",
      payEnabled: false,
      showDeliveryFee: false,
      showTotal: false,
      deliveryFee: null,
      packagingFee: null,
      deliveryQuoteId: null,
      expiresAt: null,
      message: DELIVERY_ADDRESS_REQUIRED_COPY,
      canRetry: false,
      takeawaySelectable,
    };
  }

  if (state.status === "idle" || state.status === "loading") {
    return {
      status: state.status,
      payEnabled: false,
      showDeliveryFee: false,
      showTotal: false,
      deliveryFee: null,
      packagingFee: null,
      deliveryQuoteId: null,
      expiresAt: null,
      message: GETTING_DELIVERY_PRICE,
      canRetry: false,
      takeawaySelectable,
    };
  }

  if (state.status === "unserviceable") {
    return {
      status: "unserviceable",
      payEnabled: false,
      showDeliveryFee: false,
      showTotal: false,
      deliveryFee: null,
      packagingFee: state.packagingFee,
      deliveryQuoteId: null,
      expiresAt: null,
      message: DELIVERY_UNAVAILABLE_COPY,
      // The address, not the connection, is the problem: retrying the same
      // address cannot help. Takeaway stays available.
      canRetry: false,
      takeawaySelectable,
    };
  }

  if (state.status === "error") {
    return {
      status: "error",
      payEnabled: false,
      showDeliveryFee: false,
      showTotal: false,
      deliveryFee: null,
      packagingFee: null,
      deliveryQuoteId: null,
      expiresAt: null,
      message: DELIVERY_UNAVAILABLE_COPY,
      canRetry: true,
      takeawaySelectable,
    };
  }

  // ready
  if (!isCheckoutFeesUsable(state, now)) {
    return {
      status: "loading",
      payEnabled: false,
      showDeliveryFee: false,
      showTotal: false,
      deliveryFee: null,
      packagingFee: state.packagingFee,
      deliveryQuoteId: null,
      expiresAt: state.expiresAt,
      message: GETTING_DELIVERY_PRICE,
      canRetry: false,
      takeawaySelectable,
    };
  }

  return {
    status: "ready",
    payEnabled: true,
    showDeliveryFee: true,
    showTotal: true,
    deliveryFee: state.deliveryFee,
    packagingFee: state.packagingFee,
    deliveryQuoteId: state.deliveryQuoteId,
    expiresAt: state.expiresAt,
    message: null,
    canRetry: false,
    takeawaySelectable,
  };
}
