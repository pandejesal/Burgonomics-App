/**
 * CUS-16 follow-up: the payment context for RESUMING an existing unpaid order.
 *
 * "Complete payment" opens `/payment?orderId=…` and by then the cart is
 * usually empty (the customer paid from history, or a reload dropped the local
 * cart). The payment attempt must therefore be priced from the ORDER DOCUMENT:
 * its outlet, fulfillment, lines, tip and total. Nothing here writes anything,
 * and nothing here invents a value the document does not carry.
 */
import type { Order, OrderAddressSnapshot, OrderStoreSnapshot } from "@/features/orders/models";
import type { Address } from "@/features/addresses/models";
import type { CartLine, CartTotals } from "@/features/cart/models";
import type { Store } from "@/features/stores/models/Store";
import type { CheckoutFeesState } from "@/features/checkout/state/checkoutFeesTypes";
import { isCheckoutFeesUsable } from "@/features/checkout/state/checkoutFeesTypes";
import type { Fulfillment } from "@/features/stores/models/Store";

export interface ResumePaymentContext {
  /** Outlet snapshot from the order document (display + storeId/branchId). */
  store: Store;
  fulfillment: Fulfillment;
  cart: { lines: CartLine[]; promo: Order["promo"] };
  totals: CartTotals;
  address: Address | null;
  tipAmount: number;
}

const ZERO_TOTALS: CartTotals = {
  subtotal: 0,
  itemDiscount: 0,
  promoDiscount: 0,
  taxes: 0,
  cgst: 0,
  sgst: 0,
  gstRate: 0.05,
  deliveryFee: 0,
  packingFee: 0,
  grandTotal: 0,
  currency: "INR",
};

function num(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Order store snapshot → the `Store` model the screens read. Only fields the
 * document actually carries are filled; everything unknown stays explicitly
 * empty (no invented phone, hours, radius or open-state).
 */
export function storeFromOrderSnapshot(
  snapshot: OrderStoreSnapshot,
  fulfillment: Fulfillment,
): Store {
  return {
    id: snapshot.id,
    name: snapshot.name,
    address: snapshot.addressLine1 || snapshot.address,
    city: snapshot.city,
    area: snapshot.area,
    lat: num(snapshot.lat, Number.NaN),
    lng: num(snapshot.lng, Number.NaN),
    phone: snapshot.phone ?? "",
    imageUrl: null,
    hours: null,
    // Unknown, not "open": nothing in the order document proves otherwise.
    isOpen: undefined,
    isBusy: false,
    isRecentlyOpened: false,
    // The order was placed with exactly this mode, so that mode is supported.
    supports: {
      delivery: fulfillment === "delivery",
      takeaway: fulfillment === "takeaway",
      dineIn: fulfillment === "dinein",
    },
    etaMinutes: typeof snapshot.etaMinutes === "number" ? snapshot.etaMinutes : null,
    pickupEtaMinutes:
      typeof snapshot.pickupEtaMinutes === "number" ? snapshot.pickupEtaMinutes : null,
    petpoojaRestId: snapshot.petpoojaRestId ?? null,
    partnerBranchId: snapshot.partnerBranchId ?? null,
  };
}

/** Order address snapshot → the `Address` model checkout renders. */
export function addressFromOrderSnapshot(
  snapshot: OrderAddressSnapshot | undefined,
): Address | null {
  if (!snapshot || typeof snapshot.line1 !== "string" || !snapshot.line1.trim()) return null;
  return {
    id: `order:${snapshot.line1}`,
    label: snapshot.label === "home" || snapshot.label === "work" ? snapshot.label : "other",
    customLabel: snapshot.label === "home" || snapshot.label === "work" ? undefined : snapshot.label,
    contactName: snapshot.contactName,
    contactPhone: snapshot.contactPhone,
    line1: snapshot.line1,
    line2: snapshot.line2,
    landmark: snapshot.landmark,
    city: snapshot.city,
    state: snapshot.state,
    pincode: snapshot.pincode,
    lat: typeof snapshot.lat === "number" && Number.isFinite(snapshot.lat) ? snapshot.lat : undefined,
    lng: typeof snapshot.lng === "number" && Number.isFinite(snapshot.lng) ? snapshot.lng : undefined,
    isDefault: false,
  };
}

/** The cart totals stored on the document (never recomputed from the cart). */
export function totalsFromOrder(order: Order): CartTotals {
  const t = order.totals;
  if (!t || typeof t !== "object") return { ...ZERO_TOTALS };
  const subtotal = num(t.subtotal);
  const itemDiscount = num(t.itemDiscount);
  const promoDiscount = num(t.promoDiscount);
  const deliveryFee = num(t.deliveryFee);
  const packingFee = num(t.packingFee);
  const stored = num(t.grandTotal, Number.NaN);
  return {
    subtotal,
    itemDiscount,
    promoDiscount,
    taxes: num(t.taxes),
    cgst: num(t.cgst),
    sgst: num(t.sgst),
    gstRate: num(t.gstRate, 0.05),
    deliveryFee,
    packingFee,
    // R2: the shape of the total, so a document missing `grandTotal` still
    // produces the same arithmetic instead of a silent zero.
    grandTotal: Number.isFinite(stored)
      ? stored
      : Math.round(
          Math.max(0, subtotal - itemDiscount - promoDiscount + packingFee + deliveryFee) * 100,
        ) / 100,
    currency: "INR",
  };
}

/**
 * Everything the payment screen needs to bill the ORDER instead of the cart.
 * `null` when the document does not name an outlet it can price against.
 */
export function resumeContextFromOrder(order: Order | null): ResumePaymentContext | null {
  if (!order) return null;
  const fulfillment: Fulfillment =
    order.fulfillment === "takeaway" || order.fulfillment === "dinein"
      ? order.fulfillment
      : "delivery";
  const storeSnapshot = order.store;
  if (!storeSnapshot || typeof storeSnapshot.id !== "string" || !storeSnapshot.id) return null;
  return {
    store: storeFromOrderSnapshot(storeSnapshot, fulfillment),
    fulfillment,
    cart: {
      lines: Array.isArray(order.items) ? order.items : [],
      promo: order.promo ?? null,
    },
    totals: totalsFromOrder(order),
    address: addressFromOrderSnapshot(order.deliveryAddress ?? order.address),
    tipAmount: typeof order.tipAmount === "number" && Number.isFinite(order.tipAmount)
      ? order.tipAmount
      : 0,
  };
}

/**
 * What to DISPLAY as this order's bill. The stored document is the base; when
 * the server has just re-quoted the delivery/packaging fee for this order, the
 * re-quoted figure is the one the server will charge, so it replaces the
 * stored one (the customer sees the price that will actually be taken, and the
 * existing acceptance dialog covers any remaining difference).
 */
export function resumeDisplayTotals(
  totals: CartTotals,
  fees: CheckoutFeesState,
  fulfillment: Fulfillment,
  now: number = Date.now(),
): CartTotals {
  if (!isCheckoutFeesUsable(fees, now) || fees.status !== "ready") return totals;
  const packaging = fees.packagingFee;
  const delivery = fulfillment === "delivery" ? fees.deliveryFee : 0;
  const grandTotal =
    Math.round(
      Math.max(
        0,
        totals.subtotal - totals.itemDiscount - totals.promoDiscount + packaging + delivery,
      ) * 100,
    ) / 100;
  return { ...totals, packingFee: packaging, deliveryFee: delivery, grandTotal };
}
