import { describe, it, expect } from "vitest";
import {
  advanceOrder,
  resolveStatus,
  nextStatusCode,
  buildTimeline,
  TIMELINE_RECIPES,
  type OrderState,
  type FulfillmentType,
} from "../netlify/functions/lib/order-status";

describe("order-status pure logic", () => {
  const baseOrder = (fulfillment: FulfillmentType, placedAtIso: string): OrderState => ({
    id: "ord_test_001",
    fulfillment,
    status: resolveStatus("PLACED"),
    placedAt: placedAtIso,
  });

  it("advances delivery order through the expected recipe steps: PLACED -> PREPARING -> READY_FOR_PICKUP -> OUT_FOR_DELIVERY -> DELIVERED", () => {
    const placedAt = new Date("2026-08-17T12:00:00.000Z");
    const order = baseOrder("delivery", placedAt.toISOString());

    // At t + 10s (< 30s): no step advance
    const res1 = advanceOrder(order, new Date(placedAt.getTime() + 10_000));
    expect(res1.advanced).toBe(false);
    expect(res1.order.status.code).toBe("PLACED");

    // At t + 35s (step 1 = PREPARING)
    const res2 = advanceOrder(order, new Date(placedAt.getTime() + 35_000));
    expect(res2.advanced).toBe(true);
    expect(res2.order.status.code).toBe("PREPARING");
    expect(res2.order.status.terminal).toBe(false);
    expect(res2.timestamps["PREPARING"]).toBeDefined();

    // At t + 65s (step 2 = READY_FOR_PICKUP)
    const res3 = advanceOrder(res2.order, new Date(placedAt.getTime() + 65_000), res2.timestamps);
    expect(res3.advanced).toBe(true);
    expect(res3.order.status.code).toBe("READY_FOR_PICKUP");

    // At t + 95s (step 3 = OUT_FOR_DELIVERY)
    const res4 = advanceOrder(res3.order, new Date(placedAt.getTime() + 95_000), res3.timestamps);
    expect(res4.advanced).toBe(true);
    expect(res4.order.status.code).toBe("OUT_FOR_DELIVERY");

    // At t + 130s (step 4 = DELIVERED, terminal)
    const res5 = advanceOrder(res4.order, new Date(placedAt.getTime() + 130_000), res4.timestamps);
    expect(res5.advanced).toBe(true);
    expect(res5.order.status.code).toBe("DELIVERED");
    expect(res5.order.status.terminal).toBe(true);
    expect(res5.order.completedAt).toBeDefined();
  });

  it("advances takeaway order: PLACED -> PREPARING -> READY_FOR_PICKUP -> PICKED_UP", () => {
    const placedAt = new Date("2026-08-17T12:00:00.000Z");
    const order = baseOrder("takeaway", placedAt.toISOString());

    // Advance directly by 150s (jumping multiple steps to final)
    const res = advanceOrder(order, new Date(placedAt.getTime() + 150_000));
    expect(res.advanced).toBe(true);
    expect(res.order.status.code).toBe("PICKED_UP");
    expect(res.order.status.terminal).toBe(true);
    expect(res.timestamps["PREPARING"]).toBeDefined();
    expect(res.timestamps["READY_FOR_PICKUP"]).toBeDefined();
    expect(res.timestamps["PICKED_UP"]).toBeDefined();
  });

  it("advances dinein order: PLACED -> PREPARING -> READY_TO_SERVE -> COMPLETED", () => {
    const placedAt = new Date("2026-08-17T12:00:00.000Z");
    const order = baseOrder("dinein", placedAt.toISOString());

    // Advance to ready to serve (step 2 = 60s)
    const res = advanceOrder(order, new Date(placedAt.getTime() + 65_000));
    expect(res.advanced).toBe(true);
    expect(res.order.status.code).toBe("READY_TO_SERVE");
    expect(res.order.status.terminal).toBe(false);
  });

  it("does NOT advance already terminal orders (DELIVERED, CANCELLED, FAILED)", () => {
    const placedAt = new Date("2026-08-17T12:00:00.000Z");
    const order: OrderState = {
      id: "ord_cancelled",
      fulfillment: "delivery",
      status: resolveStatus("CANCELLED"),
      placedAt: placedAt.toISOString(),
    };

    const res = advanceOrder(order, new Date(placedAt.getTime() + 500_000));
    expect(res.advanced).toBe(false);
    expect(res.order.status.code).toBe("CANCELLED");
  });

  it("is fully deterministic based on injected now parameter", () => {
    const placedAt = new Date("2026-08-17T12:00:00.000Z");
    const order = baseOrder("delivery", placedAt.toISOString());

    const fixedClock = new Date("2026-08-17T12:01:05.000Z"); // 65s later

    const run1 = advanceOrder(order, fixedClock);
    const run2 = advanceOrder(order, fixedClock);

    expect(run1).toEqual(run2);
    expect(run1.order.status.code).toBe("READY_FOR_PICKUP");
  });

  it("buildTimeline constructs correct step states (completed, current, future)", () => {
    const timestamps = {
      PLACED: "2026-08-17T12:00:00.000Z",
      PREPARING: "2026-08-17T12:00:30.000Z",
    };

    const timeline = buildTimeline("delivery", "PREPARING", timestamps);

    expect(timeline).toHaveLength(5);
    expect(timeline[0].code).toBe("PLACED");
    expect(timeline[0].state).toBe("completed");
    expect(timeline[1].code).toBe("PREPARING");
    expect(timeline[1].state).toBe("current");
    expect(timeline[2].code).toBe("READY_FOR_PICKUP");
    expect(timeline[2].state).toBe("future");
  });

  it("nextStatusCode returns the immediate next recipe code or null if terminal", () => {
    expect(nextStatusCode("delivery", "PLACED")).toBe("PREPARING");
    expect(nextStatusCode("delivery", "DELIVERED")).toBeNull();
    expect(nextStatusCode("takeaway", "READY_FOR_PICKUP")).toBe("PICKED_UP");
    expect(nextStatusCode("takeaway", "PICKED_UP")).toBeNull();
  });
});
