/**
 * Canonical queue registry. Every BullMQ queue in the system MUST be
 * declared here; workers register against these names.
 */
export const QUEUE_NAMES = {
  PETPOOJA_SAVE_ORDER: 'petpooja.save-order',
  PETPOOJA_UPDATE_STATUS: 'petpooja.update-status',
  PETPOOJA_ORDER_CANCEL: 'petpooja.order-cancel',
  PETPOOJA_RIDER_UPDATE: 'petpooja.rider-update',
  PETPOOJA_FETCH_MENU: 'petpooja.fetch-menu',
  PETPOOJA_STOCK_TOGGLE: 'petpooja.stock-toggle',
  PETPOOJA_WEBHOOK_PROCESS: 'petpooja.webhook-process',
  NOTIFICATIONS_SEND: 'notifications.send',
  NOTIFICATIONS_PUSH: 'notifications.push',
  NOTIFICATIONS_RETRY: 'notifications.retry',
  NOTIFICATIONS_CLEANUP: 'notifications.cleanup',
  NOTIFICATIONS_BROADCAST: 'notifications.broadcast',
  OUTBOX_PUBLISH: 'outbox.publish',
  ANALYTICS_INGEST: 'analytics.ingest',
  PAYMENTS_VERIFY: 'payments.verify',
  PAYMENTS_WEBHOOK_PROCESS: 'payments.webhook-process',
  PAYMENTS_REFUND: 'payments.refund',
  PAYMENTS_CLEANUP: 'payments.cleanup',
  REPORTS_GENERATE: 'reports.generate',
  AUDIT_INGEST: 'audit.ingest',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const DEAD_LETTER_SUFFIX = '.dlq';
