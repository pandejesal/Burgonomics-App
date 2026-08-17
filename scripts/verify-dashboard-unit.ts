/**
 * Real DashboardService Test Suite with Mocked Firestore Responses
 * Directly exercises the real DashboardService class and its calculations.
 */
import { DashboardService } from "../src/admin/dashboard/services/dashboardService";
import { StoreResponse } from "../src/admin/dashboard/types";

// Mock Data
const mockOrdersData = [
  {
    id: "ord-1",
    placedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    orderStatus: "Completed",
    pricing: { finalTotal: 499, couponDiscount: 50 },
    items: [
      { productId: "prod-1", name: "Truffle Smash Burger", quantity: 2, price: 199 },
      { productId: "prod-2", name: "Loaded Truffle Fries", quantity: 1, price: 101 },
    ],
    store: { id: "store-1", name: "Navrangpura" },
  },
  {
    id: "ord-2",
    placedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    orderStatus: "Preparing",
    pricing: { finalTotal: 350 },
    items: [{ productId: "prod-1", name: "Truffle Smash Burger", quantity: 1, price: 199 }],
    store: { id: "store-1", name: "Navrangpura" },
  },
  {
    id: "ord-3",
    placedAt: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString(),
    orderStatus: "Ready",
    pricing: { finalTotal: 280 },
    items: [{ productId: "prod-3", name: "Crispy Paneer Burger", quantity: 1, price: 280 }],
    store: { id: "store-2", name: "Bodakdev" },
  },
  {
    id: "ord-4",
    placedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    orderStatus: "Completed",
    pricing: { finalTotal: 600 },
    items: [{ productId: "prod-1", name: "Truffle Smash Burger", quantity: 3, price: 199 }],
    store: { id: "store-1", name: "Navrangpura" },
  },
];

const mockPaymentsData = [
  {
    id: "pay-1",
    orderId: "ord-1",
    amountPaise: 49900,
    status: "CAPTURED" as const,
    capturedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    currency: "INR",
    gateway: "RAZORPAY",
  },
  {
    id: "pay-2",
    orderId: "ord-2",
    amountPaise: 35000,
    status: "CAPTURED" as const,
    capturedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    currency: "INR",
    gateway: "RAZORPAY",
  },
  {
    id: "pay-3",
    orderId: "ord-3",
    amountPaise: 28000,
    status: "PENDING" as const,
    capturedAt: "",
    createdAt: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString(),
    currency: "INR",
    gateway: "RAZORPAY",
  },
];

const mockRefundsData = [
  {
    id: "ref-1",
    paymentId: "pay-1",
    amountPaise: 5000,
    status: "COMPLETED" as const,
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "ref-2",
    paymentId: "pay-2",
    amountPaise: 10000,
    status: "PENDING" as const,
    createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
  },
];

const mockUsersData = [
  { id: "usr-1", createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() },
  { id: "usr-2", createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString() },
];

const mockStoresData: StoreResponse[] = [
  {
    id: "store-1",
    name: "Burgonomics Navrangpura",
    address: "CG Road",
    city: "Ahmedabad",
    state: "Gujarat",
    pincode: "380009",
    country: "India",
    status: "OPEN",
    latitude: 23.037,
    longitude: 72.562,
  },
  {
    id: "store-2",
    name: "Burgonomics Bodakdev",
    address: "Sindhu Bhavan",
    city: "Ahmedabad",
    state: "Gujarat",
    pincode: "380054",
    country: "India",
    status: "OPEN",
    latitude: 23.045,
    longitude: 72.518,
  },
  {
    id: "store-3",
    name: "Burgonomics Vastrapur",
    address: "Alpha One",
    city: "Ahmedabad",
    state: "Gujarat",
    pincode: "380015",
    country: "India",
    status: "CLOSED",
    latitude: 23.038,
    longitude: 72.531,
  },
];

/**
 * Concrete testable subclass that injects mock Firestore query results
 * while running 100% of real DashboardService business logic & aggregations.
 */
class TestableDashboardService extends DashboardService {
  protected override async fetchOrders(storeId?: string): Promise<any[]> {
    if (!storeId || storeId === "all") return mockOrdersData;
    return mockOrdersData.filter((o) => o.store?.id === storeId);
  }

  protected override async fetchPayments() {
    return mockPaymentsData;
  }

  protected override async fetchRefunds() {
    return mockRefundsData;
  }

  protected override async fetchUsers() {
    return mockUsersData;
  }

  override async getStores(_params?: any) {
    return mockStoresData;
  }
}

