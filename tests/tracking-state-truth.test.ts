// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { getTrackingStateFromOrder } from "../src/features/tracking/hooks/usePorterLiveTracking";
import type { Order } from "../src/features/orders";

/**
 * Tracking-state TRUTH contract (claim A):
 * - FAILED is a terminal, non-progressing state (was falling through to the
 *   stage-1 "Order Placed & Confirmed" copy with a bouncing active step).
 * - Refund claims appear ONLY when the server wrote a refunded payment
 *   marker; the client initiates no refund anywhere.
 * - Takeaway pickup copy references the actual order reference — never an
 *   invented "Order PIN"/OTP (no such field exists on the order model).
 */

const order = (overrides: Record<string, unknown> = {}): Order =>
  ({
    id: "ord_x",
    fulfillment: "delivery",
    status: { code: "PLACED", label: "Order placed", kind: "upcoming", terminal: false },
    payment: { method: "online", label: "Paid Online", status: "paid" },
    store: null,
    items: [],
    ...overrides,
  }) as unknown as Order;

describe("tracking state truth — FAILED / refund claims / pickup reference", () => {
  it("FAILED renders an honest non-progressing terminal state, not stage-1 progress", () => {
    const s = getTrackingStateFromOrder(
      order({
        status: { code: "FAILED", label: "Failed", kind: "failed", terminal: true },
      }),
    );
    expect(s.stageName).toBe("Order Failed");
    expect(s.isCancelled).toBe(true); // terminal visual, no animated progress
    expect(s.isDelivered).toBe(false);
    expect(s.etaMinutes).toBeNull();
    expect(s.stageDescription).not.toContain("queueing ingredients");
  });

  it("cancelled copy claims a refund ONLY on a server-written refunded marker", () => {
    const unRefunded = getTrackingStateFromOrder(
      order({
        status: { code: "CANCELLED", label: "Cancelled", kind: "cancelled", terminal: true },
      }),
    );
    expect(unRefunded.stageName).toBe("Order Cancelled");
    expect(unRefunded.stageDescription).not.toContain("Refund");

    const refunded = getTrackingStateFromOrder(
      order({
        status: { code: "CANCELLED", label: "Cancelled", kind: "cancelled", terminal: true },
        payment: { method: "online", label: "Paid Online", status: "refunded" },
      }),
    );
    expect(refunded.stageDescription).toContain("refund");
  });

  it("takeaway READY copy shows the ACTUAL order reference and never invents a PIN/OTP", () => {
    const s = getTrackingStateFromOrder(
      order({
        fulfillment: "takeaway",
        shortCode: "REF42",
        status: {
          code: "READY_FOR_PICKUP",
          label: "Ready for pickup",
          kind: "in_progress",
          terminal: false,
        },
      }),
    );
    expect(s.stageDescription).toContain("#REF42");
    expect(s.stageDescription).not.toMatch(/PIN|OTP/i);

    // Backend order number takes precedence when present.
    const s2 = getTrackingStateFromOrder(
      order({
        fulfillment: "takeaway",
        shortCode: "SC01",
        orderNumber: "200341",
        status: {
          code: "READY_FOR_PICKUP",
          label: "Ready for pickup",
          kind: "in_progress",
          terminal: false,
        },
      }),
    );
    expect(s2.stageDescription).toContain("#200341");
  });

  it("positive control: a live pickup delivery still reaches stage 3 normally", () => {
    const s = getTrackingStateFromOrder(
      order({
        status: {
          code: "OUT_FOR_DELIVERY",
          label: "Out for delivery",
          kind: "in_progress",
          terminal: false,
        },
      }),
    );
    expect(s.currentStage).toBe(3);
    expect(s.stageName).toBe("Out for Delivery with Porter");
    expect(s.isCancelled).toBe(false);
  });
});
