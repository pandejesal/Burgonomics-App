/**
 * Route-import smoke test (Batch-2 S2 gate). Every money-path route and
 * feature barrel must resolve its import graph — no dangling barrels or
 * missing components. Asserts the TanStack Route object exists per file.
 *
 * Node env: leaflet (imported by AddressForm) needs `window`, so it is
 * mocked — the smoke test proves module resolution, not map rendering.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("leaflet", () => ({
  default: {
    divIcon: () => ({}),
    icon: () => ({}),
    map: () => ({}),
    marker: () => ({}),
    latLng: () => ({}),
  },
}));

vi.mock("react-leaflet", () => ({
  MapContainer: () => null,
  TileLayer: () => null,
  Marker: () => null,
  useMap: () => ({ setView: () => {} }),
}));

describe("route imports resolve", () => {
  it("cart route", async () => {
    const m = await import("../src/routes/cart");
    expect(m.Route).toBeDefined();
  }, 120000);

  it("checkout route", async () => {
    const m = await import("../src/routes/checkout");
    expect(m.Route).toBeDefined();
  }, 120000);

  it("payment route", async () => {
    const m = await import("../src/routes/payment");
    expect(m.Route).toBeDefined();
  }, 120000);

  it("menu + search + home + product routes", async () => {
    const [menu, search, home, product] = await Promise.all([
      import("../src/routes/menu.index"),
      import("../src/routes/search"),
      import("../src/routes/home"),
      import("../src/routes/menu.product.$productId"),
    ]);
    expect(menu.Route).toBeDefined();
    expect(search.Route).toBeDefined();
    expect(home.Route).toBeDefined();
    expect(product.Route).toBeDefined();
  }, 180000);

  it("track + orders routes", async () => {
    const [track, detail, confirmation] = await Promise.all([
      import("../src/routes/orders.$orderId.track"),
      import("../src/routes/orders.$orderId.index"),
      import("../src/routes/order-confirmation.$orderId"),
    ]);
    expect(track.Route).toBeDefined();
    expect(detail.Route).toBeDefined();
    expect(confirmation.Route).toBeDefined();
  }, 180000);

  it("feature barrels export their route-facing symbols", async () => {
    const [cart, checkout, tracking, payments, orders] = await Promise.all([
      import("../src/features/cart"),
      import("../src/features/checkout"),
      import("../src/features/tracking"),
      import("../src/features/payments"),
      import("../src/features/orders"),
    ]);
    for (const name of [
      "CartItemList",
      "BillBreakdown",
      "DeliveryTipSelector",
      "FloatingCartBar",
    ]) {
      expect(cart[name as keyof typeof cart], `cart/${name}`).toBeDefined();
    }
    for (const name of [
      "AddressSelector",
      "FulfillmentDetailsCard",
      "PaymentMethodSelector",
      "calculateHaversineKm",
    ]) {
      expect(checkout[name as keyof typeof checkout], `checkout/${name}`).toBeDefined();
    }
    for (const name of [
      "DeliveryStepTracker",
      "LiveOrderMap",
      "RiderContactCard",
      "usePorterLiveTracking",
    ]) {
      expect(tracking[name as keyof typeof tracking], `tracking/${name}`).toBeDefined();
    }
    expect(payments.RazorpayModalHandler).toBeDefined();
    for (const name of [
      "OrderSuccessCelebration",
      "EstimatedDeliveryCountdown",
      "InvoiceDownloadButton",
    ]) {
      expect(orders[name as keyof typeof orders], `orders/${name}`).toBeDefined();
    }
  }, 180000);

  it("single pricing schedule constants", async () => {
    const pricing = await import("../src/shared/pricing/pricingEngine");
    expect(pricing.FREE_DELIVERY_THRESHOLD).toBe(499);
    expect(pricing.DELIVERY_FEE_FLAT).toBe(40);
    expect(pricing.DEFAULT_PRICING_CONFIG.freeDeliveryThreshold).toBe(499);
    expect(pricing.DEFAULT_PRICING_CONFIG.deliveryFeeFlat).toBe(40);
  }, 60000);
});
