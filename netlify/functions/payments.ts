import * as admin from "firebase-admin";
import * as crypto from "crypto";
import express, { Request, Response } from "express";
import serverless from "serverless-http";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Razorpay = require("razorpay");

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccountRaw) {
    try {
      const serviceAccount = JSON.parse(serviceAccountRaw);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    } catch (e) {
      console.error("[Netlify Payments] Failed to parse FIREBASE_SERVICE_ACCOUNT JSON", e);
      admin.initializeApp();
    }
  } else {
    admin.initializeApp();
  }
}

const db = admin.firestore();

function getRazorpayInstance() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error(
      "Razorpay credentials are not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in environment variables.",
    );
  }

  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
}

/**
 * Validates the caller's Firebase Auth token.
 */
async function authenticateRequest(req: Request): Promise<admin.auth.DecodedIdToken | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.split("Bearer ")[1];
  try {
    return await admin.auth().verifyIdToken(token);
  } catch (err) {
    console.warn("[Netlify Payments] Authentication token verification failed:", err);
    return null;
  }
}

import { computeServerPrice, resolveStorePricingConfig } from "./lib/server-price";

/**
 * Resolves live product price from Firestore catalog.
 */
async function resolveProductPrice(productId: string): Promise<number | null> {
  if (!productId) return null;
  const prodSnap = await db.collection("petpooja_products").doc(productId).get();
  if (prodSnap.exists) {
    const prodData = prodSnap.data();
    const price = Number(prodData?.price || prodData?.min_price || 0);
    return Number.isNaN(price) ? null : price;
  }
  return null;
}

/**
 * Validates the Razorpay signature for webhook authenticity.
 */
function validateRazorpaySignature(body: string, signature: string, secret: string): boolean {
  const expected = crypto.createHmac("sha256", secret).update(body).digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(signature, "hex");
  } catch {
    return false;
  }
  return provided.length === expected.length && crypto.timingSafeEqual(expected, provided);
}

/**
 * Handler for creating a Razorpay order from backend with server-authoritative pricing.
 */
export async function handleCreatePaymentOrder(req: Request, res: Response) {
  // 1. Authenticate caller (SEC-3: Strictly require valid Firebase ID token)
  const decodedToken = await authenticateRequest(req);
  if (!decodedToken || !decodedToken.uid) {
    res
      .status(401)
      .send({ status: "error", message: "Unauthorized. Valid Firebase ID token is required." });
    return;
  }
  const userId = decodedToken.uid;

  const {
    currency = "INR",
    receipt,
    storeId,
    fulfillment,
    checkoutToken,
    checkoutSnapshot,
  } = req.body;

  const effectiveStoreId = storeId || checkoutSnapshot?.store?.id;
  if (!effectiveStoreId) {
    res.status(400).send({
      status: "error",
      code: "MISSING_STORE_ID",
      message: "storeId is required to create a payment order.",
    });
    return;
  }

  try {
    // 2. Resolve store-level pricing config strictly (fail-closed if unseeded/unreachable)
    let pricingConfig;
    try {
      pricingConfig = await resolveStorePricingConfig(db, effectiveStoreId);
    } catch (pricingErr: any) {
      console.error("[Netlify Payments] Strict pricing config resolution failed:", pricingErr);
      res.status(503).send({
        status: "error",
        code: "PRICING_CONFIG_UNAVAILABLE",
        message: "Store pricing configuration is currently unavailable. Please try again shortly.",
      });
      return;
    }

    // 3. Server-Authoritative Price Engine (PAY-4: 100% computed from catalog; no client amount bypass)
    const items = checkoutSnapshot?.items || req.body?.items || [];
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).send({ status: "error", message: "Order items list cannot be empty." });
      return;
    }

    const serverPrice = await computeServerPrice(
      items,
      fulfillment,
      resolveProductPrice,
      pricingConfig,
    );
    const grandTotal = serverPrice.grandTotal;

    if (grandTotal <= 0) {
      res.status(400).send({
        status: "error",
        message: "Server-calculated order amount must be greater than zero.",
      });
      return;
    }

    const rzp = getRazorpayInstance();
    const amountInPaise = Math.round(grandTotal * 100);

    const orderOptions = {
      amount: amountInPaise,
      currency,
      receipt: receipt || `rcpt_${Date.now()}`,
      notes: {
        userId,
        storeId: effectiveStoreId,
        fulfillment: fulfillment || checkoutSnapshot?.fulfillment || "",
        checkoutToken: checkoutToken || "",
      },
    };

    const rzpOrder = await rzp.orders.create(orderOptions);

    // Save authoritative pre-order snapshot in Firestore
    await db
      .collection("payment_orders")
      .doc(rzpOrder.id)
      .set({
        orderId: rzpOrder.id,
        userId,
        amount: grandTotal,
        amountInPaise,
        currency: rzpOrder.currency || "INR",
        receipt: rzpOrder.receipt,
        status: "PENDING_PAYMENT",
        storeId: effectiveStoreId,
        fulfillment: fulfillment || checkoutSnapshot?.fulfillment || null,
        snapshot: checkoutSnapshot || null,
        pricingConfig,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      });

    res.status(200).send({
      orderId: rzpOrder.id,
      keyId: rzp.key_id,
      amount: grandTotal,
      currency: rzpOrder.currency,
      receipt: rzpOrder.receipt,
      meta: {
        storeId: effectiveStoreId,
        fulfillment: fulfillment || checkoutSnapshot?.fulfillment,
        checkoutToken,
      },
    });
  } catch (err: any) {
    console.error("[Netlify Payments] Error creating Razorpay order:", err);
    res
      .status(500)
      .send({ status: "error", message: err.message || "Failed to create payment order" });
  }
}

