import { describe, it, expect } from "vitest";
import { getTrackingStateFromOrder } from "../features/tracking/hooks/usePorterLiveTracking";
import type { Order } from "../features/orders";

describe("Prompt 26: Live Order Tracking & Porter GPS Map Suite", () => {
  describe("1. Domino's 4-Stage Stepper State Mapping", () => {
    it("maps ORDER_PLACED status code to Stage 1", () => {
      const order = {
        id: "ord_101",
        status: { code: "ORDER_PLACED", label: "Order Placed", kind: "upcoming", terminal: false },
        fulfillment: "delivery",
      } as unknown as Order;

      const state = getTrackingStateFromOrder(order);
      expect(state.currentStage).toBe(1);
      expect(state.stageName).toBe("Order Placed & Confirmed");
      expect(state.etaMinutes).toBe(25);
    });

    it("maps KITCHEN_PREPARING status code to Stage 2 with Grilling status", () => {
      const order = {
        id: "ord_102",
        status: { code: "KITCHEN_PREPARING", label: "Grilling", kind: "in_progress", terminal: false },
        fulfillment: "delivery",
      } as unknown as Order;

      const state = getTrackingStateFromOrder(order);
      expect(state.currentStage).toBe(2);
      expect(state.stageName).toBe("Freshly Grilling in Kitchen");
      expect(state.etaMinutes).toBe(18);
    });

    it("maps OUT_FOR_DELIVERY status code to Stage 3 with active Porter rider", () => {
      const order = {
        id: "ord_103",
        status: { code: "OUT_FOR_DELIVERY", label: "Out for Delivery", kind: "in_progress", terminal: false },
        fulfillment: "delivery",
        delivery: {
          riderName: "Vikram Rathore",
          riderPhone: "+91 98250 88991",
          riderVehicleNumber: "GJ-01-AB-1234",
        },
      } as unknown as Order;

      const state = getTrackingStateFromOrder(order);
      expect(state.currentStage).toBe(3);
      expect(state.stageName).toBe("Out for Delivery with Porter");
      expect(state.riderName).toBe("Vikram Rathore");
      expect(state.riderPhone).toBe("+91 98250 88991");
      expect(state.riderVehicleNumber).toBe("GJ-01-AB-1234");
    });

    it("maps DELIVERED status code to Stage 4 Complete", () => {
      const order = {
        id: "ord_104",
        status: { code: "DELIVERED", label: "Delivered", kind: "completed", terminal: true },
        fulfillment: "delivery",
      } as unknown as Order;

      const state = getTrackingStateFromOrder(order);
      expect(state.currentStage).toBe(4);
      expect(state.isDelivered).toBe(true);
      expect(state.etaMinutes).toBe(0);
    });
  });

  describe("2. Takeaway vs Delivery Mode Handling", () => {
    it("switches stage 3 to Counter Pickup ready state for takeaway orders", () => {
      const order = {
        id: "ord_201",
        status: { code: "READY", label: "Ready", kind: "in_progress", terminal: false },
        fulfillment: "takeaway",
      } as unknown as Order;

      const state = getTrackingStateFromOrder(order);
      expect(state.isTakeawayOrDineIn).toBe(true);
      expect(state.currentStage).toBe(3);
      expect(state.stageName).toBe("Packed & Ready for Counter Pickup");
    });
  });

  describe("3. Coordinate Sanity & Geocoding", () => {
    it("provides valid default geocoordinates when coordinates are missing", () => {
      const order = {
        id: "ord_301",
        status: { code: "ORDER_PLACED", label: "Placed", kind: "upcoming", terminal: false },
      } as unknown as Order;

      const state = getTrackingStateFromOrder(order);
      expect(typeof state.storeLocation.lat).toBe("number");
      expect(typeof state.storeLocation.lng).toBe("number");
      expect(typeof state.dropLocation.lat).toBe("number");
      expect(typeof state.dropLocation.lng).toBe("number");
    });
  });
});
