"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifications = exports.pushOrderToPetpooja = exports.petpooja = void 0;
const admin = require("firebase-admin");
admin.initializeApp();
// Export Petpooja Webhooks
exports.petpooja = require("./petpooja/webhooks");
// Export Petpooja Order Synchronization
var orders_1 = require("./petpooja/orders");
Object.defineProperty(exports, "pushOrderToPetpooja", { enumerable: true, get: function () { return orders_1.pushOrderToPetpooja; } });
// Export Native Push Notifications
exports.notifications = require("./notifications/orders");
//# sourceMappingURL=index.js.map