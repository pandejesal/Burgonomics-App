// vitest setup file - sets required environment variables for testing
// This file runs before all tests to ensure required env vars are set

// Firebase required env vars
process.env.VITE_FIREBASE_API_KEY = "AIzaSyTestKeyForTesting123456789";
process.env.VITE_FIREBASE_AUTH_DOMAIN = "test-project.firebaseapp.com";
process.env.VITE_FIREBASE_PROJECT_ID = "test-project";
process.env.VITE_FIREBASE_STORAGE_BUCKET = "test-project.appspot.com";
process.env.VITE_FIREBASE_MESSAGING_SENDER_ID = "123456789";
process.env.VITE_FIREBASE_APP_ID = "1:123456789:web:abcdef123456";
process.env.VITE_FIREBASE_MEASUREMENT_ID = "G-TEST123";

// Razorpay
process.env.VITE_RAZORPAY_KEY_ID = "rzp_test_testkey123";

// Other optional env vars
process.env.VITE_APP_ENV = "development";
process.env.VITE_APP_NAME = "Burgonomics";
process.env.VITE_APP_VERSION = "1.0.0";
process.env.VITE_API_BASE_URL = "http://localhost:3000";
process.env.VITE_API_URL = "http://localhost:3000";
process.env.VITE_API_TIMEOUT_MS = "15000";
process.env.VITE_API_RETRY_ATTEMPTS = "2";
process.env.VITE_API_RETRY_BACKOFF_MS = "400";
process.env.VITE_FF_OFFLINE_MODE = "true";
process.env.VITE_FF_ORDER_TRACKING = "true";
process.env.VITE_FF_REFERRALS = "false";
process.env.VITE_FF_ADMIN_OPS = "false";
process.env.VITE_ANALYTICS_ENABLED = "false";
process.env.VITE_ANALYTICS_WRITE_KEY = "";
process.env.VITE_PUSH_ENABLED = "false";
process.env.VITE_PUSH_VAPID_PUBLIC_KEY = "";
process.env.VITE_RAZORPAY_KEY_ID = "rzp_test_testkey123";
process.env.VITE_PAYMENTS_API_BASE_URL = "http://localhost:3000";
process.env.VITE_PETPOOJA_ENABLED = "false";
process.env.VITE_MAPS_API_KEY = "";
process.env.VITE_FIREBASE_CONFIG = "";
process.env.VITE_RECAPTCHA_SITE_KEY = "";
process.env.VITE_FCM_ENABLED = "false";
process.env.VITE_FCM_VAPID_KEY = "";
process.env.VITE_FUNCTIONS_API_URL = "http://localhost:5001/test-project/us-central1/api";
process.env.VITE_PETPOOJA_PROXY_URL = "";
process.env.VITE_ADMIN_MAINTENANCE_PIN = "1234";
process.env.VITE_WORKSPACE_ID = "test";
process.env.VITE_PORTAL_MODE = "partner";

// Ensure test environment is not production
process.env.VITEST = "true";
process.env.NODE_ENV = "test";

Object.defineProperty(import.meta, 'env', {
  value: {
    ...import.meta.env,
    PROD: false,
    DEV: true,
  },
  configurable: true,
});