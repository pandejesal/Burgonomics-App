import {
  PricingConfig,
  DEFAULT_PRICING_CONFIG,
  calculateOrderTotals,
  computeItemUnitPrice,
  computeItemLineTotal,
  CalculatedOrderTotals,
  PricingLineItem,
} from "../../../src/shared/pricing/pricingEngine";

export {
  type PricingConfig,
  DEFAULT_PRICING_CONFIG,
  calculateOrderTotals,
  computeItemUnitPrice,
  computeItemLineTotal,
  type CalculatedOrderTotals,
  type PricingLineItem,
};

export interface ServerPriceItem {
  id?: string;
  productId?: string;
  quantity?: number;
  price?: number;
  unitPrice?: number;
  customizations?: Array<{ price?: number }>;
  modifiers?: Array<{ priceDelta?: number }>;
  [key: string]: any;
}

export interface ServerPriceResult {
  subtotal: number;
  tax: number;
  deliveryFee: number;
  packingFee: number;
  grandTotal: number;
}

export type PriceResolver = (
  productId: string,
) => Promise<number | null | undefined> | number | null | undefined;

// In-memory cache for pricing configs with 60s TTL
interface CacheEntry {
  config: PricingConfig;
  expiresAt: number;
}
const configCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000; // 60 seconds TTL

export function clearPricingConfigCache(): void {
  configCache.clear();
}

/**
 * Resolves pricing configuration for a store, falling back to app_settings/pricing.
 * In strict-mode: if no valid pricing configuration is found, throws PRICING_CONFIG_UNAVAILABLE error.
 */
export async function resolveStorePricingConfig(
  db: any,
  storeId?: string | null,
): Promise<PricingConfig> {
  const cacheKey = storeId ? `store:${storeId}` : "global";
  const now = Date.now();
  const cached = configCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.config;
  }

  // 1. Try store document if storeId is provided
  if (storeId && db) {
    try {
      const storeSnap = await db.collection("stores").doc(storeId).get();
      if (storeSnap.exists) {
        const storeData = storeSnap.data();
        if (storeData?.pricing && typeof storeData.pricing.gstRate === "number") {
          const config: PricingConfig = {
            gstRate: storeData.pricing.gstRate,
            packingChargePerItem: storeData.pricing.packingChargePerItem ?? 0,
            deliveryFeeFlat: storeData.pricing.deliveryFeeFlat ?? storeData.deliveryFee ?? 40,
            freeDeliveryThreshold: storeData.pricing.freeDeliveryThreshold ?? 499,
            minOrderAmount: storeData.pricing.minOrderAmount ?? 0,
          };
          configCache.set(cacheKey, { config, expiresAt: now + CACHE_TTL_MS });
          return config;
        }
      }

      // Fallback: check admin_stores
      const adminStoreSnap = await db.collection("admin_stores").doc(storeId).get();
      if (adminStoreSnap.exists) {
        const adminData = adminStoreSnap.data();
        if (adminData?.pricing && typeof adminData.pricing.gstRate === "number") {
          const config: PricingConfig = {
            gstRate: adminData.pricing.gstRate,
            packingChargePerItem: adminData.pricing.packingChargePerItem ?? 0,
            deliveryFeeFlat: adminData.pricing.deliveryFeeFlat ?? adminData.deliveryFee ?? 40,
            freeDeliveryThreshold: adminData.pricing.freeDeliveryThreshold ?? 499,
            minOrderAmount: adminData.pricing.minOrderAmount ?? 0,
          };
          configCache.set(cacheKey, { config, expiresAt: now + CACHE_TTL_MS });
          return config;
        }
      }
    } catch (e) {
      console.warn(`[server-price] Error reading store pricing for ${storeId}:`, e);
    }
  }

  // 2. Fall back to app_settings/pricing
  if (db) {
    try {
      const globalSnap = await db.collection("app_settings").doc("pricing").get();
      if (globalSnap.exists) {
        const globalData = globalSnap.data();
        if (globalData && typeof globalData.gstRate === "number") {
          const config: PricingConfig = {
            gstRate: globalData.gstRate,
            packingChargePerItem: globalData.packingChargePerItem ?? 0,
            deliveryFeeFlat: globalData.deliveryFeeFlat ?? 40,
            freeDeliveryThreshold: globalData.freeDeliveryThreshold ?? 499,
            minOrderAmount: globalData.minOrderAmount ?? 0,
          };
          configCache.set(cacheKey, { config, expiresAt: now + CACHE_TTL_MS });
          return config;
        }
      }
    } catch (e) {
      console.warn("[server-price] Error reading app_settings/pricing:", e);
    }
  }

  // 3. Strict mode: Fail closed if unseeded / unreachable
  throw new Error("PRICING_CONFIG_UNAVAILABLE");
}

/**
 * Server-Authoritative Price Engine (SEC-3 / PAY-4).
 * Recalculates order subtotal, taxes (5% GST), delivery fee, and grand total.
 * Pure logic — accepts optional pricingConfig and priceResolver.
 */
export async function computeServerPrice(
  items: ServerPriceItem[],
  fulfillment?: string,
  priceResolver?: PriceResolver,
  pricingConfig?: PricingConfig,
): Promise<ServerPriceResult> {
  const config = pricingConfig || DEFAULT_PRICING_CONFIG;

  const resolvedItems: ServerPriceItem[] = [];

  if (Array.isArray(items) && items.length > 0) {
    for (const item of items) {
      const qty = Math.max(1, Number(item?.quantity) || 1);
      let itemBasePrice = Number(item?.price ?? item?.unitPrice ?? 0);

      const lookupId = item?.id || item?.productId;
      if (lookupId && priceResolver) {
        const resolved = await priceResolver(lookupId);
        if (typeof resolved === "number" && !Number.isNaN(resolved)) {
          itemBasePrice = resolved;
        }
      }

      resolvedItems.push({
        ...item,
        price: itemBasePrice,
        unitPrice: itemBasePrice,
        quantity: qty,
      });
    }
  }

  const totals = calculateOrderTotals({
    items: resolvedItems,
    fulfillment: fulfillment || "delivery",
    config,
  });

  return {
    subtotal: totals.subtotal,
    tax: totals.taxes,
    deliveryFee: totals.deliveryFee,
    packingFee: totals.packingFee,
    grandTotal: totals.grandTotal,
  };
}
