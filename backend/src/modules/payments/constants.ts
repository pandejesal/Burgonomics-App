/**
 * Razorpay integration constants. Endpoint paths mirror the public
 * Razorpay REST API (https://api.razorpay.com/v1). Only the base URL
 * is configurable per environment (test / live).
 */
export const RAZORPAY_ENDPOINTS = {
  CREATE_ORDER: '/orders',
  FETCH_ORDER: (id: string) => `/orders/${id}`,
  FETCH_PAYMENT: (id: string) => `/payments/${id}`,
  CAPTURE_PAYMENT: (id: string) => `/payments/${id}/capture`,
  CREATE_REFUND: (paymentId: string) => `/payments/${paymentId}/refund`,
  FETCH_REFUND: (id: string) => `/refunds/${id}`,
} as const;

export const RAZORPAY_METRIC_LABELS = {
  CREATE_ORDER: 'create_order',
  FETCH_ORDER: 'fetch_order',
  FETCH_PAYMENT: 'fetch_payment',
  CAPTURE_PAYMENT: 'capture_payment',
  CREATE_REFUND: 'create_refund',
  FETCH_REFUND: 'fetch_refund',
} as const;

export const RAZORPAY_BREAKER_DEFAULTS = {
  failureThreshold: 5,
  cooldownMs: 30_000,
  halfOpenMax: 1,
};

/** Razorpay webhook event names. See https://razorpay.com/docs/webhooks/payloads/ */
export const RAZORPAY_WEBHOOK_EVENTS = {
  PAYMENT_AUTHORIZED: 'payment.authorized',
  PAYMENT_CAPTURED: 'payment.captured',
  PAYMENT_FAILED: 'payment.failed',
  ORDER_PAID: 'order.paid',
  REFUND_CREATED: 'refund.created',
  REFUND_PROCESSED: 'refund.processed',
  REFUND_FAILED: 'refund.failed',
} as const;

export type RazorpayWebhookEvent =
  (typeof RAZORPAY_WEBHOOK_EVENTS)[keyof typeof RAZORPAY_WEBHOOK_EVENTS];

/** Currency codes supported by the platform. */
export const SUPPORTED_CURRENCIES = ['INR'] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/** Payment DTO caps (rupees). */
export const MIN_PAYMENT_AMOUNT = 1;
export const MAX_PAYMENT_AMOUNT = 500_000;
