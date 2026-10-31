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
 * Flat packaging charge per order (₹) is decided by the SERVER (Petpooja /
 * branch config) and arrives in the `/checkout/fees` response. The client holds
 * NO packaging number: `DEFAULT_PRICING_CONFIG.packagingFee` is 0 and the cart
 * says "Calculated at checkout" instead of estimating.
 */
export const DELIVERY_MIN_ORDER_AMOUNT = 149;

/** Customer-facing copy for a sub-minimum delivery basket. */
export const DELIVERY_MIN_ORDER_MESSAGE = `Minimum order value for delivery is ₹${DELIVERY_MIN_ORDER_AMOUNT}.`;

export const DEFAULT_PRICING_CONFIG: PricingConfig = {
  gstRate: GST_RATE,
  // R8/P2: no client packaging number. The server response is the only source.
  packagingFee: 0,
  // R8: there is NO static delivery fee. The live courier quote supplies it;
  // without one the fee is 0 and checkout refuses to take payment.
  deliveryFee: 0,
  minOrderAmount: DELIVERY_MIN_ORDER_AMOUNT,
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
 * R1: the GST already contained in an inclusive amount.
 * `includedGst(105) === 5` — the old `105 * 0.05` reported 5.25, i.e. tax on
 * top of a price that already carried it.
 */
export function includedGst(inclusiveAmount: number, rate: number = GST_RATE): number {
  const amount = Number(inclusiveAmount);
  const gstRate = Number(rate);
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(gstRate) || gstRate <= 0) {
    return 0;
  }
  return round2((amount * gstRate) / (1 + gstRate));
}

/**
 * R2: canonical paise conversion. Both repos must produce the same integer for
 * the same rupee total: `Math.round(grandTotal * 100)`.
 */
export function toPaise(rupees: number): number {
  const value = Number(rupees);
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}


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
  /**
   * Live courier quote (₹). NO static fallback: absent/invalid means 0, and a
   * delivery order may then not take payment until the server quotes it.
   */
  deliveryQuoteFee?: number | null;
  /**
   * Server packaging fee from `POST /checkout/fees`. There is NO client
   * fallback: absent/invalid means 0, and the cart labels packaging as
   * "Calculated at checkout".
   */
  packagingFee?: number | null;
  /** Store-doc overrides. Only `minOrderAmount` is honoured from the doc. */
  storeOverride?: { minOrderAmount?: number | null } | null;
}): PricingConfig {
  const fulfillment = asPricingFulfillment(input?.fulfillment);
  const isDelivery = fulfillment === "delivery";

  const quote = Number(input?.deliveryQuoteFee);
  const deliveryFee = isDelivery && Number.isFinite(quote) && quote >= 0 ? round2(quote) : 0;

  const packagingOverride = Number(input?.packagingFee);
  const packagingFee =
    Number.isFinite(packagingOverride) && packagingOverride >= 0 ? round2(packagingOverride) : 0;

  const override = Number(input?.storeOverride?.minOrderAmount);
  const minOrderAmount = isDelivery
    ? Number.isFinite(override) && override > 0
      ? Math.floor(override)
      : DELIVERY_MIN_ORDER_AMOUNT
    : 0;

  return {
    gstRate: GST_RATE,
    packagingFee,
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
  // GST is INCLUSIVE (R1): the share embedded in an inclusive amount is
  // `amount * rate / (1 + rate)`, never `amount * rate`. The old maths
  // reported ₹5.25 on a ₹105 bill where the true share is exactly ₹5.00.
  const taxes = includedGst(taxableAmount, gstRate);
  // CGST is the rounded half; SGST takes the remainder so the two always sum
  // back to `taxes` exactly (to the paisa) — no lost or invented paisa.
  const cgst = round2(taxes / 2);
  const sgst = round2(taxes - cgst);


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
