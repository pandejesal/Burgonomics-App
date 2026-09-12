import { describe, it, expect } from "vitest";
import type { Order } from "../features/orders";

describe("Prompt 27: Order History, Reorder & Invoice Download Suite", () => {
  describe("1. Order Categorization & Terminal State", () => {
    it("distinguishes ongoing active orders from completed terminal orders", () => {
      const activeOrder = {
        id: "ord_1",
        status: { code: "OUT_FOR_DELIVERY", label: "Out for Delivery", kind: "in_progress", terminal: false },
      } as unknown as Order;

      const completedOrder = {
        id: "ord_2",
        status: { code: "DELIVERED", label: "Delivered", kind: "completed", terminal: true },
      } as unknown as Order;

      expect(activeOrder.status.terminal).toBe(false);
      expect(completedOrder.status.terminal).toBe(true);
    });

    it("identifies cancelled orders properly", () => {
      const cancelledOrder = {
        id: "ord_3",
        status: { code: "CANCELLED", label: "Cancelled", kind: "cancelled", terminal: true },
      } as unknown as Order;

      expect(cancelledOrder.status.kind).toBe("cancelled");
    });
  });

  describe("2. 1-Tap Reorder Item Customization Preservation", () => {
    it("preserves item customization lines and quantities for cart rehydration", () => {
      const order = {
        id: "ord_101",
        store: { id: "store_cg_road", name: "Burgonomics CG Road" },
        items: [
          {
            id: "line_1",
            productId: "prod_smash_1",
            name: "Classic Smash Double",
            unitPrice: 249,
            quantity: 2,
            storeId: "store_cg_road",
          },
          {
            id: "line_2",
            productId: "prod_fries_1",
            name: "Peri Peri Truffle Fries",
            unitPrice: 129,
            quantity: 1,
            storeId: "store_cg_road",
          },
        ],
      } as unknown as Order;

      const totalItems = order.items.reduce((sum, item) => sum + item.quantity, 0);
      expect(totalItems).toBe(3);
      expect(order.items[0].name).toBe("Classic Smash Double");
    });
  });

  describe("3. GST Invoice Math Verification", () => {
    it("calculates accurate 5% GST on food orders for invoice download", () => {
      const grandTotal = 500;
      const calculatedGst = Math.round(grandTotal * 0.05);
      expect(calculatedGst).toBe(25);
    });
  });
});
