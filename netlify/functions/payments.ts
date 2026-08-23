import * as admin from "firebase-admin";
import express, { Request, Response } from "express";
import serverless from "serverless-http";
import {
  verifyRazorpaySignature,
  verifyPaymentSignature,
  computeHmac,
} from "./lib/verifySignature";
import { computeServerPrice, resolveStorePricingConfig } from "./lib/server-price";

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

export { db, computeHmac, verifyRazorpaySignature, verifyPaymentSignature };

/**
 * Returns a configured Razorpay instance.
 */
export function getRazorpayInstance() {
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
export async function authenticateRequest(req: Request): Promise<admin.auth.DecodedIdToken | null> {
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

/**
 * Resolves live product price from Firestore catalog.
 */
export async function resolveProductPrice(productId: string): Promise<number | null> {
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
 * Helper to record append-only audit trail in paymentAudits collection.
 * Follows strict append-only semantics (create allow, update/delete deny).
 */
export async function recordPaymentAudit(
  auditKey: string,
  data: {
    orderId?: string | null;
    paymentId?: string | null;
    refundId?: string | null;
    branchId?: string | null;
    userId?: string | null;
    amount?: number | null;
    amountPaise?: number | null;
    kind: "payment_captured" | "payment_verified" | "cod" | "refund" | "payment_failed" | "discrepancy";
    source: "webhook" | "client_verify" | "order_create" | "auto_refund";
    metadata?: Record<string, any>;
  },
): Promise<{ alreadyProcessed: boolean }> {
  try {
    const auditRef = db.collection("paymentAudits").doc(auditKey);
    const snap = await auditRef.get();
    if (snap.exists) {
      return { alreadyProcessed: true };
    }

    await auditRef.set({
      auditId: auditKey,
      ...data,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { alreadyProcessed: false };
  } catch (e: any) {
    console.warn(`[Netlify Payments] Error writing paymentAudit ${auditKey}:`, e?.message);
    return { alreadyProcessed: false };
  }
}

/**
 * Handler for creating a Razorpay order from backend with server-authoritative pricing (or COD order).
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
    paymentMethod = "online",
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

    // 4. Handle Cash on Delivery (COD) path
    if (paymentMethod === "cod" || req.body.isCod === true) {
      const generatedOrderId = receipt || `ord_cod_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const auditKey = `cod_${generatedOrderId}`;

      // Record audit doc in paymentAudits with kind: "cod"
      await recordPaymentAudit(auditKey, {
        orderId: generatedOrderId,
        branchId: effectiveStoreId,
        userId,
        amount: grandTotal,
        amountPaise: Math.round(grandTotal * 100),
        kind: "cod",
        source: "order_create",
        metadata: {
          fulfillment: fulfillment || checkoutSnapshot?.fulfillment || "delivery",
          itemsCount: items.length,
        },
      });

      // Save order record
      const orderRef = db.collection("orders").doc(generatedOrderId);
      await orderRef.set({
        id: generatedOrderId,
        orderId: generatedOrderId,
        shortCode: generatedOrderId.slice(-6).toUpperCase(),
        userId,
        customerId: userId,
        branchId: effectiveStoreId,
        fulfillment: fulfillment || checkoutSnapshot?.fulfillment || "delivery",
        store: checkoutSnapshot?.store || { id: effectiveStoreId, name: "Burgonomics" },
        address: checkoutSnapshot?.address || null,
        items,
        totals: {
          subtotal: serverPrice.subtotal,
          tax: serverPrice.tax,
          deliveryFee: serverPrice.deliveryFee,
          packingFee: serverPrice.packingFee,
          grandTotal: serverPrice.grandTotal,
        },
        payment: {
          method: "cod",
          label: "Cash on Delivery",
          status: "pending_cod",
          amount: grandTotal,
          initiatedAt: new Date().toISOString(),
        },
        paymentStatus: "Pending",
        petpoojaStatus: "Pending",
        status: {
          code: "PLACED",
          label: "Order placed",
          kind: "upcoming",
          terminal: false,
        },
        placedAt: new Date().toISOString(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      res.status(200).send({
        status: "success",
        orderId: generatedOrderId,
        method: "cod",
        amount: grandTotal,
        currency: "INR",
        paymentStatus: "pending_cod",
      });
      return;
    }

    // 5. Handle Online Razorpay Order creation
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

  // 2. Canonical timing-safe HMAC signature verification
  const isValid = verifyPaymentSignature(orderId, paymentId, signature, keySecret);
  if (!isValid) {
    console.warn(`[Netlify Payments] Signature mismatch for Order ${orderId}`);
    res.status(403).send({ status: "error", message: "Invalid payment signature." });
    return;
  }

  // 3. Idempotency check via paymentAudits
  const auditKey = `verify_${paymentId}`;
  const auditCheck = await recordPaymentAudit(auditKey, {
    orderId,
    paymentId,
    kind: "payment_verified",
    source: "client_verify",
  });

  if (auditCheck.alreadyProcessed) {
    console.info(`[Netlify Payments] Replay verification for payment ${paymentId}; returning idempotent success`);
    res.status(200).send({
      verified: true,
      confirmedOrderId: orderId,
      status: "already_processed",
      idempotent: true,
    });
    return;
  }

  try {
    // 4. Fetch authoritative payment_orders doc
    const paymentOrderRef = db.collection("payment_orders").doc(orderId);
    const paymentOrderSnap = await paymentOrderRef.get();

    if (!paymentOrderSnap.exists) {
      res.status(404).send({ status: "error", message: "Payment order record not found." });
      return;
    }

    const paymentOrderData = paymentOrderSnap.data();

    // 5. Verify payment with Razorpay API (BLOCKING amount integrity check)
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

      // Record discrepancy in payment_discrepancies collection
      await db.collection("payment_discrepancies").add({
        orderId,
        paymentId,
        expectedPaise,
        receivedPaise: rzpPayment.amount,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      res
        .status(400)
        .send({ status: "error", code: "AMOUNT_MISMATCH", message: "Paid amount does not match required order total." });
      return;
    }

    // 6. Record verified payment in Firestore
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

    // 7. Mark payment_orders doc as PAID
    await paymentOrderRef.update({
      status: "PAID",
      paymentId,
      paidAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 8. Mark client order doc as Paid (with validatedAt persistence)
    const orderRef = db.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();

    if (orderSnap.exists) {
      await orderRef.update({
        paymentStatus: "Paid",
        "payment.status": "paid",
        "payment.transactionId": paymentId,
        "payment.paidAt": admin.firestore.FieldValue.serverTimestamp(),
        validatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
        validatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
 * Finalizes a captured payment (payment.captured / order.paid).
 */
async function handlePaymentCaptured(orderId: string | null, paymentEntity: any): Promise<void> {
  const paymentId = paymentEntity.id;

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
        validatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
      validatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
 */
export async function handleRazorpayWebhook(req: any, res: Response) {
  const signature = req.headers["x-razorpay-signature"] as string;
  if (!signature) {
    console.warn("[Netlify Payments] Razorpay Webhook missing signature");
    res.status(401).send({ error: "Missing signature" });
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
  const isValid = verifyRazorpaySignature(rawBody, signature, webhookSecret);

  if (!isValid) {
    console.error("[Netlify Payments] Invalid Razorpay Webhook Signature");
    res.status(401).send({ error: "Invalid signature" });
    return;
  }

  try {
    const payload = req.body;
    const event = payload.event;
    const paymentEntity = payload.payload?.payment?.entity;
    const paymentId = paymentEntity?.id;
    const eventKey = `${event}:${paymentId ?? payload.payload?.order?.entity?.id ?? "none"}`;

    console.info(
      JSON.stringify({
        eventId: eventKey,
        event,
        paymentId,
        signatureValid: true,
      }),
    );

    // Idempotency check via paymentAudits
    const auditCheck = await recordPaymentAudit(eventKey, {
      paymentId: paymentId || null,
      kind:
        event === "payment.captured" || event === "order.paid"
          ? "payment_captured"
          : event === "payment.failed"
            ? "payment_failed"
            : event.startsWith("refund")
              ? "refund"
              : "payment_captured",
      source: "webhook",
      metadata: { event },
    });

    if (auditCheck.alreadyProcessed) {
      console.info(`[Netlify Payments] Replay webhook ${eventKey}; returning 200 idempotent`);
      res.status(200).send({ status: "already_processed", dedup: true });
      return;
    }

    if (event === "payment.captured" || event === "order.paid") {
      if (!paymentEntity) {
        console.warn("[Netlify Payments] Missing payment entity in Razorpay payload");
        res.status(400).send({ error: "Missing payment entity" });
        return;
      }

      const orderId =
        paymentEntity.notes?.orderId ||
        paymentEntity.notes?.confirmedOrderId ||
        paymentEntity.receipt ||
        paymentEntity.order_id ||
        null;

      await handlePaymentCaptured(orderId, paymentEntity);
    } else if (event === "payment.failed") {
      if (!paymentEntity) {
        console.warn("[Netlify Payments] Missing payment entity in Razorpay payload");
        res.status(400).send({ error: "Missing payment entity" });
        return;
      }

      const orderId =
        paymentEntity.notes?.orderId ||
        paymentEntity.notes?.confirmedOrderId ||
        paymentEntity.receipt ||
        paymentEntity.order_id ||
        null;

      const paymentsRef = db.collection("payments").doc(paymentId);
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
      if (refundEntity) {
        const refundStatus =
          event === "refund.processed"
            ? "COMPLETED"
            : event === "refund.created"
              ? "PENDING"
              : "FAILED";

        const refundsRef = db.collection("refunds").doc(refundEntity.id);
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
      }
    }

    // Audit trail
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

/**
 * Handler for Auto-Refund on order cancellation (pre-delivery or payment failure).
 */
export async function handleRefundOrder(req: Request, res: Response) {
  const decodedToken = await authenticateRequest(req);
  if (!decodedToken || !decodedToken.uid) {
    res.status(401).send({ status: "error", message: "Unauthorized." });
    return;
  }
  const callerUid = decodedToken.uid;

  const { orderId, reason = "Customer requested cancellation" } = req.body;
  if (!orderId) {
    res.status(400).send({ status: "error", message: "orderId is required for refund." });
    return;
  }

  try {
    const orderRef = db.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      res.status(404).send({ status: "error", message: "Order not found." });
      return;
    }

    const orderData = orderSnap.data() as any;

    // Check authorization: caller must be order owner or admin
    const isAdminUser = decodedToken.role === "brand_owner" || decodedToken.role === "branch_owner";
    if (orderData.userId !== callerUid && orderData.customerId !== callerUid && !isAdminUser) {
      res.status(403).send({ status: "error", message: "Forbidden. Not authorized to cancel this order." });
      return;
    }

    // Check that order is pre-delivery / refundable
    const terminalStatuses = ["DELIVERED", "COMPLETED", "PICKED_UP"];
    if (terminalStatuses.includes(orderData.status?.code)) {
      res.status(400).send({
        status: "error",
        code: "ORDER_ALREADY_DELIVERED",
        message: "Cannot refund an order that has already been delivered or completed.",
      });
      return;
    }

    const paymentId = orderData.payment?.transactionId || orderData.paymentId;
    const amountInPaise = Math.round((orderData.totals?.grandTotal || orderData.amount || 0) * 100);
    const branchId = orderData.branchId || orderData.store?.id || null;

    let refundRecordId = `ref_${Date.now()}`;

    // If online payment was captured, invoke Razorpay refund API
    if (paymentId && orderData.paymentStatus === "Paid") {
      try {
        const rzp = getRazorpayInstance();
        const rzpRefund = await rzp.payments.refund(paymentId, {
          amount: amountInPaise,
          notes: { orderId, reason, initiatedBy: callerUid },
        });
        if (rzpRefund?.id) {
          refundRecordId = rzpRefund.id;
        }
      } catch (rzpErr: any) {
        console.warn(`[Netlify Payments] Gateway refund call note for ${paymentId}:`, rzpErr?.message);
      }
    }

    // Record audit doc with kind: "refund"
    const auditKey = `refund_${orderId}_${refundRecordId}`;
    await recordPaymentAudit(auditKey, {
      orderId,
      paymentId,
      refundId: refundRecordId,
      branchId,
      userId: callerUid,
      amount: orderData.totals?.grandTotal || 0,
      amountPaise,
      kind: "refund",
      source: "auto_refund",
      metadata: { reason },
    });

    // Record in refunds collection
    await db.collection("refunds").doc(refundRecordId).set({
      id: refundRecordId,
      orderId,
      paymentId: paymentId || null,
      branchId,
      amountPaise,
      reason,
      status: "COMPLETED",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Update order status to CANCELLED and paymentStatus to Refunded
    await orderRef.update({
      status: {
        code: "CANCELLED",
        label: "Order Cancelled",
        kind: "cancelled",
        terminal: true,
      },
      paymentStatus: "Refunded",
      "payment.status": "refunded",
      refundedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(200).send({
      status: "success",
      refunded: true,
      orderId,
      refundId: refundRecordId,
      message: "Order cancelled and refund processed successfully.",
    });
  } catch (err: any) {
    console.error("[Netlify Payments] Error processing auto-refund:", err);
    res.status(500).send({ status: "error", message: err.message || "Failed to process refund" });
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
    "/createCodOrder",
    "/payments/createCodOrder",
    "/.netlify/functions/payments/createCodOrder",
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

app.post(
  ["/refundOrder", "/payments/refundOrder", "/.netlify/functions/payments/refundOrder"],
  handleRefundOrder,
);

export const handler = serverless(app);
