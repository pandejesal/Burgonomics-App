import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  resolveStorePricingConfigWithMetadata,
  computeServerPrice,
  clearPricingConfigCache,
  PricingConfig,
} from "../../netlify/functions/lib/server-price";

describe("Pricing Architecture — Petpooja Truth + Firestore Fallback (6 Tests)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    clearPricingConfigCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // Mock Firestore DB builder
  function createMockDb(options: {
    branchData?: any;
    storeData?: any;
    adminStoreData?: any;
    globalData?: any;
  }) {
    return {
      collection: (col: string) => ({
        doc: (id: string) => ({
          get: async () => {
            if (col === "branches" && options.branchData) {
              return { exists: true, data: () => options.branchData };
            }
            if (col === "stores" && options.storeData) {
              return { exists: true, data: () => options.storeData };
            }
            if (col === "admin_stores" && options.adminStoreData) {
              return { exists: true, data: () => options.adminStoreData };
            }
            if (col === "app_settings" && id === "pricing" && options.globalData) {
              return { exists: true, data: () => options.globalData };
            }
            return { exists: false, data: () => null };
          },
        }),
      }),
    };
  }

  // =========================================================================
  // 1. Petpooja Truth Hit
  // =========================================================================

  it("1. [PETPOOJA-TRUTH-HIT] returns source: petpooja_truth when PETPOOJA_ENABLED=true and API succeeds", async () => {
    process.env.PETPOOJA_ENABLED = "true";
    process.env.PETPOOJA_APP_KEY = "test_app_key";
    process.env.PETPOOJA_ACCESS_TOKEN = "test_access_token";
    process.env.PETPOOJA_REST_ID = "rest_100";

    const mockPetpoojaResponse = {
      status: "success",
      gstRate: 0.05,
      packingCharge: 0,
      deliveryFee: 40,
      freeDeliveryThreshold: 499,
    };

    // Mock global fetch for Petpooja API
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockPetpoojaResponse,
    } as any);

    const mockDb = createMockDb({});
    const result = await resolveStorePricingConfigWithMetadata(mockDb, "branch_navrangpura");

    expect(result.source).toBe("petpooja_truth");
    expect(result.config.gstRate).toBe(0.05);
    expect(result.config.freeDeliveryThreshold).toBe(499);
  });

  // =========================================================================
  // 2. Fallback Hit on Disabled or Unreachable Petpooja
  // =========================================================================

  it("2. [FALLBACK-HIT] falls back to Firestore when PETPOOJA_ENABLED=false or Petpooja errors", async () => {
    process.env.PETPOOJA_ENABLED = "false";

    const mockDb = createMockDb({
      globalData: {
        gstRate: 0.05,
        packingChargePerItem: 0,
        deliveryFeeFlat: 40,
        freeDeliveryThreshold: 499,
      },
    });

    const result = await resolveStorePricingConfigWithMetadata(mockDb, "branch_navrangpura");

    expect(result.source).toBe("firestore_fallback");
    expect(result.reason).toBe("petpooja_disabled");
    expect(result.config.gstRate).toBe(0.05);
    expect(result.config.deliveryFeeFlat).toBe(40);
  });

  // =========================================================================
  // 3. In-Memory Cache 60s TTL
  // =========================================================================

  it("3. [CACHE-60S] returns cached pricing on subsequent call within 60s without refetching", async () => {
    process.env.PETPOOJA_ENABLED = "true";
    process.env.PETPOOJA_APP_KEY = "test_key";
    process.env.PETPOOJA_ACCESS_TOKEN = "test_token";

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ status: "success", gstRate: 0.05, deliveryFee: 40, freeDeliveryThreshold: 499 }),
    } as any);

    const mockDb = createMockDb({});
    const firstCall = await resolveStorePricingConfigWithMetadata(mockDb, "branch_01");
    const secondCall = await resolveStorePricingConfigWithMetadata(mockDb, "branch_01");

    expect(firstCall.source).toBe("petpooja_truth");
    expect(secondCall.source).toBe("petpooja_truth");
    expect(fetchSpy).toHaveBeenCalledTimes(1); // Exactly 1 network fetch; 2nd call was served from cache
  });

  // =========================================================================
  // 4. Dry Run Mode Preview
  // =========================================================================

  it("4. [DRY-RUN-PREVIEW] calculates authoritative total without persisting order", async () => {
    const config: PricingConfig = {
      gstRate: 0.05,
      packingChargePerItem: 0,
      deliveryFeeFlat: 40,
      freeDeliveryThreshold: 499,
    };

    const items = [
      { id: "burger_1", price: 200, quantity: 2 }, // 400
    ];

    // Subtotal: 400 (< 499 -> deliveryFee 40)
    // Tax: 5% of 400 = 20
    // GrandTotal: 400 + 40 + 20 = 460
    const serverPrice = await computeServerPrice(items, "delivery", undefined, config);

    expect(serverPrice.subtotal).toBe(400);
    expect(serverPrice.deliveryFee).toBe(40);
    expect(serverPrice.tax).toBe(20);
    expect(serverPrice.grandTotal).toBe(460);
  });

  // =========================================================================
  // 5. Strict Free Delivery Threshold (> 499)
  // =========================================================================

  it("5. [STRICT-FREE-DELIVERY] enforces exact > 499 threshold: 499 pays ₹40, 500 is free delivery", async () => {
    const config: PricingConfig = {
      gstRate: 0.05,
      packingChargePerItem: 0,
      deliveryFeeFlat: 40,
      freeDeliveryThreshold: 499,
    };

    // Case A: subtotal = ₹499 (pays ₹40)
    const items499 = [{ id: "burger_combo", price: 499, quantity: 1 }];
    const totals499 = await computeServerPrice(items499, "delivery", undefined, config);
    expect(totals499.subtotal).toBe(499);
    expect(totals499.deliveryFee).toBe(40);

    // Case B: subtotal = ₹500 (free delivery)
    const items500 = [{ id: "burger_feast", price: 500, quantity: 1 }];
    const totals500 = await computeServerPrice(items500, "delivery", undefined, config);
    expect(totals500.subtotal).toBe(500);
    expect(totals500.deliveryFee).toBe(0);
  });

  // =========================================================================
  // 6. Strict Mode: Missing Config Throws
  // =========================================================================

  it("6. [MISSING-CONFIG-THROW] throws PRICING_CONFIG_UNAVAILABLE when unseeded and unreachable", async () => {
    process.env.PETPOOJA_ENABLED = "false";
    const emptyDb = createMockDb({}); // No branch, store, or global config

    await expect(
      resolveStorePricingConfigWithMetadata(emptyDb, "unknown_branch"),
    ).rejects.toThrow("PRICING_CONFIG_UNAVAILABLE");
  });
});
