import { NOTIFICATION_TYPES } from '../constants';

/**
 * Static default template registry. Real deployments hydrate the
 * `notification_templates` table from a migration; this list acts as
 * the seed/default fallback consumed by `TemplatesService`.
 */
export interface DefaultTemplate {
  code: string;
  type: string;
  channel: 'PUSH' | 'IN_APP' | 'SSE' | 'EMAIL' | 'SMS';
  locale: string;
  title: string;
  body: string;
}

export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  {
    code: 'ORDER_CONFIRMATION_PUSH',
    type: NOTIFICATION_TYPES.ORDER_CONFIRMATION,
    channel: 'PUSH',
    locale: 'en',
    title: 'Order placed',
    body: 'Your Burgonomics order #{{orderNo}} has been placed.',
  },
  {
    code: 'PAYMENT_SUCCESS_PUSH',
    type: NOTIFICATION_TYPES.PAYMENT_SUCCESS,
    channel: 'PUSH',
    locale: 'en',
    title: 'Payment received',
    body: 'We received your payment of ₹{{amount}} for order #{{orderNo}}.',
  },
  {
    code: 'PAYMENT_FAILURE_PUSH',
    type: NOTIFICATION_TYPES.PAYMENT_FAILURE,
    channel: 'PUSH',
    locale: 'en',
    title: 'Payment failed',
    body: 'Payment for order #{{orderNo}} could not be completed. Please retry.',
  },
  {
    code: 'ORDER_ACCEPTED_PUSH',
    type: NOTIFICATION_TYPES.ORDER_ACCEPTED,
    channel: 'PUSH',
    locale: 'en',
    title: 'Order accepted',
    body: 'The store has accepted order #{{orderNo}}.',
  },
  {
    code: 'ORDER_PREPARING_PUSH',
    type: NOTIFICATION_TYPES.ORDER_PREPARING,
    channel: 'PUSH',
    locale: 'en',
    title: 'Preparing your order',
    body: 'Order #{{orderNo}} is being prepared.',
  },
  {
    code: 'ORDER_READY_PUSH',
    type: NOTIFICATION_TYPES.ORDER_READY,
    channel: 'PUSH',
    locale: 'en',
    title: 'Order ready',
    body: 'Order #{{orderNo}} is ready.',
  },
  {
    code: 'ORDER_OFD_PUSH',
    type: NOTIFICATION_TYPES.ORDER_OUT_FOR_DELIVERY,
    channel: 'PUSH',
    locale: 'en',
    title: 'Out for delivery',
    body: 'Order #{{orderNo}} is on the way.',
  },
  {
    code: 'ORDER_DELIVERED_PUSH',
    type: NOTIFICATION_TYPES.ORDER_DELIVERED,
    channel: 'PUSH',
    locale: 'en',
    title: 'Delivered',
    body: 'Order #{{orderNo}} has been delivered. Enjoy!',
  },
  {
    code: 'ORDER_CANCELLED_PUSH',
    type: NOTIFICATION_TYPES.ORDER_CANCELLED,
    channel: 'PUSH',
    locale: 'en',
    title: 'Order cancelled',
    body: 'Order #{{orderNo}} has been cancelled.',
  },
  {
    code: 'ORDER_FAILED_PUSH',
    type: NOTIFICATION_TYPES.ORDER_FAILED,
    channel: 'PUSH',
    locale: 'en',
    title: 'Order failed',
    body: 'Order #{{orderNo}} could not be completed.',
  },
  {
    code: 'REFUND_INITIATED_PUSH',
    type: NOTIFICATION_TYPES.REFUND_INITIATED,
    channel: 'PUSH',
    locale: 'en',
    title: 'Refund initiated',
    body: 'Refund of ₹{{amount}} for order #{{orderNo}} has been initiated.',
  },
  {
    code: 'REFUND_COMPLETED_PUSH',
    type: NOTIFICATION_TYPES.REFUND_COMPLETED,
    channel: 'PUSH',
    locale: 'en',
    title: 'Refund completed',
    body: 'Refund of ₹{{amount}} for order #{{orderNo}} is complete.',
  },
  {
    code: 'STORE_CLOSED_PUSH',
    type: NOTIFICATION_TYPES.STORE_CLOSED,
    channel: 'PUSH',
    locale: 'en',
    title: 'Store closed',
    body: '{{storeName}} is currently closed.',
  },
  {
    code: 'OFFER_PUSH',
    type: NOTIFICATION_TYPES.OFFER,
    channel: 'PUSH',
    locale: 'en',
    title: '{{offerTitle}}',
    body: '{{offerBody}}',
  },
  {
    code: 'SYSTEM_PUSH',
    type: NOTIFICATION_TYPES.SYSTEM,
    channel: 'PUSH',
    locale: 'en',
    title: '{{title}}',
    body: '{{body}}',
  },
];

export function renderTemplate(tpl: string, params: Record<string, unknown>): string {
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    const value = params[key];
    return value === undefined || value === null ? '' : String(value);
  });
}
