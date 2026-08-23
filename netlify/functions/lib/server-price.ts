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

export interface PricingResolutionResult {
  config: PricingConfig;
  source: "petpooja_truth" | "firestore_fallback";
  reason?: string;
  fetchedAt: string;
}

export type PriceResolver = (
  productId: string,
) => Promise<number | null | undefined> | number | null | undefined;

// In-memory cache for pricing configs with 60s TTL
interface CacheEntry {
  result: PricingResolutionResult;
  expiresAt: number;
}
const configCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000; // 60 seconds TTL

export function clearPricingConfigCache(): void {
  configCache.clear();
}

/**
 * Attempts to fetch live pricing/tax config directly from Petpooja V1 API.
 */
async function fetchPetpoojaPricing(restId?: string | null): Promise<PricingConfig | null> {
  const appKey = process.env.PETPOOJA_APP_KEY;
  const accessToken = process.env.PETPOOJA_ACCESS_TOKEN;
  const effectiveRestId = restId || process.env.PETPOOJA_REST_ID || "qle1yy2ydc";

  if (!appKey || !accessToken) {
    throw new Error("Missing Petpooja API credentials");
  }

  const endpoint = `https://qle1yy2ydc.execute-api.ap-southeast-1.amazonaws.com/V1/get_menu`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Content_key: appKey,
      Authorization: `Bearer ${accessToken}`,
      rest_id: effectiveRestId,
    },
    body: JSON.stringify({ rest_id: effectiveRestId }),
  });

  if (!response.ok) {
    throw new Error(`Petpooja API error: status ${response.status}`);
  }

  const data = await response.json();
  if (!data || data.status === "error") {
    throw new Error(data?.message || "Petpooja API returned error");
  }

  // Parse Petpooja taxes and packing configurations
  const gstRate = typeof data.gstRate === "number" ? data.gstRate : 0.05;
  const packingChargePerItem = typeof data.packingCharge === "number" ? data.packingCharge : 0;
  const deliveryFeeFlat = typeof data.deliveryFee === "number" ? data.deliveryFee : 40;
  const freeDeliveryThreshold = typeof data.freeDeliveryThreshold === "number" ? data.freeDeliveryThreshold : 499;

  return {
    gstRate,
    packingChargePerItem,
    deliveryFeeFlat,
    freeDeliveryThreshold,
    minOrderAmount: data.minOrderAmount ?? 0,
  };
}

/**
 * Resolves pricing configuration for a store with source metadata.
 * Petpooja is single source of truth when enabled; falls back cleanly to Firestore on outage.
 *
 * In strict-mode: if neither Petpooja nor Firestore config is available, throws PRICING_CONFIG_UNAVAILABLE.
 */
export async function resolveStorePricingConfigWithMetadata(
  db: any,
  storeId?: string | null,
): Promise<PricingResolutionResult> {
  const cacheKey = storeId ? `store:${storeId}` : "global";
  const now = Date.now();
  const cached = configCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.result;
  }

  const isPetpoojaEnabled = process.env.PETPOOJA_ENABLED === "true";
  let petpoojaRestId: string | null = null;

  // 1. Check branch/store doc in Firestore to get Petpooja restId if present
  let branchDocData: any = null;
  if (storeId && db) {
    try {
      const branchSnap = await db.collection("branches").doc(storeId).get();
      if (branchSnap.exists) {
        branchDocData = branchSnap.data();
        petpoojaRestId = branchDocData?.petpooja?.restId || branchDocData?.restId || null;
      }
    } catch (e) {
      console.warn(`[server-price] Error reading branch ${storeId}:`, e);
    }
  }

  // 2. Try Petpooja Truth if enabled
  if (isPetpoojaEnabled) {
    try {
      const petpoojaConfig = await fetchPetpoojaPricing(petpoojaRestId);
      if (petpoojaConfig && typeof petpoojaConfig.gstRate === "number") {
        const result: PricingResolutionResult = {
          config: petpoojaConfig,
          source: "petpooja_truth",
          fetchedAt: new Date().toISOString(),
        };
        configCache.set(cacheKey, { result, expiresAt: now + CACHE_TTL_MS });
        return result;
      }
    } catch (petpoojaErr: any) {
      console.warn(
        `[server-price] Petpooja truth fetch failed for store ${storeId || "global"}: ${petpoojaErr?.message}; engaging Firestore fallback`,
      );
    }
  }

  // 3. Firestore Fallback: branches/{id}.pricingOverrides || branches/{id}.pricing || stores/{id} || app_settings/pricing
  if (branchDocData) {
    const pricing = branchDocData.pricingOverrides || branchDocData.pricing;
    if (pricing && typeof pricing.gstRate === "number") {
      const config: PricingConfig = {
        gstRate: pricing.gstRate,
        packingChargePerItem: pricing.packingChargePerItem ?? 0,
        deliveryFeeFlat: pricing.deliveryFeeFlat ?? branchDocData.deliveryFee ?? 40,
        freeDeliveryThreshold: pricing.freeDeliveryThreshold ?? 499,
        minOrderAmount: pricing.minOrderAmount ?? 0,
      };
      const result: PricingResolutionResult = {
        config,
        source: "firestore_fallback",
        reason: isPetpoojaEnabled ? "petpooja_unreachable" : "petpooja_disabled",
        fetchedAt: new Date().toISOString(),
      };
      configCache.set(cacheKey, { result, expiresAt: now + CACHE_TTL_MS });
      return result;
    }
  }

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
          const result: PricingResolutionResult = {
            config,
            source: "firestore_fallback",
            reason: isPetpoojaEnabled ? "petpooja_unreachable" : "petpooja_disabled",
            fetchedAt: new Date().toISOString(),
          };
          configCache.set(cacheKey, { result, expiresAt: now + CACHE_TTL_MS });
          return result;
        }
      }

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
          const result: PricingResolutionResult = {
            config,
            source: "firestore_fallback",
            reason: isPetpoojaEnabled ? "petpooja_unreachable" : "petpooja_disabled",
            fetchedAt: new Date().toISOString(),
          };
          configCache.set(cacheKey, { result, expiresAt: now + CACHE_TTL_MS });
          return result;
        }
      }
    } catch (e) {
      console.warn(`[server-price] Error reading fallback store pricing for ${storeId}:`, e);
    }
  }

  // 4. Fall back to app_settings/pricing
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
          const result: PricingResolutionResult = {
            config,
            source: "firestore_fallback",
            reason: isPetpoojaEnabled ? "petpooja_unreachable" : "petpooja_disabled",
            fetchedAt: new Date().toISOString(),
          };
          configCache.set(cacheKey, { result, expiresAt: now + CACHE_TTL_MS });
          return result;
        }
      }
    } catch (e) {
      console.warn("[server-price] Error reading app_settings/pricing:", e);
    }
  }

  // 5. Strict mode: Fail closed if unseeded / unreachable
  throw new Error("PRICING_CONFIG_UNAVAILABLE");
}

/**
 * Resolves pricing configuration for a store, returning standard PricingConfig.
 */
export async function resolveStorePricingConfig(
  db: any,
  storeId?: string | null,
): Promise<PricingConfig> {
  const result = await resolveStorePricingConfigWithMetadata(db, storeId);
  return result.config;
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
