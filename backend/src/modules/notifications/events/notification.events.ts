export const NOTIFICATION_EVENTS = {
  CREATED: 'notification.created',
  QUEUED: 'notification.queued',
  SENT: 'notification.sent',
  DELIVERED: 'notification.delivered',
  FAILED: 'notification.failed',
  READ: 'notification.read',
  ARCHIVED: 'notification.archived',
  DEVICE_REGISTERED: 'notification.device_registered',
  DEVICE_REMOVED: 'notification.device_removed',
  DEVICE_REFRESHED: 'notification.device_refreshed',
  FCM_SENT: 'notification.fcm_sent',
  FCM_FAILED: 'notification.fcm_failed',
  ORDER_TRACKING_UPDATED: 'notification.order_tracking_updated',
} as const;

export interface NotificationLifecycleEvent {
  notificationId: string;
  userId: string;
  type: string;
  category: string;
  channel: string;
  correlationId?: string;
}

export interface NotificationFailedEvent extends NotificationLifecycleEvent {
  error: string;
  attempt: number;
}

export interface DeviceLifecycleEvent {
  deviceId: string;
  userId: string;
  platform: string;
  correlationId?: string;
}

export interface OrderTrackingUpdatedEvent {
  orderId: string;
  userId: string;
  status: string;
  message?: string;
  data?: Record<string, unknown>;
  correlationId?: string;
}