async function runTestSuite() {
  console.log("=== EXERCISING REAL DASHBOARD SERVICE IMPLEMENTATION ===");
  const service = new TestableDashboardService();

  // 1. Test getSyncHealth (Honest standby state)
  console.log("\n[Test 1] Real getSyncHealth():");
  const health = await service.getSyncHealth();
  console.log("  ✓ Status:", health.status);
  console.log("  ✓ Connected:", health.connected);
  console.log("  ✓ Message:", `"${health.message}"`);
  if (health.status !== "standby" || health.connected !== false) {
    throw new Error(
      `getSyncHealth failed: expected standby and connected: false, got ${JSON.stringify(health)}`,
    );
  }

  // 2. Test getStores()
  console.log("\n[Test 2] Real getStores():");
  const stores = await service.getStores();
  console.log("  ✓ Total stores loaded:", stores.length);
  const openStores = stores.filter((s) => s.status === "OPEN").length;
  console.log("  ✓ Open stores count:", openStores);
  if (stores.length !== 3 || openStores !== 2) {
    throw new Error(
      `getStores failed: expected 3 total and 2 open, got ${stores.length} and ${openStores}`,
    );
  }

  // 3. Test getLiveCounts()
  console.log("\n[Test 3] Real getLiveCounts():");
  const liveCounts = await service.getLiveCounts();
  console.log("  ✓ ordersLast24h:", liveCounts.ordersLast24h, "(Expected: 3)");
  console.log("  ✓ ordersActive:", liveCounts.ordersActive, "(Expected: 2)");
  console.log("  ✓ paymentsCapturedLast24h:", liveCounts.paymentsCapturedLast24h, "(Expected: 2)");
  console.log("  ✓ refundsPendingCount:", liveCounts.refundsPendingCount, "(Expected: 1)");
  console.log("  ✓ storesActive:", liveCounts.storesActive, "(Expected: 2)");
  console.log(
    "  ✓ realtimeSessionsActive:",
    liveCounts.realtimeSessionsActive,
    "(Expected: 2, plain storesActive)",
  );

  if (
    liveCounts.ordersLast24h !== 3 ||
    liveCounts.ordersActive !== 2 ||
    liveCounts.paymentsCapturedLast24h !== 2 ||
    liveCounts.refundsPendingCount !== 1 ||
    liveCounts.storesActive !== 2 ||
    liveCounts.realtimeSessionsActive !== 2
  ) {
    throw new Error(`Live counts mismatch: ${JSON.stringify(liveCounts)}`);
  }

  // 4. Test getDashboardSnapshot()
  console.log("\n[Test 4] Real getDashboardSnapshot():");
  const now = new Date();
  const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const to = now.toISOString();

  const snapshot = await service.getDashboardSnapshot({ from, to });
  console.log(
    "  ✓ Total Revenue:",
    `₹${snapshot.revenue.totalRevenuePaise / 100} (${snapshot.revenue.totalRevenuePaise} paise)`,
  );
  console.log(
    "  ✓ Completed Refunds:",
    `₹${snapshot.revenue.refundsPaise / 100} (${snapshot.revenue.refundsPaise} paise)`,
  );
  console.log(
    "  ✓ Net Revenue:",
    `₹${snapshot.revenue.netRevenuePaise / 100} (${snapshot.revenue.netRevenuePaise} paise)`,
  );
  console.log("  ✓ Total Orders in range:", snapshot.revenue.orderCount);
  console.log("  ✓ AOV:", `₹${snapshot.revenue.aov / 100} (${snapshot.revenue.aov} paise)`);

  if (
    snapshot.revenue.totalRevenuePaise !== 172900 ||
    snapshot.revenue.refundsPaise !== 5000 ||
    snapshot.revenue.netRevenuePaise !== 167900 ||
    snapshot.revenue.orderCount !== 4 ||
    snapshot.revenue.aov !== 43225
  ) {
    throw new Error(`Revenue snapshot mismatch: ${JSON.stringify(snapshot.revenue)}`);
  }

  // Top products verification
  console.log("  ✓ Top Products Ranking:");
  snapshot.topProducts.forEach((p, i) => {
    console.log(
      `    #${i + 1} ${p.name} (${p.productId}): ${p.units} units, ₹${p.revenuePaise / 100}`,
    );
  });
  if (snapshot.topProducts[0].productId !== "prod-1" || snapshot.topProducts[0].units !== 6) {
    throw new Error(
      `Top product ranking mismatch: expected prod-1 with 6 units, got ${JSON.stringify(snapshot.topProducts[0])}`,
    );
  }

  // 5. Test getRevenueSeries() and getOrderSeries()
  console.log("\n[Test 5] Real Time-Series Bucketing:");
  const revSeries = await service.getRevenueSeries({ from, to, granularity: "day" });
  const orderSeries = await service.getOrderSeries({ from, to, granularity: "day" });
  console.log(`  ✓ Revenue series buckets: ${revSeries.length}`);
  revSeries.forEach((b) => console.log(`    Bucket: ${b.bucket} => ₹${b.value / 100}`));
  console.log(`  ✓ Order series buckets: ${orderSeries.length}`);
  orderSeries.forEach((b) => console.log(`    Bucket: ${b.bucket} => ${b.value} orders`));

  if (revSeries.length === 0 || orderSeries.length === 0) {
    throw new Error("Series bucketing returned empty buckets");
  }

  // 6. Test getAnalyticsSummary()
  console.log("\n[Test 6] Real getAnalyticsSummary():");
  const analytics = await service.getAnalyticsSummary({ from, to });
  console.log("  ✓ Customers totalActive:", analytics.customers.totalActive, "(Expected: 2)");
  console.log(
    "  ✓ Customers newCustomers:",
    analytics.customers.newCustomers,
    "(Expected: 1 within 7 days)",
  );
  console.log(
    "  ✓ Customers returningCustomers:",
    analytics.customers.returningCustomers,
    "(Expected: 1)",
  );
  console.log(
    "  ✓ Offer Redemptions:",
    analytics.offerRedemptions,
    "(Expected: 1 with coupon discount)",
  );

  if (
    analytics.customers.totalActive !== 2 ||
    analytics.customers.newCustomers !== 1 ||
    analytics.customers.returningCustomers !== 1 ||
    analytics.offerRedemptions !== 1
  ) {
    throw new Error(`Analytics summary mismatch: ${JSON.stringify(analytics)}`);
  }

  console.log("\n=======================================================");
  console.log("✓ ALL REAL DASHBOARD SERVICE TESTS PASSED SUCCESSFULLY");
  console.log("=======================================================\n");
}

runTestSuite().catch((err) => {
  console.error("Test Suite Execution Failed:", err);
  process.exit(1);
});
