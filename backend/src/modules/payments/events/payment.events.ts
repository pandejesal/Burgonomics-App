export const PAYMENT_EVENTS = {
  ORDER_CREATED: 'payment.order_created',
  AUTHORIZED: 'payment.authorized',
  CAPTURED: 'payment.captured',
  VERIFIED: 'payment.verified',
  FAILED: 'payment.failed',
  EXPIRED: 'payment.expired',
  WEBHOOK_RECEIVED: 'payment.webhook_received',
  WEBHOOK_PROCESSED: 'payment.webhook_processed',
  WEBHOOK_DEAD_LETTERED: 'payment.webhook_dead_lettered',
  REFUND_CREATED: 'refund.created',
  REFUND_COMPLETED: 'refund.completed',
  REFUND_FAILED: 'refund.failed',
} as const;

export type PaymentEventName = (typeof PAYMENT_EVENTS)[keyof typeof PAYMENT_EVENTS];

export interface PaymentEventBase {
  paymentId: string;
  orderId: string;
  userId?: string;
  correlationId?: string;
}

export interface PaymentOrderCreatedEvent extends PaymentEventBase {
  gatewayOrderId: string;
  amount: string;
  currency: string;
}

export interface PaymentVerifiedEvent extends PaymentEventBase {
  gatewayPaymentId: string;
}

export interface PaymentFailedEvent extends PaymentEventBase {
  code?: string;
  message?: string;
}

export interface RefundEventPayload {
  refundId: string;
  paymentId: string;
  orderId: string;
  amount: string;
  isPartial: boolean;
  gatewayRefundId?: string;
  correlationId?: string;
}

export interface PaymentWebhookEventPayload {
  webhookEventId: string;
  eventType: string;
  correlationId?: string;
}
