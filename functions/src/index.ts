import * as admin from "firebase-admin";

admin.initializeApp();

// Export Petpooja Webhooks
export * as petpooja from "./petpooja/webhooks";

// Export Petpooja Order Synchronization
export { pushOrderToPetpooja } from "./petpooja/orders";

// Export Razorpay Webhooks
export * as razorpay from "./razorpay/webhooks";

// Export Razorpay Orders & Verification
export * as payments from "./razorpay/orders";

// Export Native Push Notifications
export * as notifications from "./notifications/orders";
