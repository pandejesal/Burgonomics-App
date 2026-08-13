"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.pushOrderToPetpooja = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios_1 = require("axios");
const db = admin.firestore();
const PETPOOJA_SAVE_ORDER_URL = process.env.PETPOOJA_SAVE_ORDER_URL ||
    ((_a = functions.config().petpooja) === null || _a === void 0 ? void 0 : _a.save_order_url) ||
    "https://47pfzh5sf2.execute-api.ap-southeast-1.amazonaws.com/V1/save_order";
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * Unified Firestore onWrite trigger for Petpooja POS order synchronization.
 * Triggers on both initial order creation (onCreate) and payment status transitions (onUpdate).
 * Protected by a Firestore transaction lock and exponential backoff retry loop.
 */
exports.pushOrderToPetpooja = functions.firestore
    .document("orders/{orderId}")
    .onWrite(async (change, context) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3;
    const orderId = context.params.orderId;
    const orderAfter = ((_a = change.after) === null || _a === void 0 ? void 0 : _a.exists) ? change.after.data() : null;
    // Document was deleted
    if (!orderAfter)
        return null;
    // 1. Determine eligibility for Petpooja push (POS-1 / SEC-2 verification)
    const isPaidOnline = orderAfter.paymentStatus === "Paid" ||
        ((_b = orderAfter.payment) === null || _b === void 0 ? void 0 : _b.status) === "paid" ||
        ((_c = orderAfter.payment) === null || _c === void 0 ? void 0 : _c.verificationStatus) === "VERIFIED";
    const isCashOrder = ((_d = orderAfter.payment) === null || _d === void 0 ? void 0 : _d.method) === "cash" ||
        ((_e = orderAfter.payment) === null || _e === void 0 ? void 0 : _e.method) === "cod" ||
        ((_f = orderAfter.payment) === null || _f === void 0 ? void 0 : _f.status) === "CASH_PENDING" ||
        ((_g = orderAfter.payment) === null || _g === void 0 ? void 0 : _g.status) === "PAY_AT_STORE";
    if (!isPaidOnline && !isCashOrder) {
        functions.logger.info(`Order ${orderId} is not ready for Petpooja sync (Payment status: ${orderAfter.paymentStatus || ((_h = orderAfter.payment) === null || _h === void 0 ? void 0 : _h.status)})`);
        return null;
    }
    // 2. Fast check if already synced or currently processing
    if (orderAfter.petpoojaStatus === "Synced") {
        return null;
    }
    if (orderAfter.petpoojaStatus === "Processing") {
        const startedAt = ((_j = orderAfter.petpoojaProcessingStartedAt) === null || _j === void 0 ? void 0 : _j.toMillis)
            ? orderAfter.petpoojaProcessingStartedAt.toMillis()
            : null;
        // If processing lease is less than 60s old, respect the lease to prevent duplicate KOTs
        if (startedAt && Date.now() - startedAt < 60000) {
            functions.logger.info(`Order ${orderId} is actively being processed by another worker lease.`);
            return null;
        }
    }
    // 3. Atomically acquire processing lease using a Firestore transaction
    const orderRef = db.collection("orders").doc(orderId);
    let acquiredLease = false;
    try {
        await db.runTransaction(async (transaction) => {
            var _a;
            const snap = (await transaction.get(orderRef));
            if (!snap.exists)
                return;
            const current = snap.data() || {};
            if (current.petpoojaStatus === "Synced") {
                acquiredLease = false;
                return;
            }
            if (current.petpoojaStatus === "Processing") {
                const snapStartedAt = ((_a = current.petpoojaProcessingStartedAt) === null || _a === void 0 ? void 0 : _a.toMillis)
                    ? current.petpoojaProcessingStartedAt.toMillis()
                    : null;
                if (snapStartedAt && Date.now() - snapStartedAt < 60000) {
                    acquiredLease = false;
                    return;
                }
            }
            transaction.update(orderRef, {
                petpoojaStatus: "Processing",
                petpoojaProcessingStartedAt: admin.firestore.FieldValue.serverTimestamp(),
                petpoojaAttemptCount: admin.firestore.FieldValue.increment(1),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            acquiredLease = true;
        });
    }
    catch (err) {
        functions.logger.error(`Failed to acquire transaction lease for order ${orderId}:`, err);
        return null;
    }
    if (!acquiredLease) {
        return null;
    }
    // 4. Resolve Store & Petpooja credentials
    const restID = ((_k = orderAfter.store) === null || _k === void 0 ? void 0 : _k.restId) || "52x8797b";
    const storeName = ((_l = orderAfter.store) === null || _l === void 0 ? void 0 : _l.name) || "Burgonomics Flagship";
    const appKey = process.env.PETPOOJA_APP_KEY || ((_m = functions.config().petpooja) === null || _m === void 0 ? void 0 : _m.app_key) || "mock_petpooja_app_key";
    const appSecret = process.env.PETPOOJA_APP_SECRET || ((_o = functions.config().petpooja) === null || _o === void 0 ? void 0 : _o.app_secret) || "mock_petpooja_app_secret";
    const accessToken = process.env.PETPOOJA_ACCESS_TOKEN || ((_p = functions.config().petpooja) === null || _p === void 0 ? void 0 : _p.access_token) || "mock_petpooja_access_token";
    const isSandbox = process.env.PETPOOJA_ENV === "sandbox" ||
        appKey === "mock_petpooja_app_key" ||
        appKey.startsWith("mock_");
    // Format customer details safely
    const customerName = ((_q = orderAfter.address) === null || _q === void 0 ? void 0 : _q.contactName) || "Customer";
    const customerPhone = ((_r = orderAfter.address) === null || _r === void 0 ? void 0 : _r.contactPhone) || orderAfter.customerPhone || "9999999999";
    const customerAddress = orderAfter.address
        ? `${orderAfter.address.addressLine1 || ""} ${orderAfter.address.landmark || ""}`.trim()
        : ((_s = orderAfter.store) === null || _s === void 0 ? void 0 : _s.addressLine1) || "Takeaway / Dine-in";
    // Format items according to Petpooja V2.1.0 specification
    const OrderItem = (orderAfter.items || []).map((item) => {
        const itemPrice = Number(item.price || item.unitPrice || 0);
        const quantity = Number(item.quantity || 1);
        const totalItemPrice = (itemPrice * quantity).toFixed(2);
        const AddonItem = [];
        if (Array.isArray(item.customizations)) {
            item.customizations.forEach((c) => {
                AddonItem.push({
                    id: c.id || "addon",
                    name: c.name || "Customization",
                    price: Number(c.price || 0).toFixed(2),
                    group_id: c.groupId || "1",
                    group_name: c.groupName || "Addons",
                });
            });
        }
        return {
            item_id: item.id || item.productId || "item_1",
            item_name: item.name || item.title || "Burger",
            item_price: itemPrice.toFixed(2),
            quantity: quantity.toString(),
            total_price: totalItemPrice,
            description: item.notes || "",
            AddonItem,
        };
    });
    // Taxes
    const Tax = [];
    const taxAmount = Number(((_t = orderAfter.totals) === null || _t === void 0 ? void 0 : _t.tax) || ((_u = orderAfter.totals) === null || _u === void 0 ? void 0 : _u.gst) || 0);
    if (taxAmount > 0) {
        Tax.push({
            id: "GST_5",
            title: "GST (5%)",
            type: "P",
            price: taxAmount.toFixed(2),
            tax: "5.0",
        });
    }
    // Discounts
    const Discount = [];
    const totalDiscount = Number(((_v = orderAfter.totals) === null || _v === void 0 ? void 0 : _v.discount) || 0);
    if (totalDiscount > 0) {
        Discount.push({
            id: ((_w = orderAfter.promo) === null || _w === void 0 ? void 0 : _w.code) || "DISCOUNT",
            title: ((_x = orderAfter.promo) === null || _x === void 0 ? void 0 : _x.description) || "Discount",
            type: "fixed",
            price: totalDiscount.toFixed(2),
        });
    }
    const isCollectCash = ((_y = orderAfter.payment) === null || _y === void 0 ? void 0 : _y.method) === "cash" ||
        ((_z = orderAfter.payment) === null || _z === void 0 ? void 0 : _z.method) === "cod" ||
        ((_0 = orderAfter.payment) === null || _0 === void 0 ? void 0 : _0.status) === "CASH_PENDING" ||
        ((_1 = orderAfter.payment) === null || _1 === void 0 ? void 0 : _1.status) === "PAY_AT_STORE";
    const payload = {
        res_name: storeName,
        address: ((_2 = orderAfter.store) === null || _2 === void 0 ? void 0 : _2.addressLine1) || "",
        Contact_information: ((_3 = orderAfter.store) === null || _3 === void 0 ? void 0 : _3.phone) || "",
        restID: restID,
        OrderInfo: {
            Customer: {
                name: customerName,
                email: "customer@burgonomics.com",
                address: customerAddress,
                phone: customerPhone,
            },
            Order: {
                orderID: orderId,
                preorder_date: "",
                minimum_prep_time: "20",
                collect_cash: isCollectCash ? "1" : "0",
                details: orderAfter.notes || orderAfter.fulfillmentInstructions || "",
                ondc_bap: "",
                otp: "",
            },
            OrderItem,
            Tax,
            Discount,
        },
        device_type: "Mobile",
        udid: "ServerNode",
    };
    // 5. Execute Petpooja API call or Honest Sandbox Simulation (Mandate 1.d / POS-2)
    let lastError = null;
    let responseData = null;
    if (isSandbox) {
        functions.logger.info(`Petpooja Sandbox Mode: Simulating valid V2.1.0 POS dispatch for order ${orderId}`);
        await sleep(150); // Simulate brief POS network latency
        responseData = {
            success: "1",
            status: "success",
            orderID: `POS-${Date.now().toString().slice(-6)}`,
            clientOrderID: `KOT-${orderId.slice(-6).toUpperCase()}`,
            message: "Order successfully synced to Petpooja POS (Sandbox Mode)",
        };
    }
    else {
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                functions.logger.info(`Petpooja push attempt ${attempt}/${MAX_RETRIES} for order ${orderId}`);
                const response = await axios_1.default.post(PETPOOJA_SAVE_ORDER_URL, payload, {
                    headers: {
                        "Content-Type": "application/json",
                        "app-key": appKey,
                        "app-secret": appSecret,
                        "access-token": accessToken,
                        Authorization: `Bearer ${accessToken}`,
                    },
                    timeout: 10000,
                });
                responseData = response.data;
                if (responseData &&
                    (responseData.success === "1" ||
                        responseData.success === 1 ||
                        responseData.success === true ||
                        responseData.status === "success" ||
                        responseData.orderID ||
                        responseData.clientOrderID)) {
                    lastError = null;
                    break;
                }
                else {
                    throw new Error((responseData === null || responseData === void 0 ? void 0 : responseData.message) || `Petpooja returned unexpected response: ${JSON.stringify(responseData)}`);
                }
            }
            catch (err) {
                lastError = err;
                functions.logger.warn(`Petpooja push attempt ${attempt} failed for order ${orderId}: ${err.message}`);
                if (attempt < MAX_RETRIES) {
                    await sleep(RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1));
                }
            }
        }
    }
    // 6. Record final result in Firestore & Advance status
    if (!lastError && responseData) {
        const kotId = responseData.clientOrderID ||
            responseData.orderID ||
            `KOT-${orderId.slice(-6).toUpperCase()}`;
        const posOrderId = responseData.orderID || responseData.posOrderId || null;
        functions.logger.info(`Successfully synced order ${orderId} to Petpooja POS. KOT: ${kotId}`);
        // Record in internal petpooja_orders collection
        await db.collection("petpooja_orders").doc(orderId).set({
            orderId,
            kotId,
            posOrderId,
            syncedAt: admin.firestore.FieldValue.serverTimestamp(),
            mode: isSandbox ? "sandbox" : "live",
            payload,
        }, { merge: true });
        // Update customer order document
        await orderRef.update({
            petpoojaStatus: "Synced",
            petpoojaDetails: {
                kotId,
                posOrderId,
                syncedAt: new Date().toISOString(),
                mode: isSandbox ? "sandbox" : "live",
                payloadSummary: {
                    itemCount: OrderItem.length,
                    restID,
                    storeName,
                },
            },
            // Advance status from PLACED to CONFIRMED once acknowledged by POS
            "status.code": "CONFIRMED",
            "status.label": "Order confirmed",
            "status.kind": "upcoming",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return true;
    }
    else {
        functions.logger.error(`Failed to sync order ${orderId} to Petpooja after ${MAX_RETRIES} attempts. Error: ${lastError === null || lastError === void 0 ? void 0 : lastError.message}`);
        await orderRef.update({
            petpoojaStatus: "Failed",
            petpoojaLastError: (lastError === null || lastError === void 0 ? void 0 : lastError.message) || "Unknown error",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return false;
    }
});
//# sourceMappingURL=orders.js.map