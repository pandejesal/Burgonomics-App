export interface ServerPriceItem {
  id?: string;
  quantity?: number;
  price?: number;
  customizations?: Array<{ price?: number }>;
}

export interface ServerPriceResult {
  subtotal: number;
  tax: number;
  deliveryFee: number;
  grandTotal: number;
}

export type PriceResolver = (
  productId: string,
) => Promise<number | null | undefined> | number | null | undefined;

/**
 * Server-Authoritative Price Engine (SEC-3 / PAY-4).
 * Recalculates order subtotal, taxes (5% GST), delivery fee, and grand total.
 * Pure logic — does not directly import database or framework adapters.
 */
export async function computeServerPrice(
  items: ServerPriceItem[],
  fulfillment?: string,
  priceResolver?: PriceResolver,
): Promise<ServerPriceResult> {
  let subtotal = 0;

  if (Array.isArray(items) && items.length > 0) {
    for (const item of items) {
      const qty = Math.max(1, Number(item?.quantity) || 1);
      let itemBasePrice = Number(item?.price || 0);

      if (item?.id && priceResolver) {
        const resolved = await priceResolver(item.id);
        if (typeof resolved === "number" && !Number.isNaN(resolved)) {
          itemBasePrice = resolved;
        }
      }

      // Add custom addon prices if present
      let addonTotal = 0;
      if (Array.isArray(item?.customizations)) {
        for (const addon of item.customizations) {
          const addonPrice = Number(addon?.price || 0);
          if (!Number.isNaN(addonPrice)) {
            addonTotal += addonPrice;
          }
        }
      }

      subtotal += (itemBasePrice + addonTotal) * qty;
    }
  }

  // Calculate standard 5% GST rounded to 2 decimals
  const tax = Math.round(subtotal * 0.05 * 100) / 100;

  // Delivery fee rules: ₹40 if subtotal <= 499, ₹0 if > 499 for delivery; ₹0 for other fulfillments or 0 subtotal
  const deliveryFee = fulfillment === "delivery" && subtotal > 0 ? (subtotal > 499 ? 0 : 40) : 0;
  const grandTotal = Math.round((subtotal + tax + deliveryFee) * 100) / 100;

  return { subtotal, tax, deliveryFee, grandTotal };
}
