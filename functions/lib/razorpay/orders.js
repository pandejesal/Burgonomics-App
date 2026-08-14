"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.payments = exports.verifyPayment = exports.createPaymentOrder = exports.handleVerifyPayment = exports.handleCreatePaymentOrder = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const crypto = require("crypto");
const express = require("express");
const webhooks_1 = require("./webhooks");
const Razorpay = require("razorpay");
const db = admin.firestore();
function getRazorpayInstance() {
    var _a, _b;
    const keyId = process.env.RAZORPAY_KEY_ID || ((_a = functions.config().razorpay) === null || _a === void 0 ? void 0 : _a.key_id) || "rzp_test_TDmKPAQdJfbv6Z";
    const keySecret = process.env.RAZORPAY_KEY_SECRET || ((_b = functions.config().razorpay) === null || _b === void 0 ? void 0 : _b.key_secret) || "rzp_test_secret_placeholder";
    return new Razorpay({
        key_id: keyId,
        key_secret: keySecret,
    });
}
/**
 * Validates the caller's Firebase Auth token.
 */
async function authenticateRequest(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return null;
    }
    const token = authHeader.split("Bearer ")[1];
    try {
        return await admin.auth().verifyIdToken(token);
    }
    catch (err) {
        functions.logger.warn("Authentication failed for request", err);
        return null;
    }
}
/**
 * Server-Authoritative Price Engine.
 * Recalculates order subtotal, taxes, delivery fee, and grand total from Firestore catalog.
 */
async function computeServerPrice(items, fulfillment) {
    let subtotal = 0;
    if (Array.isArray(items) && items.length > 0) {
        for (const item of items) {
            const qty = Math.max(1, Number(item.quantity) || 1);
            let itemBasePrice = 0;
            if (item.id) {
                const prodSnap = await db.collection("petpooja_products").doc(item.id).get();
                if (prodSnap.exists) {
                    const prodData = prodSnap.data();
                    itemBasePrice = Number((prodData === null || prodData === void 0 ? void 0 : prodData.price) || (prodData === null || prodData === void 0 ? void 0 : prodData.min_price) || 0);
                }
            }
            // Add custom addon prices if present
            let addonTotal = 0;
            if (Array.isArray(item.customizations)) {
                for (const addon of item.customizations) {
                    addonTotal += Number(addon.price || 0);
                }
            }
            subtotal += (itemBasePrice + addonTotal) * qty;
        }
    }
    // Calculate standard 5% GST
    const tax = Math.round(subtotal * 0.05 * 100) / 100;
    // Delivery fee if delivery fulfillment
    const deliveryFee = fulfillment === "delivery" ? (subtotal > 499 ? 0 : 40) : 0;
    const grandTotal = Math.round((subtotal + tax + deliveryFee) * 100) / 100;
    return { subtotal, tax, deliveryFee, grandTotal };
}
/**
 * Handler for creating a Razorpay order from the backend with server-authoritative pricing.
 */
async function handleCreatePaymentOrder(req, res) {
    var _a, _b, _c, _d;
    // Enable CORS
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
    }
    if (req.method !== "POST") {
        res.status(405).send({ status: "error", message: "Method Not Allowed" });
        return;
    }
    // 1. Authenticate caller (SEC-3: Strictly require valid Firebase ID token; never trust body)
    const decodedToken = await authenticateRequest(req);
    if (!decodedToken || !decodedToken.uid) {
        res.status(401).send({ status: "error", message: "Unauthorized. Valid Firebase ID token is required." });
        return;
    }
    const userId = decodedToken.uid;
    const { currency = "INR", receipt, storeId, fulfillment, checkoutToken, checkoutSnapshot } = req.body;
    try {
        // 2. Server-Authoritative Price Engine (PAY-4: 100% computed from catalog; no client amount bypass)
        const items = (checkoutSnapshot === null || checkoutSnapshot === void 0 ? void 0 : checkoutSnapshot.items) || ((_a = req.body) === null || _a === void 0 ? void 0 : _a.items) || [];
        if (!Array.isArray(items) || items.length === 0) {
            res.status(400).send({ status: "error", message: "Order items list cannot be empty." });
            return;
        }
        const serverPrice = await computeServerPrice(items, fulfillment);
        const grandTotal = serverPrice.grandTotal;
        if (grandTotal <= 0) {
            res.status(400).send({ status: "error", message: "Server-calculated order amount must be greater than zero." });
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
                storeId: storeId || ((_b = checkoutSnapshot === null || checkoutSnapshot === void 0 ? void 0 : checkoutSnapshot.store) === null || _b === void 0 ? void 0 : _b.id) || "",
                fulfillment: fulfillment || (checkoutSnapshot === null || checkoutSnapshot === void 0 ? void 0 : checkoutSnapshot.fulfillment) || "",
                checkoutToken: checkoutToken || "",
            },
        };
        const rzpOrder = await rzp.orders.create(orderOptions);
        // Save authoritative pre-order snapshot in Firestore
        await db.collection("payment_orders").doc(rzpOrder.id).set({
            orderId: rzpOrder.id,
            userId,
            amount: grandTotal,
            amountInPaise,
            currency: rzpOrder.currency || "INR",
            receipt: rzpOrder.receipt,
            status: "PENDING_PAYMENT",
            storeId: storeId || ((_c = checkoutSnapshot === null || checkoutSnapshot === void 0 ? void 0 : checkoutSnapshot.store) === null || _c === void 0 ? void 0 : _c.id) || null,
            fulfillment: fulfillment || (checkoutSnapshot === null || checkoutSnapshot === void 0 ? void 0 : checkoutSnapshot.fulfillment) || null,
            snapshot: checkoutSnapshot || null,
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
                storeId: storeId || ((_d = checkoutSnapshot === null || checkoutSnapshot === void 0 ? void 0 : checkoutSnapshot.store) === null || _d === void 0 ? void 0 : _d.id),
                fulfillment: fulfillment || (checkoutSnapshot === null || checkoutSnapshot === void 0 ? void 0 : checkoutSnapshot.fulfillment),
                checkoutToken,
            },
        });
    }
    catch (err) {
        functions.logger.error("Error creating Razorpay order", err);
        res.status(500).send({ status: "error", message: err.message || "Failed to create payment order" });
    }
}
exports.handleCreatePaymentOrder = handleCreatePaymentOrder;
/**
 * Handler for verifying a Razorpay payment signature and updating payment state server-side.
 */
