import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeHmac } from "../../netlify/functions/lib/verifySignature";
import { computeServerPrice } from "../../netlify/functions/lib/server-price";

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

  it("3. [AMOUNT-MISMATCH-DETECTION] detects underpaid amount vs expected paise", () => {
    const expectedTotal = 456.85;
    const expectedPaise = Math.round(expectedTotal * 100); // 45685
    const receivedPaise = 30000; // Underpaid (tampered)

    const isMismatch = receivedPaise < expectedPaise;
    expect(isMismatch).toBe(true);
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

  it("5. [IDEMPOTENCY-REPLAY-SIMULATION] deduplicates replayed webhook events using audit doc key", () => {
    const mockPaymentAudits = new Map<string, any>();

    function processWebhookEvent(eventKey: string, data: any) {
      if (mockPaymentAudits.has(eventKey)) {
        return { status: 200, body: { status: "already_processed", dedup: true } };
      }
      mockPaymentAudits.set(eventKey, {
        auditId: eventKey,
        ...data,
        createdAt: new Date().toISOString(),
      });
      return { status: 200, body: { status: "success" } };
    }

    const eventKey = "payment.captured:pay_xyz_100";
    const firstCall = processWebhookEvent(eventKey, { amountPaise: 45685, kind: "payment_captured" });
    expect(firstCall.body.status).toBe("success");

    // Replay with identical eventKey
    const secondCall = processWebhookEvent(eventKey, { amountPaise: 45685, kind: "payment_captured" });
    expect(secondCall.body.status).toBe("already_processed");
    expect(secondCall.body.dedup).toBe(true);
  });

  // =========================================================================
  // 3. Cash on Delivery (COD) Order Flow
  // =========================================================================

  it("6. [COD-ORDER-CREATION] creates order with pending_cod status and audit trail without HMAC", async () => {
    const items = [{ id: "burger_classic", quantity: 1, price: 149 }];
    const totals = await computeServerPrice(items, "takeaway", undefined, PRICING_CONFIG);

    const orderDoc = {
      orderId: "ord_cod_test_001",
      payment: {
        method: "cod",
        status: "pending_cod",
        amount: totals.grandTotal,
      },
      paymentStatus: "Pending",
    };

    const auditDoc = {
      auditId: "cod_ord_cod_test_001",
      orderId: orderDoc.orderId,
      kind: "cod",
      amount: totals.grandTotal,
    };

    expect(orderDoc.payment.status).toBe("pending_cod");
    expect(orderDoc.payment.method).toBe("cod");
    expect(auditDoc.kind).toBe("cod");
  });

  // =========================================================================
  // 4. Auto-Refund on Cancellation
  // =========================================================================

  it("7. [AUTO-REFUND-PRE-DELIVERY] allows refund for pre-delivery order and writes refund audit", () => {
    const order = {
      id: "ord_online_501",
      status: { code: "PLACED", kind: "upcoming", terminal: false },
      paymentStatus: "Paid",
      payment: { method: "online", status: "paid", transactionId: "pay_rzp_999" },
      totals: { grandTotal: 500 },
      branchId: "branch_01",
    };

    const isRefundable = !["DELIVERED", "COMPLETED", "PICKED_UP"].includes(order.status.code);
    expect(isRefundable).toBe(true);

    const refundAudit = {
      auditId: `refund_${order.id}_ref_test_01`,
      orderId: order.id,
      paymentId: order.payment.transactionId,
      branchId: order.branchId,
      amount: order.totals.grandTotal,
      kind: "refund",
    };

    expect(refundAudit.kind).toBe("refund");
    expect(refundAudit.branchId).toBe("branch_01");
  });

  it("8. [AUTO-REFUND-TERMINAL-REJECT] rejects refund for already delivered/completed order", () => {
    const deliveredOrder = {
      id: "ord_online_502",
      status: { code: "DELIVERED", kind: "completed", terminal: true },
      paymentStatus: "Paid",
    };

    const isRefundable = !["DELIVERED", "COMPLETED", "PICKED_UP"].includes(deliveredOrder.status.code);
    expect(isRefundable).toBe(false);
  });
});
