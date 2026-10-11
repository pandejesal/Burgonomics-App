/**
 * Canonical Pricing Engine
 * Shared between client application and serverless execution environments.
 *
 * Strict-Mode: Calculates authoritative order subtotals, the GST already
 * embedded in those subtotals, packaging fees, delivery fees, promo
 * discounts, and the grand total according to the launch pricing schedule.
 *
 * Two rules the whole app depends on:
 *
 *  1. MENU PRICES ARE GST-INCLUSIVE. Every price on the menu already carries
 *     5% GST (CGST 2.5% + SGST 2.5%). The engine therefore REPORTS the tax
 *     as a component of the subtotal — it is never added on top. The old
 *     `subtotal + taxes + fees` formula made a ₹299 burger cost ₹313.90.
 *
 *  2. Fees are per-ORDER and per-FULFILLMENT, never per-item. See
 *     `resolvePricingConfig` — the only place a fee schedule is built.
 */

/** Total GST rate embedded in every menu price. */
export const GST_RATE = 0.05;
/** Central GST half of `GST_RATE` — intra-state supply. */
export const CGST_RATE = GST_RATE / 2;
/** State GST half of `GST_RATE` — intra-state supply. */
export const SGST_RATE = GST_RATE / 2;

export type PricingFulfillment = "delivery" | "takeaway" | "dinein";

export interface PricingConfig {
  /** GST rate already contained in `subtotal`. */
  gstRate: number;
  /** Flat packaging charge for the whole order (₹), by fulfillment mode. */
  packagingFee: number;
  /** Flat delivery charge (₹) from the delivery quote. Always 0 off-delivery. */
  deliveryFee: number;
  /** Minimum basket subtotal (₹). 0 = no minimum. */
  minOrderAmount: number;
}

export type StorePricingConfig = Partial<PricingConfig>;

/**
 * Flat packaging charge per order (₹). Delivery and takeaway both leave the
 * kitchen sealed in a box/bag (₹20); dine-in is served on the plate (₹0).
 */
export const PACKAGING_FEE_BY_FULFILLMENT: Record<PricingFulfillment, number> = {
  delivery: 20,
  takeaway: 20,
  dinein: 0,
};

/**
 * Sandbox delivery quote (₹). The live quote service replaces this per order;
 * until it is wired this is the number the customer is shown AND charged, so
 * the two can never disagree.
 */
export const DEFAULT_DELIVERY_QUOTE_FEE = 35;

/** Delivery-only minimum basket subtotal (₹). Takeaway and dine-in have none. */
export const DELIVERY_MIN_ORDER_AMOUNT = 149;

/** Customer-facing copy for a sub-minimum delivery basket. */
export const DELIVERY_MIN_ORDER_MESSAGE = `Minimum order value for delivery is ₹${DELIVERY_MIN_ORDER_AMOUNT}.`;

/** Free delivery threshold (₹) for legacy promo parity. */
export const FREE_DELIVERY_THRESHOLD = 499;
/** Flat delivery fee fallback (₹) for legacy tests. */
export const DELIVERY_FEE_FLAT = 40;

export const DEFAULT_PRICING_CONFIG: PricingConfig & { freeDeliveryThreshold?: number; deliveryFeeFlat?: number } = {
  gstRate: GST_RATE,
  packagingFee: PACKAGING_FEE_BY_FULFILLMENT.delivery,
  deliveryFee: DEFAULT_DELIVERY_QUOTE_FEE,
  minOrderAmount: DELIVERY_MIN_ORDER_AMOUNT,
  freeDeliveryThreshold: FREE_DELIVERY_THRESHOLD,
  deliveryFeeFlat: DELIVERY_FEE_FLAT,
};

export interface PricingCustomization {
  groupId?: string;
  groupName?: string;
  optionId?: string;
  optionName?: string;
  name?: string;
  price?: number;
  priceDelta?: number;
}

export interface PricingLineItem {
  id?: string;
  productId?: string;
  lineId?: string;
  name?: string;
  price?: number;
  unitPrice?: number;
  quantity?: number;
  customizations?: PricingCustomization[];
  modifiers?: PricingCustomization[];
  notes?: string;
  veg?: boolean;
  imageUrl?: string;
  fallbackImageUrl?: string;
  availability?: string;
  unavailableReason?: string;
  meta?: Record<string, unknown>;
}

