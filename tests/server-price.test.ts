import { describe, it, expect, beforeEach } from "vitest";
import {
  computeServerPrice,
  resolveStorePricingConfig,
  clearPricingConfigCache,
} from "../netlify/functions/lib/server-price";

describe("computeServerPrice", () => {
  beforeEach(() => {
    clearPricingConfigCache();
  });

  it("calculates subtotal, 5% GST, packing charge, delivery fee, and grand total with default config", async () => {
    const items = [
      { id: "item_1", price: 200, quantity: 2 },
      { id: "item_2", price: 100, quantity: 1 },
    ];

    // Subtotal: (200*2) + (100*1) = 500
    // Tax: 5% of 500 = 25
    // Packing fee: 3 items * 5 = 15
    // Delivery fee for delivery > 499: 0
    // Grand total: 500 + 25 + 15 + 0 = 540
    const result = await computeServerPrice(items, "delivery");

    expect(result.subtotal).toBe(500);
    expect(result.tax).toBe(25);
    expect(result.packingFee).toBe(15);
    expect(result.deliveryFee).toBe(0);
    expect(result.grandTotal).toBe(540);
  });

  it("applies delivery fee of ₹40 for delivery fulfillment with subtotal <= ₹499", async () => {
    const items = [{ id: "item_1", price: 250, quantity: 1 }];

    // Subtotal: 250
    // Tax: 5% of 250 = 12.5
    // Packing fee: 1 * 5 = 5
    // Delivery fee: 40 (since subtotal <= 499)
    // Grand total: 250 + 12.5 + 5 + 40 = 307.5
    const result = await computeServerPrice(items, "delivery");

    expect(result.subtotal).toBe(250);
    expect(result.tax).toBe(12.5);
    expect(result.packingFee).toBe(5);
    expect(result.deliveryFee).toBe(40);
    expect(result.grandTotal).toBe(307.5);
  });

  it("does not apply delivery fee for takeaway or dinein fulfillments", async () => {
    const items = [{ id: "item_1", price: 250, quantity: 1 }];

    // Subtotal: 250, Tax: 12.5, Packing: 5, Delivery: 0 -> Grand Total: 267.5
    const takeawayResult = await computeServerPrice(items, "takeaway");
    expect(takeawayResult.deliveryFee).toBe(0);
    expect(takeawayResult.packingFee).toBe(5);
    expect(takeawayResult.grandTotal).toBe(267.5);

    const dineinResult = await computeServerPrice(items, "dinein");
    expect(dineinResult.deliveryFee).toBe(0);
    expect(dineinResult.packingFee).toBe(5);
    expect(dineinResult.grandTotal).toBe(267.5);
  });

  it("accurately includes item customizations and addons into subtotal and tax", async () => {
    const items = [
      {
        id: "burger_special",
        price: 250,
        quantity: 2,
        customizations: [
          { price: 40 }, // extra cheese
          { price: 60 }, // bacon strip
        ],
      },
    ];

    // Single item base + addons: 250 + 40 + 60 = 350
    // Qty 2 -> Subtotal = 700
    // Tax: 5% of 700 = 35
    // Packing: 2 * 5 = 10
    // Delivery fee for 700: 0
    // Grand Total: 700 + 35 + 10 = 745
    const result = await computeServerPrice(items, "delivery");

    expect(result.subtotal).toBe(700);
    expect(result.tax).toBe(35);
    expect(result.packingFee).toBe(10);
    expect(result.deliveryFee).toBe(0);
    expect(result.grandTotal).toBe(745);
  });

  it("resolves prices dynamically via async priceResolver when price is not pre-populated", async () => {
    const catalogMock: Record<string, number> = {
      prod_smash_01: 299,
      prod_fries_02: 99,
    };

    const mockResolver = async (productId: string) => catalogMock[productId] ?? 0;

    const items = [
      { id: "prod_smash_01", quantity: 2 },
      { id: "prod_fries_02", quantity: 1 },
    ];

    // Subtotal: (299 * 2) + (99 * 1) = 598 + 99 = 697
    // Tax: 697 * 0.05 = 34.85
    // Packing: 3 * 5 = 15
    // Delivery fee: 0 (> 499)
    // Grand total: 697 + 34.85 + 15 = 746.85
    const result = await computeServerPrice(items, "delivery", mockResolver);

    expect(result.subtotal).toBe(697);
    expect(result.tax).toBe(34.85);
    expect(result.packingFee).toBe(15);
    expect(result.deliveryFee).toBe(0);
    expect(result.grandTotal).toBe(746.85);
  });

  it("handles empty items array, zero or negative quantities safely", async () => {
    const emptyResult = await computeServerPrice([], "delivery");
    expect(emptyResult).toEqual({
      subtotal: 0,
      tax: 0,
      deliveryFee: 0,
      packingFee: 0,
      grandTotal: 0,
    });

    const zeroQtyResult = await computeServerPrice(
      [{ id: "item_1", price: 100, quantity: 0 }],
      "takeaway",
    );
    // Quantity defaults to Math.max(1, qty) = 1 -> Subtotal 100, Tax 5, Packing 5 -> Grand Total 110
    expect(zeroQtyResult.subtotal).toBe(100);
    expect(zeroQtyResult.tax).toBe(5);
    expect(zeroQtyResult.packingFee).toBe(5);
    expect(zeroQtyResult.grandTotal).toBe(110);
  });

  it("rounds GST and grandTotal properly to 2 decimal places", async () => {
    const items = [{ id: "item_odd", price: 199.99, quantity: 1 }];

    // Subtotal: 199.99
    // Tax: 199.99 * 0.05 = 9.9995 -> 10.00
    // Packing: 5
    // Delivery fee: 40
    // Grand total: 199.99 + 10.00 + 5 + 40 = 254.99
    const result = await computeServerPrice(items, "delivery");

    expect(result.subtotal).toBe(199.99);
    expect(result.tax).toBe(10);
    expect(result.packingFee).toBe(5);
    expect(result.deliveryFee).toBe(40);
    expect(result.grandTotal).toBe(254.99);
  });

  it("supports client cart format using productId and unitPrice aliases", async () => {
    const items = [
      { productId: "prod_hero_burger", unitPrice: 320, quantity: 2 },
      { productId: "prod_masala_fries", unitPrice: 120, quantity: 1 },
    ];

    // Subtotal: (320 * 2) + (120 * 1) = 760
    // Tax: 760 * 0.05 = 38
    // Packing: 3 * 5 = 15
    // Delivery fee for 760 delivery: 0
    // Grand Total: 760 + 38 + 15 = 813
    const result = await computeServerPrice(items, "delivery");

    expect(result.subtotal).toBe(760);
    expect(result.tax).toBe(38);
    expect(result.packingFee).toBe(15);
    expect(result.deliveryFee).toBe(0);
    expect(result.grandTotal).toBe(813);
  });

  it("falls back cleanly to client price when catalog resolver returns null or undefined", async () => {
    const mockResolver = async () => null;

    const items = [{ productId: "prod_offline_item", unitPrice: 250, quantity: 1 }];

    // Subtotal: 250
    // Tax: 250 * 0.05 = 12.5
    // Packing: 5
    // Delivery fee: 0 for takeaway
    // Grand Total: 267.5
    const result = await computeServerPrice(items, "takeaway", mockResolver);

    expect(result.subtotal).toBe(250);
    expect(result.tax).toBe(12.5);
    expect(result.packingFee).toBe(5);
    expect(result.deliveryFee).toBe(0);
    expect(result.grandTotal).toBe(267.5);
  });

  describe("resolveStorePricingConfig strict mode & caching", () => {
    it("resolves store pricing config when present on store doc", async () => {
      const mockDb = {
        collection: (col: string) => ({
          doc: (id: string) => ({
            get: async () => ({
              exists: true,
              data: () =>
                col === "stores"
                  ? {
                      pricing: {
                        gstRate: 0.05,
                        packingChargePerItem: 10,
                        deliveryFeeFlat: 35,
                        freeDeliveryThreshold: 500,
                      },
                    }
                  : null,
            }),
          }),
        }),
      };

      const config = await resolveStorePricingConfig(mockDb, "store_123");
      expect(config.gstRate).toBe(0.05);
      expect(config.packingChargePerItem).toBe(10);
      expect(config.deliveryFeeFlat).toBe(35);
      expect(config.freeDeliveryThreshold).toBe(500);
    });

    it("falls back to app_settings/pricing when store doc lacks pricing", async () => {
      const mockDb = {
        collection: (col: string) => ({
          doc: (id: string) => ({
            get: async () => {
              if (col === "stores" || col === "admin_stores") {
                return { exists: true, data: () => ({ name: "Test Store" }) };
              }
              if (col === "app_settings" && id === "pricing") {
                return {
                  exists: true,
                  data: () => ({
                    gstRate: 0.05,
                    packingChargePerItem: 5,
                    deliveryFeeFlat: 40,
                    freeDeliveryThreshold: 499,
                  }),
                };
              }
              return { exists: false, data: () => null };
            },
          }),
        }),
      };

      const config = await resolveStorePricingConfig(mockDb, "store_no_pricing");
      expect(config.deliveryFeeFlat).toBe(40);
      expect(config.packingChargePerItem).toBe(5);
    });

    it("fails closed with PRICING_CONFIG_UNAVAILABLE in strict mode when unseeded", async () => {
      const mockEmptyDb = {
        collection: () => ({
          doc: () => ({
            get: async () => ({ exists: false, data: () => null }),
          }),
        }),
      };

      await expect(resolveStorePricingConfig(mockEmptyDb, "store_missing")).rejects.toThrow(
        "PRICING_CONFIG_UNAVAILABLE",
      );
    });
  });
});
