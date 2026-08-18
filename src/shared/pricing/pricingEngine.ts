/**
 * Canonical Pricing Engine
 * Shared between client application and serverless execution environments.
 *
 * Strict-Mode: Calculates authoritative order subtotals, GST, packing fees,
 * delivery fees, promo discounts, and grand totals according to a store's
 * pricing configuration or the global app_settings/pricing configuration.
 */

export interface PricingConfig {
  gstRate: number; // e.g. 0.05 for 5%
  packingChargePerItem: number; // e.g. 5 (₹5 per item) or 0
  deliveryFeeFlat: number; // e.g. 40
  freeDeliveryThreshold: number; // e.g. 499 (0 if no free delivery)
  minOrderAmount?: number;
}

export const DEFAULT_PRICING_CONFIG: PricingConfig = {
  gstRate: 0.05,
  packingChargePerItem: 5,
  deliveryFeeFlat: 40,
  freeDeliveryThreshold: 499,
  minOrderAmount: 0,
};

export interface PricingLineItem {
  id?: string;
  productId?: string;
  price?: number;
  unitPrice?: number;
  quantity?: number;
  customizations?: Array<{ price?: number }>;
  modifiers?: Array<{ priceDelta?: number }>;
  [key: string]: any;
}

export interface PricingCalculationInput {
  items: PricingLineItem[];
  fulfillment?: "delivery" | "takeaway" | "dinein" | string;
  promoDiscount?: number;
  itemDiscount?: number;
  config: PricingConfig;
}

export interface CalculatedOrderTotals {
  subtotal: number;
  itemDiscount: number;
  promoDiscount: number;
  taxes: number;
  packingFee: number;
  deliveryFee: number;
  grandTotal: number;
  currency: string;
}

/**
 * Computes unit price of a single line item including customizations/modifiers.
 */
export function computeItemUnitPrice(item: PricingLineItem): number {
  if (!item) return 0;
  const base = Number(item.unitPrice ?? item.price ?? 0);
  const basePrice = Number.isFinite(base) && base >= 0 ? base : 0;

  let addons = 0;
  if (Array.isArray(item.customizations) && item.customizations.length > 0) {
    for (const c of item.customizations) {
      const p = Number(c?.price || 0);
      if (Number.isFinite(p)) addons += p;
    }
  } else if (Array.isArray(item.modifiers) && item.modifiers.length > 0) {
    for (const m of item.modifiers) {
      const d = Number(m?.priceDelta || 0);
      if (Number.isFinite(d)) addons += d;
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
 * Calculates complete order totals breakdown with strict rounding rules.
 */
export function calculateOrderTotals(input: PricingCalculationInput): CalculatedOrderTotals {
  const { items = [], fulfillment, promoDiscount = 0, itemDiscount = 0, config } = input;

  if (!config) {
    throw new Error("PRICING_CONFIG_UNAVAILABLE: Valid pricing configuration is required.");
  }

  let subtotal = 0;
  let totalItemCount = 0;

  for (const item of items) {
    const lineTotal = computeItemLineTotal(item);
    subtotal += lineTotal;
    const qty = Number(item.quantity);
    totalItemCount += Number.isInteger(qty) && qty > 0 ? qty : 1;
  }

  // Round subtotal to 2 decimals
  subtotal = Math.round(subtotal * 100) / 100;

  const validItemDiscount = Math.max(0, Number(itemDiscount) || 0);
  const validPromoDiscount = Math.max(0, Number(promoDiscount) || 0);

  const taxableAmount = Math.max(0, subtotal - validItemDiscount - validPromoDiscount);
  const gstRate = typeof config.gstRate === "number" ? config.gstRate : 0.05;
  const taxes = Math.round(taxableAmount * gstRate * 100) / 100;

  const packingRate =
    typeof config.packingChargePerItem === "number" ? config.packingChargePerItem : 0;
  const packingFee = items.length > 0 ? Math.round(totalItemCount * packingRate * 100) / 100 : 0;

  let deliveryFee = 0;
  if (fulfillment === "delivery" && subtotal > 0) {
    const threshold = config.freeDeliveryThreshold ?? 499;
    if (threshold > 0 && subtotal > threshold) {
      deliveryFee = 0;
    } else {
      deliveryFee = typeof config.deliveryFeeFlat === "number" ? config.deliveryFeeFlat : 40;
    }
  }

  const grandTotal =
    Math.round(Math.max(0, taxableAmount + taxes + packingFee + deliveryFee) * 100) / 100;

  return {
    subtotal,
    itemDiscount: validItemDiscount,
    promoDiscount: validPromoDiscount,
    taxes,
    packingFee,
    deliveryFee,
    grandTotal,
    currency: "INR",
  };
}