/**
 * Handler for verifying a Razorpay payment signature and updating payment state server-side.
 */
export async function handleVerifyPayment(req: Request, res: Response) {
  // 1. Authenticate caller
  const decodedToken = await authenticateRequest(req);
  if (!decodedToken || !decodedToken.uid) {
    res.status(401).send({ status: "error", message: "Unauthorized." });
    return;
  }

  const { orderId, paymentId, signature } = req.body;

  if (!orderId || !paymentId || !signature) {
    res.status(400).send({ status: "error", message: "Missing required verification fields." });
    return;
  }

  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) {
    res
      .status(500)
      .send({ status: "error", message: "Razorpay secret key not configured on server." });
    return;
  }

  const text = `${orderId}|${paymentId}`;
  const expectedSignature = crypto.createHmac("sha256", keySecret).update(text).digest("hex");

  if (expectedSignature !== signature) {
    console.warn(`[Netlify Payments] Signature mismatch for Order ${orderId}`);
    res.status(403).send({ status: "error", message: "Invalid payment signature." });
    return;
  }

  try {
    // 2. Fetch authoritative payment_orders doc
    const paymentOrderRef = db.collection("payment_orders").doc(orderId);
    const paymentOrderSnap = await paymentOrderRef.get();

    if (!paymentOrderSnap.exists) {
      res.status(404).send({ status: "error", message: "Payment order record not found." });
      return;
    }

    const paymentOrderData = paymentOrderSnap.data();

    // 3. Verify payment with Razorpay API (BLOCKING amount integrity check)
    const rzp = getRazorpayInstance();
    let rzpPayment: any = null;
    try {
      rzpPayment = await rzp.payments.fetch(paymentId);
    } catch (e: any) {
      console.error(
        `[Netlify Payments] Razorpay payment fetch failed for ${paymentId}:`,
        e?.message,
      );
      res.status(502).send({
        status: "error",
        message: `Failed to verify payment with gateway: ${e?.message || "Gateway unreachable"}`,
      });
      return;
    }

    if (!rzpPayment) {
      res
        .status(400)
        .send({ status: "error", message: "Gateway payment record could not be retrieved." });
      return;
    }

    const expectedPaise = paymentOrderData?.amountInPaise || 0;
    if (rzpPayment.amount < expectedPaise) {
      console.error(
        `[Netlify Payments] Amount mismatch: expected ${expectedPaise} paise, Razorpay recorded ${rzpPayment.amount} paise`,
      );
      res
        .status(400)
        .send({ status: "error", message: "Paid amount does not match required order total." });
      return;
    }

    // 4. Record verified payment in Firestore
    const paymentsRef = db.collection("payments").doc(paymentId);
    await paymentsRef.set(
      {
        id: paymentId,
        orderId: orderId,
        status: "CAPTURED",
        verificationStatus: "VERIFIED",
        verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        gateway: "razorpay",
        gatewayPaymentId: paymentId,
      },
      { merge: true },
    );

    // 5. Mark payment_orders doc as PAID
    await paymentOrderRef.update({
      status: "PAID",
      paymentId,
      paidAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 6. Mark client order doc as Paid (or synthesize from snapshot if missing)
    const orderRef = db.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();

    if (orderSnap.exists) {
      await orderRef.update({
        paymentStatus: "Paid",
        "payment.status": "paid",
        "payment.transactionId": paymentId,
        "payment.paidAt": admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else if (paymentOrderData?.snapshot) {
      await orderRef.set({
        ...paymentOrderData.snapshot,
        id: orderId,
        userId: paymentOrderData.userId,
        paymentStatus: "Paid",
        payment: {
          ...paymentOrderData.snapshot.payment,
          status: "paid",
          transactionId: paymentId,
          paidAt: new Date().toISOString(),
        },
        petpoojaStatus: "Pending",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    console.info(
      `[Netlify Payments] Successfully verified payment ${paymentId} for order ${orderId}`,
    );
    res.status(200).send({
      verified: true,
      confirmedOrderId: orderId,
    });
  } catch (err: any) {
    console.error("[Netlify Payments] Error finalizing verified payment:", err);
    res
      .status(500)
      .send({ status: "error", message: err.message || "Failed to finalize payment." });
  }
}

/**
 * Finalizes a captured payment (payment.captured / order.paid — the
 * money-in signal). Webhook-first reconciliation:
 *   1. Gateway re-verify via Payments API before any fulfillment.
 *   2. Amount integrity vs the authoritative payment_orders doc.
 *   3. payments doc → payment_orders PAID → orders doc (with orphan recovery).
 */
async function handlePaymentCaptured(orderId: string | null, paymentEntity: any): Promise<void> {
  const paymentId = paymentEntity.id;

  // Defense-in-depth: re-fetch from the gateway; only finalize when Razorpay
  // itself reports the payment as captured.
  const rzp = getRazorpayInstance();
  let apiPayment: any;
  try {
    apiPayment = await rzp.payments.fetch(paymentId);
  } catch (e: any) {
    throw new Error(`Gateway re-verify failed for ${paymentId}: ${e?.message || "unreachable"}`);
  }
  if (!apiPayment) {
    throw new Error(`Gateway re-verify returned no payment for ${paymentId}`);
  }
  if (apiPayment.status !== "captured") {
    console.warn(
      `[Netlify Payments] Payment ${paymentId} not yet captured (status=${apiPayment.status}); skipping finalize`,
    );
    return;
  }

  const paymentsRef = db.collection("payments").doc(paymentId);
  await paymentsRef.set(
    {
      id: paymentId,
      orderId: orderId || null,
      amountPaise: apiPayment.amount,
      currency: apiPayment.currency,
      gateway: "razorpay",
      gatewayPaymentId: paymentId,
      status: "CAPTURED",
      verificationStatus: "VERIFIED",
      capturedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      customer: {
        email: paymentEntity.email || "",
        phone: paymentEntity.contact || "",
      },
    },
    { merge: true },
  );

  if (!orderId) {
    console.warn(
      `[Netlify Payments] Captured payment ${paymentId} without orderId; flagged as ORPHAN_CAPTURED`,
    );
    await paymentsRef.update({
      status: "ORPHAN_CAPTURED",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return;
  }

  const paymentOrderSnap = await db.collection("payment_orders").doc(orderId).get();
  let expectedAmountPaise = paymentOrderSnap.exists
    ? paymentOrderSnap.data()?.amountInPaise || 0
    : 0;

  let orderRef = db.collection("orders").doc(orderId);
  let orderSnap = await orderRef.get();

  if (!orderSnap.exists) {
    const orderQuery = await db.collectionGroup("orders").where("id", "==", orderId).limit(1).get();
    if (!orderQuery.empty) {
      orderRef = orderQuery.docs[0].ref;
      orderSnap = orderQuery.docs[0];
    }
  }

  if (orderSnap.exists) {
    const orderData = orderSnap.data() as any;
    if (!expectedAmountPaise) {
      expectedAmountPaise = Math.round((orderData.totals?.grandTotal || 0) * 100);
    }

    // Idempotent flip: never downgrade an order already paid for this payment.
    if (orderData.paymentStatus === "Paid" && orderData.payment?.transactionId === paymentId) {
      console.info(`[Netlify Payments] Order ${orderId} already paid for ${paymentId}; no-op`);
      return;
    }

    if (apiPayment.amount < expectedAmountPaise) {
      console.error(
        `[Netlify Payments] Amount mismatch for order ${orderId}. Expected ${expectedAmountPaise} paise, got ${apiPayment.amount} paise.`,
      );
      await orderRef.update({
        paymentStatus: "Fraud_PartialPayment",
        "payment.status": "failed",
        "payment.transactionId": paymentId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      await orderRef.update({
        paymentStatus: "Paid",
        "payment.status": "paid",
        "payment.transactionId": paymentId,
        "payment.paidAt": admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.info(`[Netlify Payments] Updated Order ${orderId} to Paid`);
    }

    await paymentOrderSnap.ref.update({
      status: "PAID",
      paymentId,
      paidAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } else if (paymentOrderSnap.exists) {
    const snapData = paymentOrderSnap.data() || {};
    const snapshot = snapData.snapshot || {};
    const placedAt = new Date().toISOString();
    const etaMs = snapshot.fulfillment === "delivery" ? 35 * 60_000 : 20 * 60_000;

    const recoveredOrder = {
      id: orderId,
      shortCode: orderId.slice(-6).toUpperCase(),
      status: {
        code: "PLACED",
        label: "Order placed",
        kind: "upcoming",
        terminal: false,
      },
      fulfillment: snapshot.fulfillment || snapData.fulfillment || "delivery",
      store: snapshot.store || {
        id: snapData.storeId || "unknown",
        name: "Burgonomics",
      },
      address: snapshot.address || null,
      items: snapshot.items || snapshot.lines || [],
      totals: snapshot.totals || {
        grandTotal: snapData.amount || apiPayment.amount / 100,
      },
      promo: snapshot.promo || null,
      notes: snapshot.notes || "",
      fulfillmentInstructions: snapshot.fulfillmentInstructions || "",
      payment: {
        method: "online",
        label: "Paid Online (Razorpay)",
        status: "paid",
        transactionId: paymentId,
        paidAt: placedAt,
      },
      paymentStatus: "Paid",
      petpoojaStatus: "Pending",
      placedAt,
      estimatedAt: new Date(Date.now() + etaMs).toISOString(),
      userId: snapshot.userId || "guest_recovered",
      recoveredFromDropout: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection("orders").doc(orderId).set(recoveredOrder);
    await paymentOrderSnap.ref.update({
      status: "CONVERTED",
      convertedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.info(
      `[Netlify Payments] Rescued and created orphan order ${orderId} from checkout snapshot`,
    );
  } else {
    console.warn(
      `[Netlify Payments] Payment ${paymentId} captured for unknown orderId ${orderId} without snapshot. Flagged as ORPHAN_CAPTURED.`,
    );
    await paymentsRef.update({
      status: "ORPHAN_CAPTURED",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
}

/**
 * Handler for Razorpay Webhook events.
 *
 * Webhook-first reconciliation (the source of truth for money movement):
 *   - Signature: HMAC-SHA256 over the RAW request body with RAZORPAY_WEBHOOK_SECRET.
 *   - Idempotency: dedupe on `${event}:${paymentId}`; replays return 200 no-ops.
 *   - Client `verifyPayment` is UX-only — order finality comes from here.
 */
export async function handleRazorpayWebhook(req: any, res: Response) {
  const signature = req.headers["x-razorpay-signature"] as string;
  if (!signature) {
    console.warn("[Netlify Payments] Razorpay Webhook missing signature");
    res.status(400).send("Missing signature");
    return;
  }

  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error(
      "[Netlify Payments] Razorpay webhook secret is not configured; rejecting request",
    );
    res.status(500).send({ status: "error", message: "Webhook not configured" });
    return;
  }

  const rawBody = req.rawBody ? req.rawBody.toString() : JSON.stringify(req.body);
  const isValid = validateRazorpaySignature(rawBody, signature, webhookSecret);

  if (!isValid) {
    console.error("[Netlify Payments] Invalid Razorpay Webhook Signature");
    res.status(400).send("Invalid signature");
    return;
  }

  try {
    const payload = req.body;
    const event = payload.event;
    const paymentEntity = payload.payload?.payment?.entity;
    const paymentId = paymentEntity?.id;
    const eventKey = `${event}:${paymentId ?? "none"}`;

    console.info(`[Netlify Payments] Processing Razorpay Webhook Event: ${event}`);

    if (event === "payment.captured" || event === "order.paid") {
      if (!paymentEntity) {
        console.warn("[Netlify Payments] Missing payment entity in Razorpay payload");
        res.status(400).send("Missing payment entity");
        return;
      }

      const orderId =
        paymentEntity.notes?.orderId ||
        paymentEntity.notes?.confirmedOrderId ||
        paymentEntity.receipt ||
        paymentEntity.order_id ||
        null;

      const paymentsRef = db.collection("payments").doc(paymentId);

      // Idempotency: already-processed event → no-op.
      const paySnap = await paymentsRef.get();
      if (paySnap.exists && paySnap.data()?.lastWebhook === eventKey) {
        console.info(`[Netlify Payments] Deduplicated replayed ${event} for ${paymentId}`);
        res.status(200).send({ status: "success", dedup: true });
        return;
      }

      await handlePaymentCaptured(orderId, paymentEntity);
      await paymentsRef.set({ lastWebhook: eventKey }, { merge: true });
    } else if (event === "payment.failed") {
      if (!paymentEntity) {
        console.warn("[Netlify Payments] Missing payment entity in Razorpay payload");
        res.status(400).send("Missing payment entity");
        return;
      }

      const orderId =
        paymentEntity.notes?.orderId ||
        paymentEntity.notes?.confirmedOrderId ||
        paymentEntity.receipt ||
        paymentEntity.order_id ||
        null;
      const paymentsRef = db.collection("payments").doc(paymentId);

      const paySnap = await paymentsRef.get();
      if (paySnap.exists && paySnap.data()?.lastWebhook === eventKey) {
        console.info(`[Netlify Payments] Deduplicated replayed ${event} for ${paymentId}`);
        res.status(200).send({ status: "success", dedup: true });
        return;
      }

      await paymentsRef.set(
        {
          id: paymentId,
          orderId: orderId || null,
          status: "FAILED",
          verificationStatus: "FAILED",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          lastWebhook: eventKey,
        },
        { merge: true },
      );

      if (orderId) {
        const orderRef = db.collection("orders").doc(orderId);
        const orderSnap = await orderRef.get();
        if (orderSnap.exists) {
          const orderData = orderSnap.data() as any;
          // Never downgrade an order that is already paid.
          if (orderData.paymentStatus !== "Paid") {
            await orderRef.update({
              paymentStatus: "Failed",
              "payment.status": "failed",
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            console.info(`[Netlify Payments] Updated Order ${orderId} to Failed`);
          }
        }
      }
    } else if (
      event === "refund.created" ||
      event === "refund.processed" ||
      event === "refund.failed"
    ) {
      const refundEntity = payload.payload?.refund?.entity;
      if (!refundEntity) {
        console.warn("[Netlify Payments] Missing refund entity in Razorpay payload");
        res.status(400).send("Missing refund entity");
        return;
      }

      const refundStatus =
        event === "refund.processed"
          ? "COMPLETED"
          : event === "refund.created"
            ? "PENDING"
            : "FAILED";
      const refundsRef = db.collection("refunds").doc(refundEntity.id);
      const refundSnap = await refundsRef.get();

      if (
        event === "refund.processed" &&
        refundSnap.exists &&
        refundSnap.data()?.status === "COMPLETED"
      ) {
        console.info(
          `[Netlify Payments] Deduplicated replayed refund.processed for ${refundEntity.id}`,
        );
        res.status(200).send({ status: "success", dedup: true });
        return;
      }

      const refundPaymentId = refundEntity.payment_id || paymentId;
      await refundsRef.set(
        {
          id: refundEntity.id,
          paymentId: refundPaymentId || null,
          orderId: refundEntity.notes?.orderId || null,
          amountPaise: refundEntity.amount,
          status: refundStatus,
          completedAt:
            event === "refund.processed" ? admin.firestore.FieldValue.serverTimestamp() : null,
          gatewayStatus: refundEntity.status,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      if (refundStatus === "COMPLETED" && refundPaymentId) {
        await db.collection("payments").doc(refundPaymentId).set(
          {
            status: "REFUNDED",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }
    } else if (event === "settlement.processed") {
      const settlementEntity = payload.payload?.settlement?.entity;
      if (!settlementEntity) {
        console.warn("[Netlify Payments] Missing settlement entity in Razorpay payload");
        res.status(400).send("Missing settlement entity");
        return;
      }

      const settlementRef = db.collection("settlements").doc(settlementEntity.id);
      const settlementSnap = await settlementRef.get();
      if (settlementSnap.exists) {
        console.info(
          `[Netlify Payments] Deduplicated replayed settlement.processed for ${settlementEntity.id}`,
        );
        res.status(200).send({ status: "success", dedup: true });
        return;
      }

      await settlementRef.set({
        id: settlementEntity.id,
        utr: settlementEntity.utr || "",
        amountPaise: settlementEntity.amount,
        feesPaise: settlementEntity.fees || 0,
        taxPaise: settlementEntity.tax || 0,
        status: "PROCESSED",
        settlementPeriod: settlementEntity.settlement_period || null,
        settledAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      console.info(`[Netlify Payments] Acknowledged event without dedicated handler: ${event}`);
    }

    // Audit trail, recorded only AFTER successful processing so retries re-run.
    await db.collection("webhook_events").add({
      event,
      eventId: eventKey,
      status: "PROCESSED",
      time: admin.firestore.FieldValue.serverTimestamp(),
      payload: JSON.stringify(payload),
    });

    res.status(200).send({ status: "success" });
  } catch (error: any) {
    console.error("[Netlify Payments] Error processing Razorpay Webhook:", error);
    res.status(500).send({ status: "error", message: "Internal server error" });
  }
}

// ── Express application mounted for Netlify Functions ──────────────────────
const app = express();

app.use((req: Request, res: Response, next: any) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization, x-razorpay-signature");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  next();
});

// Capture rawBody for HMAC webhook verification
app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

// Routes supporting relative, /payments, and full Netlify function paths
app.post(
  [
    "/createPaymentOrder",
    "/payments/createPaymentOrder",
    "/.netlify/functions/payments/createPaymentOrder",
  ],
  handleCreatePaymentOrder,
);
app.post(
  ["/verifyPayment", "/payments/verifyPayment", "/.netlify/functions/payments/verifyPayment"],
  handleVerifyPayment,
);
app.post(
  ["/razorpayWebhook", "/payments/razorpayWebhook", "/.netlify/functions/payments/razorpayWebhook"],
  handleRazorpayWebhook,
);

export const handler = serverless(app);