async function handleVerifyPayment(req, res) {
    var _a;
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
    }
    if (req.method !== "POST") {
        res.status(405).send({ status: "error", message: "Method Not Allowed" });
        return;
    }
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
    const keySecret = process.env.RAZORPAY_KEY_SECRET || ((_a = functions.config().razorpay) === null || _a === void 0 ? void 0 : _a.key_secret) || "rzp_test_secret_placeholder";
    const text = `${orderId}|${paymentId}`;
    const expectedSignature = crypto.createHmac("sha256", keySecret).update(text).digest("hex");
    if (expectedSignature !== signature) {
        functions.logger.warn(`Signature mismatch for Order ${orderId}`);
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
        let rzpPayment = null;
        try {
            rzpPayment = await rzp.payments.fetch(paymentId);
        }
        catch (e) {
            functions.logger.error(`Razorpay payment fetch failed for payment ${paymentId}: ${e === null || e === void 0 ? void 0 : e.message}`);
            res.status(502).send({
                status: "error",
                message: `Failed to verify payment with gateway: ${(e === null || e === void 0 ? void 0 : e.message) || "Gateway unreachable"}`,
            });
            return;
        }
        if (!rzpPayment) {
            res.status(400).send({ status: "error", message: "Gateway payment record could not be retrieved." });
            return;
        }
        const expectedPaise = (paymentOrderData === null || paymentOrderData === void 0 ? void 0 : paymentOrderData.amountInPaise) || 0;
        if (rzpPayment.amount < expectedPaise) {
            functions.logger.error(`Amount mismatch: expected ${expectedPaise} paise, Razorpay recorded ${rzpPayment.amount} paise`);
            res.status(400).send({ status: "error", message: "Paid amount does not match required order total." });
            return;
        }
        // 4. Record verified payment in Firestore
        const paymentsRef = db.collection("payments").doc(paymentId);
        await paymentsRef.set({
            id: paymentId,
            orderId: orderId,
            status: "CAPTURED",
            verificationStatus: "VERIFIED",
            verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
            gateway: "razorpay",
            gatewayPaymentId: paymentId,
        }, { merge: true });
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
        }
        else if (paymentOrderData === null || paymentOrderData === void 0 ? void 0 : paymentOrderData.snapshot) {
            await orderRef.set(Object.assign(Object.assign({}, paymentOrderData.snapshot), { id: orderId, userId: paymentOrderData.userId, paymentStatus: "Paid", payment: Object.assign(Object.assign({}, paymentOrderData.snapshot.payment), { status: "paid", transactionId: paymentId, paidAt: new Date().toISOString() }), petpoojaStatus: "Pending", createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }));
        }
        functions.logger.info(`Successfully verified payment ${paymentId} for order ${orderId}`);
        res.status(200).send({
            verified: true,
            confirmedOrderId: orderId,
        });
    }
    catch (err) {
        functions.logger.error("Error finalizing verified payment", err);
        res.status(500).send({ status: "error", message: err.message || "Failed to finalize payment." });
    }
}
exports.handleVerifyPayment = handleVerifyPayment;
// 1. Direct Cloud Function Exports
exports.createPaymentOrder = functions.https.onRequest(handleCreatePaymentOrder);
exports.verifyPayment = functions.https.onRequest(handleVerifyPayment);
// 2. Express application mounted at /payments
const app = express();
app.use((req, res, next) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization, x-razorpay-signature");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
    }
    next();
});
app.use(express.json());
// Routes supporting both relative and mounted /payments prefixes
app.post(["/createPaymentOrder", "/payments/createPaymentOrder"], handleCreatePaymentOrder);
app.post(["/verifyPayment", "/payments/verifyPayment"], handleVerifyPayment);
app.post(["/razorpayWebhook", "/payments/razorpayWebhook"], async (req, res) => {
    await webhooks_1.razorpayWebhook(req, res);
});
exports.payments = functions.https.onRequest(app);
//# sourceMappingURL=orders.js.map