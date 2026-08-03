import type {
  NotificationCategory,
  NotificationChannel,
  NotificationPriority,
} from '@prisma/client';

/**
 * Canonical notification type registry. Templates are keyed on this
 * value; any code emitting a notification must reference the enum.
 */
export const NOTIFICATION_TYPES = {
  ORDER_CONFIRMATION: 'order.confirmation',
  PAYMENT_SUCCESS: 'payment.success',
  PAYMENT_FAILURE: 'payment.failure',
  ORDER_ACCEPTED: 'order.accepted',
  ORDER_PREPARING: 'order.preparing',
  ORDER_READY: 'order.ready',
  ORDER_OUT_FOR_DELIVERY: 'order.out_for_delivery',
  ORDER_DELIVERED: 'order.delivered',
  ORDER_CANCELLED: 'order.cancelled',
  ORDER_FAILED: 'order.failed',
  REFUND_INITIATED: 'refund.initiated',
  REFUND_COMPLETED: 'refund.completed',
  STORE_CLOSED: 'store.closed',
  OFFER: 'offer',
  SYSTEM: 'system',
  LOYALTY: 'loyalty',
  MEMBERSHIP: 'membership',
} as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

export const NOTIFICATION_TYPE_TO_CATEGORY: Record<NotificationType, NotificationCategory> = {
  [NOTIFICATION_TYPES.ORDER_CONFIRMATION]: 'ORDER',
  [NOTIFICATION_TYPES.ORDER_ACCEPTED]: 'ORDER',
  [NOTIFICATION_TYPES.ORDER_PREPARING]: 'ORDER',
  [NOTIFICATION_TYPES.ORDER_READY]: 'ORDER',
  [NOTIFICATION_TYPES.ORDER_OUT_FOR_DELIVERY]: 'ORDER',
  [NOTIFICATION_TYPES.ORDER_DELIVERED]: 'ORDER',
  [NOTIFICATION_TYPES.ORDER_CANCELLED]: 'ORDER',
  [NOTIFICATION_TYPES.ORDER_FAILED]: 'ORDER',
  [NOTIFICATION_TYPES.PAYMENT_SUCCESS]: 'PAYMENT',
  [NOTIFICATION_TYPES.PAYMENT_FAILURE]: 'PAYMENT',
  [NOTIFICATION_TYPES.REFUND_INITIATED]: 'PAYMENT',
  [NOTIFICATION_TYPES.REFUND_COMPLETED]: 'PAYMENT',
  [NOTIFICATION_TYPES.STORE_CLOSED]: 'SYSTEM',
  [NOTIFICATION_TYPES.OFFER]: 'OFFER',
  [NOTIFICATION_TYPES.SYSTEM]: 'SYSTEM',
  [NOTIFICATION_TYPES.LOYALTY]: 'LOYALTY',
  [NOTIFICATION_TYPES.MEMBERSHIP]: 'MEMBERSHIP',
};

export const DEFAULT_CHANNELS_BY_CATEGORY: Record<NotificationCategory, NotificationChannel[]> = {
  ORDER: ['PUSH', 'SSE', 'IN_APP'],
  PAYMENT: ['PUSH', 'SSE', 'IN_APP'],
  OFFER: ['PUSH', 'IN_APP'],
  SYSTEM: ['PUSH', 'IN_APP', 'SSE'],
  GENERAL: ['IN_APP'],
  LOYALTY: ['PUSH', 'IN_APP'],
  MEMBERSHIP: ['PUSH', 'IN_APP'],
};

export const DEFAULT_PRIORITY_BY_TYPE: Partial<Record<NotificationType, NotificationPriority>> = {
  [NOTIFICATION_TYPES.PAYMENT_FAILURE]: 'HIGH',
  [NOTIFICATION_TYPES.ORDER_READY]: 'HIGH',
  [NOTIFICATION_TYPES.ORDER_OUT_FOR_DELIVERY]: 'HIGH',
  [NOTIFICATION_TYPES.ORDER_DELIVERED]: 'HIGH',
};

export const REALTIME_STREAMS = {
  NOTIFICATIONS: 'notifications',
  ORDER_TRACKING: 'orders',
} as const;

export type RealtimeStream = (typeof REALTIME_STREAMS)[keyof typeof REALTIME_STREAMS];

export const SSE_HEARTBEAT_INTERVAL_MS = 25_000;
export const SSE_CONNECTION_MAX_AGE_MS = 55 * 60 * 1_000;
export const REALTIME_PUBSUB_CHANNEL = 'burg:realtime';
