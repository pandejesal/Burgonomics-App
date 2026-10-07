import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { mapStoreDoc } from "../src/features/stores/services/storesService";
import { EstimatedDeliveryCountdown } from "../src/features/orders/components/EstimatedDeliveryCountdown";
import type { OrderStatusMeta } from "../src/features/orders/models";

/**
 * P1-3 honesty tests: mapStoreDoc must NEVER synthesize measurements.
 * A missing field stays null/absent — no 11:00-23:00 hours, no 25-min ETA,
 * no 15-min pickup ETA, no 40-rupee fee, no 7 km radius, no "Ahmedabad".
 */
describe("mapStoreDoc honesty (P1-3)", () => {
  const base = { lat: 23.0225, lng: 72.5714, name: "Test Outlet" };

  it("drops docs without finite coordinates (fail closed)", () => {
    expect(mapStoreDoc({ name: "No Coords" }, "s1")).toBeNull();
    expect(mapStoreDoc({ ...base, lat: "not-a-number" }, "s2")).toBeNull();
    expect(mapStoreDoc({ ...base, lat: null, lng: null }, "s3")).toBeNull();
  });

  it("never invents hours / ETA / pickup ETA / fee / radius / city", () => {
    const store = mapStoreDoc(base, "s4");
    expect(store).not.toBeNull();
    expect(store!.hours).toBeNull();
    expect(store!.etaMinutes).toBeNull();
    expect(store!.pickupEtaMinutes).toBeNull();
    expect(store!.deliveryFee).toBeFalsy();
    expect(store!.deliveryRadiusKm).toBeNull();
    expect(store!.city).toBe("");
    expect(store!.area).toBe("");
  });

  it("keeps real doc-provided values", () => {
    const store = mapStoreDoc(
      {
        ...base,
        hours: { open: "10:00", close: "22:00" },
        etaMinutes: 35,
        pickupEtaMinutes: 12,
        deliveryRadiusKm: 5,
        pricing: { deliveryFeeFlat: 30 },
        city: "Ahmedabad",
        area: "Navrangpura",
      },
      "s5",
    );
    expect(store!.hours).toEqual({ open: "10:00", close: "22:00" });
    expect(store!.etaMinutes).toBe(35);
    expect(store!.pickupEtaMinutes).toBe(12);
    expect(store!.deliveryRadiusKm).toBe(5);
    expect(store!.deliveryFee).toBe(30);
    expect(store!.city).toBe("Ahmedabad");
    expect(store!.area).toBe("Navrangpura");
  });

  it("reads minPrepMinutes as a real fallback source for etaMinutes", () => {
    const store = mapStoreDoc({ ...base, minPrepMinutes: 20 }, "s6");
    expect(store!.etaMinutes).toBe(20);
  });
});

/**
 * EstimatedDeliveryCountdown must not tick a confident countdown from a
 * fabricated default — no estimate renders as "Estimate unavailable".
 */
describe("EstimatedDeliveryCountdown honesty (P1-3)", () => {
  const status = { code: "PREPARING", kind: "in_progress" } as unknown as OrderStatusMeta;

  it("renders 'Estimate unavailable' when no estimate exists", () => {
    const html = renderToStaticMarkup(
      <EstimatedDeliveryCountdown fulfillment="delivery" status={status} />,
    );
    expect(html).toContain("Estimate unavailable");
    expect(html).not.toContain("Mins Remaining");
  });

  it("still ticks a real estimate", () => {
    const html = renderToStaticMarkup(
      <EstimatedDeliveryCountdown fulfillment="delivery" status={status} estimatedMinutes={30} />,
    );
    expect(html).toContain("30:00");
    expect(html).toContain("Mins Remaining");
    expect(html).not.toContain("Estimate unavailable");
  });
});
