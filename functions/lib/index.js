"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.razorpay = exports.pushOrderToPetpooja = exports.petpooja = void 0;
const admin = require("firebase-admin");
admin.initializeApp();
// Export Petpooja Webhooks
exports.petpooja = require("./petpooja/webhooks");
// Export Petpooja Order Synchronization
var orders_1 = require("./petpooja/orders");
Object.defineProperty(exports, "pushOrderToPetpooja", { enumerable: true, get: function () { return orders_1.pushOrderToPetpooja; } });
// Export Razorpay Webhooks
exports.razorpay = require("./razorpay/webhooks");
//# sourceMappingURL=index.js.map