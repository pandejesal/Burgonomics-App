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
    const expectedSignature = crypto
        .createHmac("sha256", secret)
        .update(body)
        .digest("hex");
    return expectedSignature === signature;
}
/**
 * HTTP Webhook for Razorpay Events (payment.captured, payment.failed, refund.processed, etc.)
 */
exports.razorpayWebhook = functions.https.onRequest(async (req, res) => {
    var _a, _b, _c, _d, _e, _f;
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
    // Ensure RAZORPAY_WEBHOOK_SECRET is set in functions config or environment variables
    // We'll fallback to a mock one if undefined, but warn aggressively
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || ((_a = functions.config().razorpay) === null || _a === void 0 ? void 0 : _a.webhook_secret) || "MOCK_SECRET_FOR_DEV";
    if (webhookSecret === "MOCK_SECRET_FOR_DEV") {
        functions.logger.warn("Using MOCK_SECRET_FOR_DEV for Razorpay webhook validation. Set RAZORPAY_WEBHOOK_SECRET in env.");
    }
    // req.rawBody is provided by Firebase functions (raw buffer of request)
    const isValid = validateRazorpaySignature(req.rawBody ? req.rawBody.toString() : JSON.stringify(req.body), signature, webhookSecret);
    if (!isValid) {
        functions.logger.error("Invalid Razorpay Webhook Signature");
        res.status(400).send("Invalid signature");
        return;
    }
    try {
        const payload = req.body;
        const event = payload.event;
        functions.logger.info(`Processing Razorpay Webhook Event: ${event}`);
        // Extract core payment entity from the payload
        const paymentEntity = (_c = (_b = payload.payload) === null || _b === void 0 ? void 0 : _b.payment) === null || _c === void 0 ? void 0 : _c.entity;
        if (!paymentEntity) {
            functions.logger.warn("Missing payment entity in Razorpay payload");
            res.status(400).send("Missing payment entity");
            return;
        }
        // Extract the orderId from the receipt or notes (standard practice to pass internal order ID in notes)
        const orderId = ((_d = paymentEntity.notes) === null || _d === void 0 ? void 0 : _d.orderId) || paymentEntity.receipt;
        const paymentId = paymentEntity.id;
        // The status is available on paymentEntity.status if needed
        // We store webhook events in the 'payments' collection
        const paymentsRef = db.collection("payments").doc(paymentId);
        // Save the raw webhook event to a subcollection for audit logs
        await paymentsRef.collection("webhook_events").add({
            event: event,
            status: "DELIVERED",
            time: admin.firestore.FieldValue.serverTimestamp(),
            payload: JSON.stringify(payload)
        });
        if (event === "payment.captured") {
            await paymentsRef.set({
                id: paymentId,
                orderId: orderId,
                amountPaise: paymentEntity.amount,
                currency: paymentEntity.currency,
                gateway: "razorpay",
                gatewayPaymentId: paymentId,
                status: "CAPTURED",
                verificationStatus: "VERIFIED",
                capturedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                // Partial fallback fields in case it wasn't pre-created
                customer: {
                    email: paymentEntity.email || "",
                    phone: paymentEntity.contact || "",
                }
            }, { merge: true });
            // Update the user's order payment status if orderId is available
            if (orderId) {
                const orderQuery = await db.collectionGroup("orders").where("id", "==", orderId).limit(1).get();
                if (!orderQuery.empty) {
                    await orderQuery.docs[0].ref.update({
                        paymentStatus: "Paid",
                        "payment.status": "paid",
                        "payment.transactionId": paymentId,
                        "payment.paidAt": admin.firestore.FieldValue.serverTimestamp()
                    });
                    functions.logger.info(`Updated Order ${orderId} to Paid`);
                }
            }
        }
        else if (event === "payment.failed") {
            await paymentsRef.set({
                id: paymentId,
                orderId: orderId,
                status: "FAILED",
                verificationStatus: "FAILED",
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            if (orderId) {
                const orderQuery = await db.collectionGroup("orders").where("id", "==", orderId).limit(1).get();
                if (!orderQuery.empty) {
                    await orderQuery.docs[0].ref.update({
                        paymentStatus: "Failed",
                        "payment.status": "failed"
                    });
                    functions.logger.info(`Updated Order ${orderId} to Failed`);
                }
            }
        }
        else if (event === "refund.processed") {
            const refundEntity = (_f = (_e = payload.payload) === null || _e === void 0 ? void 0 : _e.refund) === null || _f === void 0 ? void 0 : _f.entity;
            if (refundEntity) {
                await paymentsRef.set({
                    status: "REFUNDED",
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
                const refundsRef = db.collection("refunds").doc(refundEntity.id);
                await refundsRef.set({
                    id: refundEntity.id,
                    paymentId: paymentId,
                    orderId: orderId,
                    amountPaise: refundEntity.amount,
                    status: "COMPLETED",
                    completedAt: admin.firestore.FieldValue.serverTimestamp(),
                    gatewayStatus: refundEntity.status,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
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