export interface PricingCalculationInput {
  items: PricingLineItem[];
  fulfillment?: PricingFulfillment | string;
  promoDiscount?: number;
  itemDiscount?: number;
  config: PricingConfig | StorePricingConfig;
}

export interface CalculatedOrderTotals {
  /**
   * Sum of all line totals. GST-INCLUSIVE — the 5% is already inside this
   * number and must not be added again.
   */
  subtotal: number;
  itemDiscount: number;
  promoDiscount: number;
  /**
   * GST attributable to the discounted amount. Informational only: it is a
   * breakdown OF `subtotal`, never an addition to it.
   */
  taxes: number;
  cgst: number;
  sgst: number;
  /** Rate `cgst`/`sgst` were computed at (0.05 = 5%). */
  gstRate: number;
  packagingFee: number;
  deliveryFee: number;
  grandTotal: number;
  currency: string;
}

export interface MinOrderCheck {
  met: boolean;
  minOrderAmount: number;
  /** ₹ still needed to reach the minimum. 0 once met (or when there is no minimum). */
  shortfall: number;
  /** Customer-facing reason, present only when `met` is false. */
  message?: string;
}

/** Narrows an arbitrary fulfillment string to the pricing schedule's key. */
export function asPricingFulfillment(
  fulfillment: PricingFulfillment | string | null | undefined,
): PricingFulfillment {
  if (fulfillment === "takeaway" || fulfillment === "dinein") return fulfillment;
  return "delivery";
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * Builds the pricing config for one order: app-wide launch schedule, with the
 * live delivery quote and any store-level minimum folded in.
 *
 * This is the ONLY place a fee schedule is assembled — screens must never
 * build one inline, which is how the old cart and footer ended up charging
 * different delivery fees for the same basket.
 */
export function resolvePricingConfig(input?: {
  fulfillment?: PricingFulfillment | string | null;
  /** Live quote (₹). Falls back to the sandbox quote when absent/invalid. */
  deliveryQuoteFee?: number | null;
  /** Store-doc overrides. Only `minOrderAmount` is honoured from the doc. */
  storeOverride?: { minOrderAmount?: number | null } | null;
}): PricingConfig {
  const fulfillment = asPricingFulfillment(input?.fulfillment);
  const isDelivery = fulfillment === "delivery";

  const quote = Number(input?.deliveryQuoteFee);
  const deliveryFee =
    isDelivery && Number.isFinite(quote) && quote >= 0 ? round2(quote) : isDelivery ? DEFAULT_DELIVERY_QUOTE_FEE : 0;

  const override = Number(input?.storeOverride?.minOrderAmount);
  const minOrderAmount = isDelivery
    ? Number.isFinite(override) && override > 0
      ? Math.floor(override)
      : DELIVERY_MIN_ORDER_AMOUNT
    : 0;

  return {
    gstRate: GST_RATE,
    packagingFee: PACKAGING_FEE_BY_FULFILLMENT[fulfillment],
    deliveryFee,
    minOrderAmount,
  };
}

/**
 * Minimum-order gate for a basket. Only delivery carries a minimum; pickup
 * and dine-in orders of any size are accepted.
 */
export function checkMinimumOrder(
  subtotal: number,
  fulfillment: PricingFulfillment | string | null | undefined,
  minOrderAmount?: number | null,
): MinOrderCheck {
  const resolved = asPricingFulfillment(fulfillment);
  const override = Number(minOrderAmount);
  const required =
    resolved === "delivery"
      ? Number.isFinite(override) && override > 0
        ? Math.floor(override)
        : DELIVERY_MIN_ORDER_AMOUNT
      : 0;

  const amount = Number(subtotal);
  const safeSubtotal = Number.isFinite(amount) && amount > 0 ? amount : 0;
  const met = safeSubtotal >= required;

  if (met) return { met: true, minOrderAmount: required, shortfall: 0 };

  return {
    met: false,
    minOrderAmount: required,
    shortfall: round2(required - safeSubtotal),
    message:
      required === DELIVERY_MIN_ORDER_AMOUNT
        ? DELIVERY_MIN_ORDER_MESSAGE
        : `Minimum order value for delivery is ₹${required}.`,
  };
}

/**
 * Computes unit price of a single line item.
 *
 * `CartLine.unitPrice` is ALL-IN: the customization modal, the product page and
 * the reorder path already bake `Σ modifier.priceDelta` in before the line is
 * created. Every consumer (order review, cart rows, floating bar, invoice,
 * coupon math, Petpooja POS payload) reads `unitPrice * quantity` verbatim, so
 * re-adding the deltas here would charge add-ons twice and inflate `subtotal`.
 *
 * The modifier sum below only applies to legacy/base-shaped inputs that carry
 * `price` without `unitPrice` (external callers of `calculateOrderTotals`).
 */
export function computeItemUnitPrice(item: PricingLineItem): number {
  if (!item) return 0;

  if (item.unitPrice !== undefined && item.unitPrice !== null) {
    const unit = Number(item.unitPrice);
    return Number.isFinite(unit) && unit >= 0 ? unit : 0;
  }

  const base = Number(item.price ?? 0);
  const basePrice = Number.isFinite(base) && base >= 0 ? base : 0;

  let addons = 0;
  if (Array.isArray(item.customizations) && item.customizations.length > 0) {
    for (const c of item.customizations) {
      const p = Number(
        (c as { price?: number; priceDelta?: number })?.price ??
          (c as { price?: number; priceDelta?: number })?.priceDelta ??
          0,
      );
      if (Number.isFinite(p) && p >= 0) addons += p;
    }
  } else if (Array.isArray(item.modifiers) && item.modifiers.length > 0) {
    for (const m of item.modifiers) {
      const d = Number(
        (m as { price?: number; priceDelta?: number })?.priceDelta ??
          (m as { price?: number; priceDelta?: number })?.price ??
          0,
      );
      if (Number.isFinite(d) && d >= 0) addons += d;
    }
  }

  return basePrice + addons;
}

/**
 * Computes the total price for a single line item given its quantity.
 */
export function computeItemLineTotal(item: PricingLineItem): number {
  if (!item) return 0;
  const qty = Number(item.quantity);
  const validQuantity = Number.isInteger(qty) && qty > 0 ? qty : 1;
  return computeItemUnitPrice(item) * validQuantity;
}

/**
 * Calculates the complete order breakdown with strict rounding.
 *
 * GST is INCLUSIVE: `cgst`/`sgst`/`taxes` describe money that is already
 * inside `subtotal`. `grandTotal` therefore adds only the order-level fees
 * (packaging + delivery) on top of the discounted item amount.
 */
export function calculateOrderTotals(input: PricingCalculationInput): CalculatedOrderTotals {
  const { items = [], fulfillment, promoDiscount = 0, itemDiscount = 0, config } = input;

  if (!config) {
    throw new Error("PRICING_CONFIG_UNAVAILABLE: Valid pricing configuration is required.");
  }

  let subtotal = 0;
  let hasItems = false;

  for (const item of items) {
    subtotal += computeItemLineTotal(item);
    hasItems = true;
  }

  subtotal = round2(subtotal);

  const validItemDiscount = Math.max(0, Number(itemDiscount) || 0);
  const validPromoDiscount = Math.max(0, Number(promoDiscount) || 0);

  // Discounts are applied against the GST-inclusive amount, so the GST we
  // report afterwards is exactly the tax embedded in what is being charged.
  const taxableAmount = round2(Math.max(0, subtotal - validItemDiscount - validPromoDiscount));

  const gstRate = typeof config.gstRate === "number" ? config.gstRate : GST_RATE;
  const cgst = round2(taxableAmount * (gstRate / 2));
  const sgst = round2(taxableAmount * (gstRate / 2));
  const taxes = round2(cgst + sgst);

  const packagingFee = hasItems && typeof config.packagingFee === "number" ? config.packagingFee : 0;
  const deliveryFee =
    hasItems && asPricingFulfillment(fulfillment) === "delivery" && typeof config.deliveryFee === "number"
      ? config.deliveryFee
      : 0;

  const grandTotal = round2(Math.max(0, taxableAmount + packagingFee + deliveryFee));

  return {
    subtotal,
    itemDiscount: validItemDiscount,
    promoDiscount: validPromoDiscount,
    taxes,
    cgst,
    sgst,
    gstRate,
    packagingFee,
    deliveryFee,
    grandTotal,
    currency: "INR",
  };
}
