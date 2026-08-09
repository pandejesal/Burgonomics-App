"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pushOrderToPetpooja = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios_1 = require("axios");
const db = admin.firestore();
const PETPOOJA_SAVE_ORDER_URL = "https://47pfzh5sf2.execute-api.ap-southeast-1.amazonaws.com/V1/save_order";
exports.pushOrderToPetpooja = functions.firestore
    .document("petpooja_orders/{orderId}")
    .onCreate(async (snap, context) => {
    var _a;
    const orderData = snap.data();
    const orderId = context.params.orderId;
    if (!orderData) {
        functions.logger.error("No data found for order:", orderId);
        return null;
    }
    // Skip if already processed
    if (orderData.syncStatus === "success" || orderData.syncStatus === "processing") {
        functions.logger.info(`Order ${orderId} already processed. Skipping.`);
        return null;
    }
    try {
        // Mark as processing
        await snap.ref.set({ syncStatus: "processing" }, { merge: true });
        functions.logger.info(`Pushing order ${orderId} to Petpooja...`, {
            restID: orderData.restID
        });
        // Construct Payload
        const payload = {
            app_key: orderData.app_key,
            app_secret: orderData.app_secret,
            access_token: orderData.access_token,
            res_name: orderData.res_name,
            address: orderData.address,
            Contact_information: orderData.Contact_information,
            restID: orderData.restID,
            OrderInfo: orderData.OrderInfo,
            device_type: orderData.device_type,
            udid: orderData.udid
        };
        const response = await axios_1.default.post(PETPOOJA_SAVE_ORDER_URL, payload, {
            headers: { "Content-Type": "application/json" }
        });
        functions.logger.info(`Petpooja Response for ${orderId}:`, response.data);
        const petpoojaResponse = response.data;
        // Update Firestore with success and KOT
        await snap.ref.set({
            syncStatus: "success",
            petpoojaResponse: petpoojaResponse,
            petpoojaOrderId: petpoojaResponse.orderID || null,
            syncedAt: new Date().toISOString()
        }, { merge: true });
        // We also update the user's order document to mark Petpooja status as synced
        // The frontend creates the user order in `users/{uid}/orders/{orderId}`
        // The petpooja_orders collection was just an integration bridge, but let's query 
        // all user orders for this ID and update it.
        const userOrderQuery = await db.collectionGroup("orders").where("id", "==", orderId).limit(1).get();
        if (!userOrderQuery.empty) {
            await userOrderQuery.docs[0].ref.update({
                petpoojaStatus: "Synced",
                petpoojaDetails: {
                    kotId: petpoojaResponse.clientOrderID || petpoojaResponse.orderID || null,
                    posOrderId: petpoojaResponse.orderID || null,
                    lastAttemptAt: new Date().toISOString()
                }
            });
        }
        return true;
    }
    catch (error) {
        functions.logger.error(`Error pushing order ${orderId} to Petpooja:`, error.message);
        if (error.response) {
            functions.logger.error("Petpooja Error Response:", error.response.data);
        }
        // Mark as failed in Firestore
        await snap.ref.set({
            syncStatus: "error",
            syncError: error.message,
            errorResponse: ((_a = error.response) === null || _a === void 0 ? void 0 : _a.data) || null
        }, { merge: true });
        // Update the user's order to mark as Failed
        const userOrderQuery = await db.collectionGroup("orders").where("id", "==", orderId).limit(1).get();
        if (!userOrderQuery.empty) {
            await userOrderQuery.docs[0].ref.update({
                petpoojaStatus: "Failed",
                petpoojaDetails: {
                    syncError: error.message,
                    lastAttemptAt: new Date().toISOString()
                }
            });
        }
        return null;
    }
});
//# sourceMappingURL=orders.js.map