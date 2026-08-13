"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.razorpayWebhook = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const crypto = require("crypto");
const db = admin.firestore();
/**
 * Validates the Razorpay signature to ensure the webhook payload is authentic.
 */
function validateRazorpaySignature(body, signature, secret) {
    // Constant-time comparison — avoid leaking timing information via a
    // plain hex-string equality check.
    const expected = crypto.createHmac("sha256", secret).update(body).digest();
    let provided;
    try {
        provided = Buffer.from(signature, "hex");
    }
    catch (_a) {
        return false;
    }
    return provided.length === expected.length && crypto.timingSafeEqual(expected, provided);
}
/**
 * HTTP Webhook for Razorpay Events (payment.captured, payment.failed, refund.processed, etc.)
 */
exports.razorpayWebhook = functions.https.onRequest(async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
    }
    // Get the signature from the headers
    const signature = req.headers["x-razorpay-signature"];
    if (!signature) {
        functions.logger.warn("Razorpay Webhook missing signature");
        res.status(400).send("Missing signature");
        return;
    }
    // Fail closed: the webhook secret MUST be configured in env/functions config.
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || ((_a = functions.config().razorpay) === null || _a === void 0 ? void 0 : _a.webhook_secret);
    if (!webhookSecret) {
        functions.logger.error("Razorpay webhook secret is not configured; rejecting request");
        res.status(500).send({ status: "error", message: "Webhook not configured" });
        return;
    }
    // Fail closed: require raw request body
    if (!req.rawBody) {
        functions.logger.error("Razorpay webhook missing rawBody; rejecting request");
        res.status(400).send({ status: "error", message: "Missing raw body" });
        return;
    }
    const isValid = validateRazorpaySignature(req.rawBody.toString(), signature, webhookSecret);
    if (!isValid) {
        functions.logger.error("Invalid Razorpay Webhook Signature");
        res.status(400).send("Invalid signature");
        return;
    }
    try {
        const payload = req.body;
        const event = payload.event;
        functions.logger.info(`Processing Razorpay Webhook Event: ${event}`);
        // Extract core payment entity from payload
        const paymentEntity = (_c = (_b = payload.payload) === null || _b === void 0 ? void 0 : _b.payment) === null || _c === void 0 ? void 0 : _c.entity;
        if (!paymentEntity) {
            functions.logger.warn("Missing payment entity in Razorpay payload");
            res.status(400).send("Missing payment entity");
            return;
        }
        // Extract orderId from notes or receipt or payment entity
        const orderId = ((_d = paymentEntity.notes) === null || _d === void 0 ? void 0 : _d.orderId) ||
            ((_e = paymentEntity.notes) === null || _e === void 0 ? void 0 : _e.confirmedOrderId) ||
            paymentEntity.receipt ||
            paymentEntity.order_id;
        const paymentId = paymentEntity.id;
        const paymentsRef = db.collection("payments").doc(paymentId);
        // Save raw webhook event to audit subcollection
        await paymentsRef.collection("webhook_events").add({
            event: event,
            status: "DELIVERED",
            time: admin.firestore.FieldValue.serverTimestamp(),
            payload: JSON.stringify(payload),
        });
        if (event === "payment.captured") {
            await paymentsRef.set({
                id: paymentId,
                orderId: orderId || null,
                amountPaise: paymentEntity.amount,
                currency: paymentEntity.currency,
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
            }, { merge: true });
            // Reconcile or Rescue the Order Document in Firestore
            if (orderId) {
                let orderRef = db.collection("orders").doc(orderId);
                let orderSnap = await orderRef.get();
                if (!orderSnap.exists) {
                    // Check collectionGroup fallback in case placed under a subcollection
                    const orderQuery = await db
                        .collectionGroup("orders")
                        .where("id", "==", orderId)
                        .limit(1)
                        .get();
                    if (!orderQuery.empty) {
                        orderRef = orderQuery.docs[0].ref;
                        orderSnap = orderQuery.docs[0];
                    }
                }
                // Server-Authoritative Amount Verification (PAY-2 / PAY-3 Fix)
                const paymentOrderSnap = await db.collection("payment_orders").doc(orderId).get();
                let expectedAmountPaise = 0;
                if (paymentOrderSnap.exists) {
                    expectedAmountPaise = ((_f = paymentOrderSnap.data()) === null || _f === void 0 ? void 0 : _f.amountInPaise) || 0;
                }
                if (orderSnap.exists) {
                    const orderData = orderSnap.data();
                    if (!expectedAmountPaise) {
                        expectedAmountPaise = Math.round((((_g = orderData.totals) === null || _g === void 0 ? void 0 : _g.grandTotal) || 0) * 100);
                    }
                    if (paymentEntity.amount < expectedAmountPaise) {
                        functions.logger.error(`Amount mismatch for order ${orderId}. Expected ${expectedAmountPaise} paise (server authoritative), got ${paymentEntity.amount} paise.`);
                        await orderRef.update({
                            paymentStatus: "Fraud_PartialPayment",
                            "payment.status": "failed",
                            "payment.transactionId": paymentId,
                            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                        });
                    }
                    else {
                        await orderRef.update({
                            paymentStatus: "Paid",
                            "payment.status": "paid",
                            "payment.transactionId": paymentId,
                            "payment.paidAt": admin.firestore.FieldValue.serverTimestamp(),
                            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                        });
                        functions.logger.info(`Updated Order ${orderId} to Paid`);
                    }
                }
                else {
                    // DROPOUT RECOVERY: Client paid in Razorpay but crashed / disconnected before creating the Order document.
                    // Retrieve the pre-saved checkout snapshot from payment_orders/{orderId}
                    const paymentOrderSnap = await db.collection("payment_orders").doc(orderId).get();
                    if (paymentOrderSnap.exists) {
                        const snapData = paymentOrderSnap.data() || {};
                        const snapshot = snapData.snapshot || {};
                        const placedAt = new Date().toISOString();
                        const etaMs = snapshot.fulfillment === "delivery" ? 35 * 60000 : 20 * 60000;
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
                                grandTotal: snapData.amount || paymentEntity.amount / 100,
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
                        functions.logger.info(`Rescued and created orphan order ${orderId} from checkout snapshot`);
                    }
                    else {
                        functions.logger.warn(`Payment ${paymentId} captured for unknown orderId ${orderId} without snapshot. Flagged as ORPHAN_CAPTURED.`);
                        await paymentsRef.update({
                            status: "ORPHAN_CAPTURED",
                            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                        });
                    }
                }
            }
        }
        else if (event === "payment.failed") {
            await paymentsRef.set({
                id: paymentId,
                orderId: orderId || null,
                status: "FAILED",
                verificationStatus: "FAILED",
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            if (orderId) {
                const orderRef = db.collection("orders").doc(orderId);
                const orderSnap = await orderRef.get();
                if (orderSnap.exists) {
                    await orderRef.update({
                        paymentStatus: "Failed",
                        "payment.status": "failed",
                        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                    functions.logger.info(`Updated Order ${orderId} to Failed`);
                }
            }
        }
        else if (event === "refund.processed") {
            const refundEntity = (_j = (_h = payload.payload) === null || _h === void 0 ? void 0 : _h.refund) === null || _j === void 0 ? void 0 : _j.entity;
            if (refundEntity) {
                await paymentsRef.set({
                    status: "REFUNDED",
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
                const refundsRef = db.collection("refunds").doc(refundEntity.id);
                await refundsRef.set({
                    id: refundEntity.id,
                    paymentId: paymentId,
                    orderId: orderId || null,
                    amountPaise: refundEntity.amount,
                    status: "COMPLETED",
                    completedAt: admin.firestore.FieldValue.serverTimestamp(),
                    gatewayStatus: refundEntity.status,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                });
            }
        }
        res.status(200).send({ status: "success" });
    }
    catch (error) {
        functions.logger.error("Error processing Razorpay Webhook", error);
        res.status(500).send({ status: "error", message: "Internal server error" });
    }
});
//# sourceMappingURL=webhooks.js.map