import * as admin from "firebase-admin";

admin.initializeApp();

// Export Petpooja Webhooks
export * as petpooja from "./petpooja/webhooks";

// Export Petpooja Order Synchronization
export { pushOrderToPetpooja } from "./petpooja/orders";

// Export Razorpay Webhooks
export * as razorpay from "./razorpay/webhooks";

// Export Payments Express App (/payments/createPaymentOrder, /payments/verifyPayment, /payments/razorpayWebhook)
export { payments, createPaymentOrder, verifyPayment } from "./razorpay/orders";

// Export Auth Express App (/auth/request-otp, /auth/verify-otp) & Cloud Functions
export { auth, authApp, requestOtp, verifyOtp } from "./auth/routes";

// Export Native Push Notifications
export * as notifications from "./notifications/orders";

