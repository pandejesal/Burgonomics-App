import * as admin from "firebase-admin";

admin.initializeApp();

// Export Petpooja Webhooks
export * as petpooja from "./petpooja/webhooks";

// Export Petpooja Order Synchronization
export { pushOrderToPetpooja } from "./petpooja/orders";

// Export Native Push Notifications
export * as notifications from "./notifications/orders";

