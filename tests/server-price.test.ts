import { describe, it, expect } from "vitest";
import { computeServerPrice } from "../netlify/functions/lib/server-price";

describe("computeServerPrice", () => {
  it("calculates subtotal, 5% GST, delivery fee, and grand total for basic items with direct prices", async () => {
    const items = [
      { id: "item_1", price: 200, quantity: 2 },
      { id: "item_2", price: 100, quantity: 1 },
    ];

    // Subtotal: (200*2) + (100*1) = 500
    // Tax: 5% of 500 = 25
    // Delivery fee for delivery > 499: 0
    // Grand total: 500 + 25 + 0 = 525
    const result = await computeServerPrice(items, "delivery");

    expect(result.subtotal).toBe(500);
    expect(result.tax).toBe(25);
    expect(result.deliveryFee).toBe(0);
    expect(result.grandTotal).toBe(525);
  });

  it("applies delivery fee of ₹40 for delivery fulfillment with subtotal <= ₹499", async () => {
    const items = [{ id: "item_1", price: 250, quantity: 1 }];

    // Subtotal: 250
    // Tax: 5% of 250 = 12.5
    // Delivery fee: 40 (since subtotal <= 499)
    // Grand total: 250 + 12.5 + 40 = 302.5
    const result = await computeServerPrice(items, "delivery");

    expect(result.subtotal).toBe(250);
    expect(result.tax).toBe(12.5);
    expect(result.deliveryFee).toBe(40);
    expect(result.grandTotal).toBe(302.5);
  });

  it("does not apply delivery fee for takeaway or dinein fulfillments", async () => {
    const items = [{ id: "item_1", price: 250, quantity: 1 }];

    const takeawayResult = await computeServerPrice(items, "takeaway");
    expect(takeawayResult.deliveryFee).toBe(0);
    expect(takeawayResult.grandTotal).toBe(262.5);

    const dineinResult = await computeServerPrice(items, "dinein");
    expect(dineinResult.deliveryFee).toBe(0);
    expect(dineinResult.grandTotal).toBe(262.5);
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
    // Delivery fee for 700: 0
    // Grand Total: 735
    const result = await computeServerPrice(items, "delivery");

    expect(result.subtotal).toBe(700);
    expect(result.tax).toBe(35);
    expect(result.deliveryFee).toBe(0);
    expect(result.grandTotal).toBe(735);
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
    // Delivery fee: 0 (> 499)
    // Grand total: 697 + 34.85 = 731.85
    const result = await computeServerPrice(items, "delivery", mockResolver);

    expect(result.subtotal).toBe(697);
    expect(result.tax).toBe(34.85);
    expect(result.deliveryFee).toBe(0);
    expect(result.grandTotal).toBe(731.85);
  });

  it("handles empty items array, zero or negative quantities safely", async () => {
    const emptyResult = await computeServerPrice([], "delivery");
    expect(emptyResult).toEqual({ subtotal: 0, tax: 0, deliveryFee: 0, grandTotal: 0 });

    const zeroQtyResult = await computeServerPrice(
      [{ id: "item_1", price: 100, quantity: 0 }],
      "takeaway",
    );
    // Quantity defaults to Math.max(1, qty) = 1
    expect(zeroQtyResult.subtotal).toBe(100);
    expect(zeroQtyResult.tax).toBe(5);
    expect(zeroQtyResult.grandTotal).toBe(105);
  });

  it("rounds GST and grandTotal properly to 2 decimal places", async () => {
    const items = [{ id: "item_odd", price: 199.99, quantity: 1 }];

    // Subtotal: 199.99
    // Tax: 199.99 * 0.05 = 9.9995 -> 10.00
    // Delivery fee: 40
    // Grand total: 199.99 + 10.00 + 40 = 249.99
    const result = await computeServerPrice(items, "delivery");

    expect(result.subtotal).toBe(199.99);
    expect(result.tax).toBe(10);
    expect(result.deliveryFee).toBe(40);
    expect(result.grandTotal).toBe(249.99);
  });

  it("supports client cart format using productId and unitPrice aliases", async () => {
    const items = [
      { productId: "prod_hero_burger", unitPrice: 320, quantity: 2 },
      { productId: "prod_masala_fries", unitPrice: 120, quantity: 1 },
    ];

    // Subtotal: (320 * 2) + (120 * 1) = 760
    // Tax: 760 * 0.05 = 38
    // Delivery fee for 760 delivery: 0
    // Grand Total: 798
    const result = await computeServerPrice(items, "delivery");

    expect(result.subtotal).toBe(760);
    expect(result.tax).toBe(38);
    expect(result.deliveryFee).toBe(0);
    expect(result.grandTotal).toBe(798);
  });

  it("falls back cleanly to client price when catalog resolver returns null or undefined", async () => {
    const mockResolver = async () => null;

    const items = [{ productId: "prod_offline_item", unitPrice: 250, quantity: 1 }];

    // Subtotal: 250
    // Tax: 250 * 0.05 = 12.5
    // Delivery fee: 0 for takeaway
    // Grand Total: 262.5
    const result = await computeServerPrice(items, "takeaway", mockResolver);

    expect(result.subtotal).toBe(250);
    expect(result.tax).toBe(12.5);
    expect(result.deliveryFee).toBe(0);
    expect(result.grandTotal).toBe(262.5);
  });
});
