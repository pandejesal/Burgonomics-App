import { describe, it, expect } from "vitest";
import * as serverStatus from "../netlify/functions/lib/order-status";
import * as clientStatus from "../src/features/orders/utils/orderStatusEngine";
import { calculateTotals } from "../src/features/cart/services/cartService";
import { computeServerPrice } from "../netlify/functions/lib/server-price";
import {
  calculateOrderTotals,
  DEFAULT_PRICING_CONFIG,
  type PricingConfig,
} from "../src/shared/pricing/pricingEngine";

describe("Parity Test Suite: Client vs Server Engines (BND-4 / BND-5)", () => {
  describe("Order Status Engine Parity (BND-4)", () => {
    const fulfillments: Array<"delivery" | "takeaway" | "dinein"> = [
      "delivery",
      "takeaway",
      "dinein",
    ];

    it("verifies identical STATUS_CATALOG mapping between client and server", () => {
      expect(clientStatus.STATUS_CATALOG).toEqual(serverStatus.STATUS_CATALOG);
    });

    it("verifies identical TIMELINE_RECIPES between client and server", () => {
      expect(clientStatus.TIMELINE_RECIPES).toEqual(serverStatus.TIMELINE_RECIPES);
    });

    it("verifies identical nextStatusCode outputs for all fulfillments and statuses", () => {
      for (const fulfillment of fulfillments) {
        const recipe = clientStatus.TIMELINE_RECIPES[fulfillment];
        for (const step of recipe) {
          const clientNext = clientStatus.nextStatusCode(fulfillment, step.code);
          const serverNext = serverStatus.nextStatusCode(fulfillment, step.code);
          expect(clientNext).toBe(serverNext);
        }
      }
    });

    it("verifies 1:1 identical step-by-step state progression across time intervals", () => {
      const placedAt = new Date("2026-08-18T10:00:00.000Z");

      for (const fulfillment of fulfillments) {
        const initialClientOrder = {
          id: `ord_${fulfillment}`,
          fulfillment,
          status: clientStatus.resolveStatus("PLACED"),
          placedAt: placedAt.toISOString(),
        };

        const initialServerOrder = {
          id: `ord_${fulfillment}`,
          fulfillment,
          status: serverStatus.resolveStatus("PLACED"),
          placedAt: placedAt.toISOString(),
        };

        // Test over 10 consecutive ticks (every 20s up to 200s)
        let clientTimestamps: Record<string, string> = {};
        let serverTimestamps: Record<string, string> = {};
        let currentClient = initialClientOrder;
        let currentServer = initialServerOrder;

        for (let second = 0; second <= 200; second += 20) {
          const now = new Date(placedAt.getTime() + second * 1000);

          const clientResult = clientStatus.advanceOrder(currentClient, now, clientTimestamps);
          const serverResult = serverStatus.advanceOrder(currentServer, now, serverTimestamps);

          expect(clientResult.advanced).toBe(serverResult.advanced);
          expect(clientResult.order.status.code).toBe(serverResult.order.status.code);
          expect(clientResult.order.status.terminal).toBe(serverResult.order.status.terminal);
          expect(clientResult.order.completedAt).toBe(serverResult.order.completedAt);
          expect(clientResult.timestamps).toEqual(serverResult.timestamps);

          currentClient = clientResult.order;
          currentServer = serverResult.order;
          clientTimestamps = clientResult.timestamps;
          serverTimestamps = serverResult.timestamps;

          // Build timeline check
          const clientTimeline = clientStatus.buildTimeline(
            fulfillment,
            currentClient.status.code,
            clientTimestamps,
          );
          const serverTimeline = serverStatus.buildTimeline(
            fulfillment,
            currentServer.status.code,
            serverTimestamps,
          );

          expect(clientTimeline).toEqual(serverTimeline);
        }
      }
    });
  });

  describe("Pricing Engine Parity (BND-1 / BND-2 / BND-5)", () => {
    const customConfig: PricingConfig = {
      gstRate: 0.05,
      packingChargePerItem: 10,
      deliveryFeeFlat: 50,
      freeDeliveryThreshold: 600,
      minOrderAmount: 100,
    };

    it("verifies exact parity between calculateTotals (client) and computeServerPrice (server)", async () => {
      const items = [
        {
          productId: "prod_burger_1",
          id: "prod_burger_1",
          name: "Classic Cheeseburger",
          unitPrice: 249,
          price: 249,
          quantity: 2,
          customizations: [{ price: 30 }, { price: 20 }],
          modifiers: [{ priceDelta: 30 }, { priceDelta: 20 }],
        },
        {
          productId: "prod_fries_1",
          id: "prod_fries_1",
          name: "Peri Peri Fries",
          unitPrice: 129,
          price: 129,
          quantity: 1,
        },
      ];

      // Subtotal calculation:
      // Item 1: (249 + 30 + 20) * 2 = 299 * 2 = 598
      // Item 2: 129 * 1 = 129
      // Total Subtotal = 727

      // 1. Default config (40 flat delivery, free above 499, packing 5/item)
      // Subtotal = 727 -> Free delivery (727 > 499) -> deliveryFee = 0
      // Tax: 5% of 727 = 36.35
      // Packing: 3 items * 5 = 15
      // Grand Total = 727 + 36.35 + 15 + 0 = 778.35

      const clientRes = calculateTotals({
        lines: items as any,
        fulfillment: "delivery",
        pricingConfig: DEFAULT_PRICING_CONFIG,
      });

      const serverRes = await computeServerPrice(
        items,
        "delivery",
        undefined,
        DEFAULT_PRICING_CONFIG,
      );

      expect(clientRes.subtotal).toBe(727);
      expect(serverRes.subtotal).toBe(727);
      expect(clientRes.taxes).toBe(36.35);
      expect(serverRes.tax).toBe(36.35);
      expect(clientRes.packingFee).toBe(15);
      expect(serverRes.packingFee).toBe(15);
      expect(clientRes.deliveryFee).toBe(0);
      expect(serverRes.deliveryFee).toBe(0);
      expect(clientRes.grandTotal).toBe(778.35);
      expect(serverRes.grandTotal).toBe(778.35);

      // 2. Custom per-store config (threshold 600, packing 10/item)
      // Subtotal = 727 > 600 -> deliveryFee = 0
      // Packing: 3 items * 10 = 30
      // Grand Total = 727 + 36.35 + 30 = 793.35

      const clientCustom = calculateTotals({
        lines: items as any,
        fulfillment: "delivery",
        pricingConfig: customConfig,
      });

      const serverCustom = await computeServerPrice(items, "delivery", undefined, customConfig);

      expect(clientCustom.grandTotal).toBe(serverCustom.grandTotal);
      expect(clientCustom.packingFee).toBe(30);
      expect(serverCustom.packingFee).toBe(30);
    });

    it("verifies delivery fee threshold behavior below and above cutoff", async () => {
      const itemsBelow = [
        {
          productId: "prod_burger_low",
          unitPrice: 350,
          price: 350,
          quantity: 1,
        },
      ];

      // Subtotal = 350 <= 499 -> Delivery fee = 40, packing = 5, tax = 17.5
      // Grand Total = 350 + 17.5 + 5 + 40 = 412.5
      const clientBelow = calculateTotals({
        lines: itemsBelow as any,
        fulfillment: "delivery",
      });
      const serverBelow = await computeServerPrice(itemsBelow, "delivery");

      expect(clientBelow.deliveryFee).toBe(40);
      expect(serverBelow.deliveryFee).toBe(40);
      expect(clientBelow.grandTotal).toBe(412.5);
      expect(serverBelow.grandTotal).toBe(412.5);
    });

    it("verifies promo discounts apply consistently", () => {
      const items = [{ productId: "p1", unitPrice: 500, quantity: 1 }];
      const clientPromo = calculateTotals({
        lines: items as any,
        fulfillment: "takeaway",
        promo: {
          offerId: "off_1",
          code: "FLAT100",
          description: "Flat 100 off",
          discount: 100,
          type: "flat",
        },
      });

      // Subtotal 500, discount 100 -> Taxable 400
      // Tax: 5% of 400 = 20, Packing: 5, Delivery: 0
      // Grand Total: 400 + 20 + 5 = 425
      expect(clientPromo.subtotal).toBe(500);
      expect(clientPromo.promoDiscount).toBe(100);
      expect(clientPromo.taxes).toBe(20);
      expect(clientPromo.packingFee).toBe(5);
      expect(clientPromo.grandTotal).toBe(425);
    });
  });
});
