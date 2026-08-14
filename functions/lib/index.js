"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifications = exports.verifyPayment = exports.createPaymentOrder = exports.payments = exports.razorpay = exports.pushOrderToPetpooja = exports.petpooja = void 0;
const admin = require("firebase-admin");
admin.initializeApp();
// Export Petpooja Webhooks
exports.petpooja = require("./petpooja/webhooks");
// Export Petpooja Order Synchronization
var orders_1 = require("./petpooja/orders");
Object.defineProperty(exports, "pushOrderToPetpooja", { enumerable: true, get: function () { return orders_1.pushOrderToPetpooja; } });
// Export Razorpay Webhooks
exports.razorpay = require("./razorpay/webhooks");
// Export Payments Express App (/payments/createPaymentOrder, /payments/verifyPayment, /payments/razorpayWebhook)
var orders_2 = require("./razorpay/orders");
Object.defineProperty(exports, "payments", { enumerable: true, get: function () { return orders_2.payments; } });
Object.defineProperty(exports, "createPaymentOrder", { enumerable: true, get: function () { return orders_2.createPaymentOrder; } });
Object.defineProperty(exports, "verifyPayment", { enumerable: true, get: function () { return orders_2.verifyPayment; } });
// Export Native Push Notifications
exports.notifications = require("./notifications/orders");
//# sourceMappingURL=index.js.map