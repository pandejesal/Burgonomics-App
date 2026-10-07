import { describe, it, expect } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getTrackingStateFromOrder } from "../features/tracking/hooks/usePorterLiveTracking";
import { LiveOrderMap } from "../features/tracking/components/LiveOrderMap";
import { DeliveryStepTracker } from "../features/tracking/components/DeliveryStepTracker";
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
      // ETA comes from order.estimatedAt only — this order has none.
      expect(state.etaMinutes).toBeNull();
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
      // No hardcoded stage countdown — null without a real estimate.
      expect(state.etaMinutes).toBeNull();
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
      // A delivered order without an estimate has no ETA to report.
      expect(state.etaMinutes).toBeNull();
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
    it("returns null coordinates instead of fabricating defaults when coordinates are missing", () => {
      const order = {
        id: "ord_301",
        status: { code: "ORDER_PLACED", label: "Placed", kind: "upcoming", terminal: false },
      } as unknown as Order;

      const state = getTrackingStateFromOrder(order);
      expect(state.storeLocation).toBeNull();
      expect(state.dropLocation).toBeNull();
    });

    it("keeps real outlet and address coordinates when the order provides them", () => {
      const order = {
        id: "ord_302",
        status: { code: "OUT_FOR_DELIVERY", label: "Out for Delivery", kind: "in_progress", terminal: false },
        fulfillment: "delivery",
        store: { id: "s1", name: "Burgonomics CG Road", lat: 23.0131, lng: 72.5085 },
        address: { label: "Home", line1: "5 River Side", lat: 23.0338, lng: 72.5262 },
      } as unknown as Order;

      const state = getTrackingStateFromOrder(order);
      expect(state.storeLocation).toEqual({ lat: 23.0131, lng: 72.5085 });
      expect(state.dropLocation).toEqual({ lat: 23.0338, lng: 72.5262 });
      // GPS absent → no rider pin source, ever.
      expect(state.riderLocation).toBeNull();
    });
  });

  describe("4. Honest map rendering (P1-2)", () => {
    const noCoordsOrder = {
      id: "ord_401",
      status: { code: "OUT_FOR_DELIVERY", label: "Out for Delivery", kind: "in_progress", terminal: false },
      fulfillment: "delivery",
      store: { id: "s1", name: "Burgonomics CG Road" },
    } as unknown as Order;

    const withCoordsOrder = {
      id: "ord_402",
      status: { code: "OUT_FOR_DELIVERY", label: "Out for Delivery", kind: "in_progress", terminal: false },
      fulfillment: "delivery",
      store: { id: "s1", name: "Burgonomics CG Road", lat: 23.0131, lng: 72.5085 },
      address: { label: "Home", line1: "5 River Side", lat: 23.0338, lng: 72.5262 },
    } as unknown as Order;

    it("renders no map and no Google Maps link when coordinates are null", () => {
      const state = getTrackingStateFromOrder(noCoordsOrder);
      expect(state.storeLocation).toBeNull();
      expect(state.dropLocation).toBeNull();

      const html = renderToStaticMarkup(<LiveOrderMap tracking={state} />);
      expect(html).toBe("");
      expect(html).not.toContain("google.com/maps");
      expect(html).not.toContain("Open in Google Maps");
    });

    it("renders no rider pin or GPS chip when riderLocation is null", () => {
      const state = getTrackingStateFromOrder(withCoordsOrder);
      expect(state.storeLocation).not.toBeNull();
      expect(state.dropLocation).not.toBeNull();
      expect(state.riderLocation).toBeNull();

      const html = renderToStaticMarkup(<LiveOrderMap tracking={state} />);
      // Real route still renders — honestly labeled.
      expect(html).not.toBe("");
      expect(html).toContain("Route overview");
      expect(html).not.toContain("Live Porter Courier GPS");
      expect(html).not.toContain("rider-pin");
      expect(html).not.toContain("Porter En-Route");
      expect(html).not.toContain("Porter Live Radar");
      // Directions link uses only the real coordinates supplied above.
      expect(html).toContain("origin=23.0131,72.5085");
      expect(html).toContain("destination=23.0338,72.5262");
    });

    it("renders a rider pin and GPS chip only when the backend supplied rider GPS", () => {
      const state = getTrackingStateFromOrder(withCoordsOrder);
      const withGps = {
        ...state,
        riderLocation: { lat: 23.02, lng: 72.515 },
        riderName: "Vikram Rathore",
      };

      const html = renderToStaticMarkup(<LiveOrderMap tracking={withGps} />);
      expect(html).toContain("rider-pin");
      expect(html).toContain("Live Porter Courier GPS");
    });

    it("keeps the takeaway map when the outlet coordinates are real", () => {
      const order = {
        id: "ord_403",
        status: { code: "READY", label: "Ready", kind: "in_progress", terminal: false },
        fulfillment: "takeaway",
        store: { id: "s1", name: "Burgonomics CG Road", lat: 23.0131, lng: 72.5085 },
      } as unknown as Order;

      const state = getTrackingStateFromOrder(order);
      // The outlet is the pickup destination — no invented drop point.
      expect(state.dropLocation).toEqual({ lat: 23.0131, lng: 72.5085 });

      const html = renderToStaticMarkup(<LiveOrderMap tracking={state} />);
      expect(html).not.toBe("");
      expect(html).toContain("Outlet Directions Map");
      expect(html).toContain("origin=23.0131,72.5085");
      expect(html).not.toContain("rider-pin");
    });
  });

  describe("5. ETA derivation from order.estimatedAt", () => {
    it("returns null when the order carries no estimatedAt", () => {
      const order = {
        id: "ord_501",
        status: { code: "KITCHEN_PREPARING", label: "Grilling", kind: "in_progress", terminal: false },
        fulfillment: "delivery",
      } as unknown as Order;

      expect(getTrackingStateFromOrder(order).etaMinutes).toBeNull();
    });

    it("derives minutes remaining from the real estimatedAt timestamp", () => {
      const order = {
        id: "ord_502",
        status: { code: "KITCHEN_PREPARING", label: "Grilling", kind: "in_progress", terminal: false },
        fulfillment: "delivery",
        estimatedAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      } as unknown as Order;

      const eta = getTrackingStateFromOrder(order).etaMinutes;
      expect(eta).toBeGreaterThanOrEqual(29);
      expect(eta).toBeLessThanOrEqual(30);
    });
  });

  describe("6. Tracker honesty (P1-2)", () => {
    it("shows 'Estimate unavailable' instead of a countdown when ETA is null", () => {
      const order = {
        id: "ord_601",
        status: { code: "KITCHEN_PREPARING", label: "Grilling", kind: "in_progress", terminal: false },
        fulfillment: "delivery",
      } as unknown as Order;

      const html = renderToStaticMarkup(<DeliveryStepTracker tracking={getTrackingStateFromOrder(order)} />);
      expect(html).toContain("Estimate unavailable");
      expect(html).not.toContain("mins");
    });

    it("does not assert a courier exists at stage 3 before dispatch assigns one", () => {
      const order = {
        id: "ord_602",
        status: { code: "OUT_FOR_DELIVERY", label: "Out for Delivery", kind: "in_progress", terminal: false },
        fulfillment: "delivery",
      } as unknown as Order;

      const html = renderToStaticMarkup(<DeliveryStepTracker tracking={getTrackingStateFromOrder(order)} />);
      expect(html).toContain("courier details appear after dispatch");
      expect(html).not.toContain("With Courier");
      expect(html).not.toContain("Porter 2-wheeler courier is en-route");
    });

    it("keeps courier copy when the order actually names a rider", () => {
      const order = {
        id: "ord_603",
        status: { code: "OUT_FOR_DELIVERY", label: "Out for Delivery", kind: "in_progress", terminal: false },
        fulfillment: "delivery",
        delivery: { riderName: "Vikram Rathore", riderPhone: "+91 98250 88991" },
      } as unknown as Order;

      const html = renderToStaticMarkup(<DeliveryStepTracker tracking={getTrackingStateFromOrder(order)} />);
      expect(html).toContain("With Courier");
      expect(html).not.toContain("courier details appear after dispatch");
    });
  });
});
