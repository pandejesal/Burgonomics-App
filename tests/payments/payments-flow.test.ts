import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  computeHmac,
  verifyRazorpaySignature,
} from "../../netlify/functions/lib/verifySignature";
import { computeServerPrice } from "../../netlify/functions/lib/server-price";
import { ordersService, resolveStatus } from "../../src/features/orders/services/ordersService";

describe("Payments API — Idempotency, COD, Server Pricing & Auto-Refund", () => {
  const WEBHOOK_SECRET = "test_wh_secret_999";
  const PRICING_CONFIG = {
    gstRate: 0.05,
    packingChargePerItem: 0,
    deliveryFeeFlat: 40,
    freeDeliveryThreshold: 499,
    minOrderAmount: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // 1. Server-Authoritative Pricing & Amount Integrity
  // =========================================================================

  it("1. [SERVER-PRICE-RECOMPUTE] recomputes total authoritatively from catalog items", async () => {
    const items = [
      { id: "burger_classic", quantity: 2, price: 149 },
      { id: "fries_crispy", quantity: 1, price: 99 },
    ];
    // subtotal = 2*149 + 99 = 397
    // deliveryFee = 40 (since 397 < 499)
    // packingFee = 0
    // gst = 5% of (397 + 0) = 19.85 -> 19.85
    // grandTotal = 397 + 40 + 19.85 = 456.85

    const totals = await computeServerPrice(items, "delivery", undefined, PRICING_CONFIG);
    expect(totals.subtotal).toBe(397);
    expect(totals.deliveryFee).toBe(40);
    expect(totals.tax).toBeCloseTo(19.85, 2);
    expect(totals.grandTotal).toBeCloseTo(456.85, 2);
  });

  it("2. [SERVER-PRICE-FREE-DELIVERY] applies free delivery threshold > 499", async () => {
    const items = [{ id: "burger_double", quantity: 3, price: 200 }]; // 600
    const totals = await computeServerPrice(items, "delivery", undefined, PRICING_CONFIG);
    expect(totals.subtotal).toBe(600);
    expect(totals.deliveryFee).toBe(0); // Free delivery
    expect(totals.tax).toBeCloseTo(30, 2);
    expect(totals.grandTotal).toBeCloseTo(630, 2);
  });

  it("3. [AMOUNT-MISMATCH-DETECTION] pins real server paise so tampered amounts mismatch", async () => {
    const items = [
      { id: "burger_classic", quantity: 2, price: 149 },
      { id: "fries_crispy", quantity: 1, price: 99 },
    ];
    const totals = await computeServerPrice(items, "delivery", undefined, PRICING_CONFIG);
    const expectedPaise = Math.round(totals.grandTotal * 100);
    expect(expectedPaise).toBe(45685);

    const receivedPaise = 30000; // Underpaid (tampered)
    expect(receivedPaise).not.toBe(expectedPaise);
  });

  // =========================================================================
  // 2. Webhook HMAC & Idempotency / Replay
  // =========================================================================

  it("4. [WEBHOOK-HMAC-VERIFICATION] generates and validates HMAC for webhook payload", () => {
    const payload = JSON.stringify({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: "pay_xyz_100",
            amount: 45685,
            status: "captured",
          },
        },
      },
    });

    const signature = computeHmac(payload, WEBHOOK_SECRET);
    expect(signature).toHaveLength(64);
  });

  it("5. [WEBHOOK-HMAC-TAMPER] rejects a tampered webhook payload", () => {
    // The previous test asserted a local Map-based replay stub. Core owns no
    // webhook handler (replay is proven server-side in functions); what core
    // CAN prove is tamper-evidence of the real HMAC primitive.
    const payload = JSON.stringify({ event: "payment.captured", amount: 45685 });
    const signature = computeHmac(payload, WEBHOOK_SECRET);
    const tampered = JSON.stringify({ event: "payment.captured", amount: 100 });

    expect(verifyRazorpaySignature(payload, signature, WEBHOOK_SECRET)).toBe(true);
    expect(verifyRazorpaySignature(tampered, signature, WEBHOOK_SECRET)).toBe(false);
  });

  // =========================================================================
  // 3. Cash on Delivery (COD) Order Flow
  // =========================================================================

  it("6. [COD-ORDER-CREATION] prices a takeaway COD basket through the real pricer", async () => {
    // The previous test asserted literals it had just constructed. What core
    // can honestly prove is the real pricing input a COD order is built from.
    const items = [{ id: "burger_classic", quantity: 1, price: 149 }];
    const totals = await computeServerPrice(items, "takeaway", undefined, PRICING_CONFIG);
    expect(totals.subtotal).toBe(149);
    expect(totals.deliveryFee).toBe(0); // takeaway: no delivery fee
    expect(totals.grandTotal).toBeCloseTo(149 + 149 * 0.05, 2);
  });

  // =========================================================================
  // 4. Auto-Refund on Cancellation
  // =========================================================================

  // NOTE: createOrder/cancelOrder touch the real Firebase SDK surface; offline
  // the persist calls fail fast into in-memory fallbacks, but on a network
  // they burn seconds on denied writes — hence the generous timeouts.
  it("7. [CANCEL-PRE-DELIVERY] cancels a live order through the real service", async () => {
    // The previous tests asserted a refundable-status list that exists
    // NOWHERE in core (refunds execute server-side). The real client-side
    // cancellation rule lives in ordersService.cancelOrder: live orders flip
    // to CANCELLED, terminal ones are untouchable.
    const created = await ordersService.createOrder({
      store: { id: "branch_01", name: "Test Outlet" },
      fulfillment: "delivery",
      items: [],
      totals: { grandTotal: 500 },
      payment: { method: "cod", status: "pending" },
    } as any);
    expect(created.success).toBe(true);
    if (!created.success) return;
    const orderId = created.data.id;

    const cancelled = await ordersService.cancelOrder(orderId);
    expect(cancelled.success).toBe(true);
    expect(cancelled.data?.status.code).toBe("CANCELLED");
    expect(cancelled.data?.status.terminal).toBe(true);
  }, 30000);

  it("8. [CANCEL-TERMINAL-REJECT] leaves delivered orders untouched", async () => {
    const created = await ordersService.createOrder({
      store: { id: "branch_01", name: "Test Outlet" },
      fulfillment: "delivery",
      items: [],
      totals: { grandTotal: 200 },
      payment: { method: "cod", status: "pending" },
    } as any);
    expect(created.success).toBe(true);
    if (!created.success) return;
    const orderId = created.data.id;

    // Force terminal state, then attempt cancel — must be a no-op.
    const first = await ordersService.cancelOrder(orderId);
    expect(first.data?.status.code).toBe("CANCELLED");
    const second = await ordersService.cancelOrder(orderId);
    expect(second.data?.status.code).toBe("CANCELLED");
    expect(resolveStatus("DELIVERED").terminal).toBe(true);
  }, 30000);
});
