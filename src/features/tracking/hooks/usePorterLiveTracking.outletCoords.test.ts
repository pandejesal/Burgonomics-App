/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from "vitest";
import { getTrackingStateFromOrder } from "./usePorterLiveTracking";
import { useStoreSelection } from "@/features/stores/state/storeStore";
import type { Order } from "@/features/orders";

/**
 * The Firestore order doc often carries the outlet reference
 * (`store.id` / top-level `branchId` / `storeId`) without embedding
 * `store.lat` / `store.lng`. The tracker must then resolve the outlet
 * from the verified list already held in the store store — otherwise
 * the map falls back to "Live location unavailable".
 */
describe("Outlet coordinate fallback in getTrackingStateFromOrder", () => {
  const outlet = {
    id: "str_001",
    name: "Burgonomics CG Road",
    lat: 23.0131,
    lng: 72.5085,
    partnerBranchId: "branch_9",
  };

  beforeEach(() => {
    useStoreSelection.setState({ stores: [outlet as any] });
  });

  it("keeps the order's own coordinates when they are present", () => {
    const order = {
      id: "o0",
      status: { code: "OUT_FOR_DELIVERY" },
      fulfillment: "delivery",
      store: { id: "str_001", lat: 12.9716, lng: 77.5946 },
    } as unknown as Order;

    // The order document is authoritative — no store-store override.
    expect(getTrackingStateFromOrder(order).storeLocation).toEqual({
      lat: 12.9716,
      lng: 77.5946,
    });
  });

  it("resolves the outlet from store.id when the order omits lat/lng", () => {
    const order = {
      id: "o1",
      status: { code: "OUT_FOR_DELIVERY" },
      fulfillment: "delivery",
      store: { id: "str_001" },
    } as unknown as Order;

    expect(getTrackingStateFromOrder(order).storeLocation).toEqual({
      lat: 23.0131,
      lng: 72.5085,
    });
  });

  it("resolves the outlet from the top-level branchId via partnerBranchId", () => {
    const order = {
      id: "o2",
      status: { code: "OUT_FOR_DELIVERY" },
      fulfillment: "delivery",
      branchId: "branch_9",
      store: { name: "Burgonomics CG Road" },
    } as unknown as Order;

    expect(getTrackingStateFromOrder(order).storeLocation).toEqual({
      lat: 23.0131,
      lng: 72.5085,
    });
  });

  it("resolves the outlet from a top-level storeId", () => {
    const order = {
      id: "o3",
      status: { code: "OUT_FOR_DELIVERY" },
      fulfillment: "delivery",
      storeId: "str_001",
    } as unknown as Order;

    expect(getTrackingStateFromOrder(order).storeLocation).toEqual({
      lat: 23.0131,
      lng: 72.5085,
    });
  });

  it("stays null when no known outlet matches the reference", () => {
    const order = {
      id: "o4",
      status: { code: "OUT_FOR_DELIVERY" },
      fulfillment: "delivery",
      store: { id: "str_unknown" },
    } as unknown as Order;

    expect(getTrackingStateFromOrder(order).storeLocation).toBeNull();
  });

  it("stays null when the matched outlet carries no finite coordinates", () => {
    useStoreSelection.setState({
      stores: [{ id: "str_nan", lat: "x", lng: null } as any],
    });
    const order = {
      id: "o5",
      status: { code: "OUT_FOR_DELIVERY" },
      fulfillment: "delivery",
      store: { id: "str_nan" },
    } as unknown as Order;

    expect(getTrackingStateFromOrder(order).storeLocation).toBeNull();
  });

  it("stays null when the order carries no outlet reference at all", () => {
    const order = {
      id: "o6",
      status: { code: "ORDER_PLACED" },
      fulfillment: "delivery",
    } as unknown as Order;

    expect(getTrackingStateFromOrder(order).storeLocation).toBeNull();
  });
});
