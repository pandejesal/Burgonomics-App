"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pushOrderToPetpooja = void 0;
const functions = require("firebase-functions");
const axios_1 = require("axios");
const PETPOOJA_SAVE_ORDER_URL = "https://47pfzh5sf2.execute-api.ap-southeast-1.amazonaws.com/V1/save_order";
exports.pushOrderToPetpooja = functions.firestore
    .document("orders/{orderId}")
    .onUpdate(async (change, context) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w;
    const orderBefore = change.before.data();
    const orderAfter = change.after.data();
    const orderId = context.params.orderId;
    if (!orderAfter)
        return null;
    // We only trigger when the paymentStatus flips to "Paid"
    const wasPaid = orderBefore.paymentStatus === "Paid" || ((_a = orderBefore === null || orderBefore === void 0 ? void 0 : orderBefore.payment) === null || _a === void 0 ? void 0 : _a.status) === "paid";
    const isPaid = orderAfter.paymentStatus === "Paid" || ((_b = orderAfter === null || orderAfter === void 0 ? void 0 : orderAfter.payment) === null || _b === void 0 ? void 0 : _b.status) === "paid";
    // Cash orders might skip "Paid" status initially, but let's assume they are marked properly or we handle them.
    // Let's also check if it's cash and just got placed.
    const isCashOrderPlacing = ((_c = orderAfter.payment) === null || _c === void 0 ? void 0 : _c.method) === "cash" &&
        ((_d = orderBefore.status) === null || _d === void 0 ? void 0 : _d.current) !== "placed" &&
        ((_e = orderAfter.status) === null || _e === void 0 ? void 0 : _e.current) === "placed";
    if ((wasPaid && isPaid) && !isCashOrderPlacing) {
        // Already pushed or not relevant
        return null;
    }
    if (!isPaid && !isCashOrderPlacing) {
        // Not yet ready to push
        return null;
    }
    // Skip if Petpooja is already synced
    if (orderAfter.petpoojaStatus === "Synced" || orderAfter.petpoojaStatus === "Processing") {
        functions.logger.info(`Order ${orderId} already pushed or processing. Skipping.`);
        return null;
    }
    try {
        // Mark as processing
        await change.after.ref.update({ petpoojaStatus: "Processing" });
        functions.logger.info(`Pushing order ${orderId} to Petpooja...`, {
            storeId: (_f = orderAfter.store) === null || _f === void 0 ? void 0 : _f.id
        });
        const appKey = process.env.PETPOOJA_APP_KEY || ((_g = functions.config().petpooja) === null || _g === void 0 ? void 0 : _g.app_key);
        const appSecret = process.env.PETPOOJA_APP_SECRET || ((_h = functions.config().petpooja) === null || _h === void 0 ? void 0 : _h.app_secret);
        const accessToken = process.env.PETPOOJA_ACCESS_TOKEN || ((_j = functions.config().petpooja) === null || _j === void 0 ? void 0 : _j.access_token);
        if (!appKey || !appSecret || !accessToken) {
            functions.logger.error(`Petpooja credentials not configured; skipping order ${orderId}`);
            await change.after.ref.update({
                petpoojaStatus: "Failed",
                petpoojaDetails: {
                    syncError: "Petpooja credentials not configured",
                    lastAttemptAt: new Date().toISOString()
                }
            });
            return null;
        }
        // Map Order to Petpooja Payload
        const storeName = ((_k = orderAfter.store) === null || _k === void 0 ? void 0 : _k.name) || "Burgonomics";
        const restID = ((_l = orderAfter.store) === null || _l === void 0 ? void 0 : _l.petpoojaRestId) || ((_m = orderAfter.store) === null || _m === void 0 ? void 0 : _m.id);
        const customerName = ((_o = orderAfter.address) === null || _o === void 0 ? void 0 : _o.name) || "Customer";
        const customerPhone = ((_p = orderAfter.address) === null || _p === void 0 ? void 0 : _p.phone) || "9876543210";
        const customerAddress = orderAfter.address
            ? `${orderAfter.address.line1}, ${orderAfter.address.line2 || ""}, ${orderAfter.address.city}`
            : "Store Order";
        const OrderItem = (orderAfter.items || []).map((item) => {
            var _a;
            const unitPrice = typeof item.unitPrice === "number" ? item.unitPrice : ((_a = item.price) !== null && _a !== void 0 ? _a : 0);
            const addonitem = (item.modifiers || []).map((mod) => {
                var _a;
                return ({
                    id: mod.optionId,
                    name: mod.name,
                    group_name: mod.groupName || "Extras",
                    price: ((_a = mod.priceDelta) !== null && _a !== void 0 ? _a : 0).toFixed(2)
                });
            });
            return {
                id: item.productId,
                name: item.name,
                price: unitPrice.toFixed(2),
                qty: (item.quantity || 1).toString(),
                tax_inclusive: "1",
                addonitem
            };
        });
        const Tax = [];
        if (((_q = orderAfter.totals) === null || _q === void 0 ? void 0 : _q.taxes) > 0) {
            Tax.push({
                id: "tax_gst",
                title: "GST",
                type: "percentage",
                price: orderAfter.totals.taxes.toFixed(2),
                tax: "5.00"
            });
        }
        const Discount = [];
        const totalDiscount = (((_r = orderAfter.totals) === null || _r === void 0 ? void 0 : _r.itemDiscount) || 0) + (((_s = orderAfter.totals) === null || _s === void 0 ? void 0 : _s.promoDiscount) || 0);
        if (totalDiscount > 0) {
            Discount.push({
                id: ((_t = orderAfter.promo) === null || _t === void 0 ? void 0 : _t.code) || "discount",
                title: "Discount",
                type: "fixed",
                price: totalDiscount.toFixed(2)
            });
        }
        const payload = {
            app_key: appKey,
            app_secret: appSecret,
            access_token: accessToken,
            res_name: storeName,
            address: ((_u = orderAfter.store) === null || _u === void 0 ? void 0 : _u.addressLine1) || "",
            Contact_information: ((_v = orderAfter.store) === null || _v === void 0 ? void 0 : _v.phone) || "",
            restID: restID,
            OrderInfo: {
                Customer: {
                    name: customerName,
                    email: "customer@example.com",
                    address: customerAddress,
                    phone: customerPhone
                },
                Order: {
                    orderID: orderId,
                    preorder_date: "",
                    minimum_prep_time: "20",
                    collect_cash: ((_w = orderAfter.payment) === null || _w === void 0 ? void 0 : _w.method) === "cash" ? "1" : "0",
                    details: orderAfter.notes || orderAfter.fulfillmentInstructions || "",
                    ondc_bap: "",
                    otp: ""
                },
                OrderItem,
                Tax,
                Discount
            },
            device_type: "Mobile",
            udid: "ServerNode"
        };
        const response = await axios_1.default.post(PETPOOJA_SAVE_ORDER_URL, payload, {
            headers: { "Content-Type": "application/json" }
        });
        functions.logger.info(`Petpooja Response for ${orderId}:`, response.data);
        const petpoojaResponse = response.data;
        // Successfully synced
        await change.after.ref.update({
            petpoojaStatus: "Synced",
            petpoojaDetails: {
                kotId: petpoojaResponse.clientOrderID || petpoojaResponse.orderID || null,
                posOrderId: petpoojaResponse.orderID || null,
                lastAttemptAt: new Date().toISOString()
            }
        });
        return true;
    }
    catch (error) {
        functions.logger.error(`Error pushing order ${orderId} to Petpooja:`, error.message);
        await change.after.ref.update({
            petpoojaStatus: "Failed",
            petpoojaDetails: {
                syncError: error.message,
                lastAttemptAt: new Date().toISOString()
            }
        });
        return null;
    }
});
//# sourceMappingURL=orders.js.map