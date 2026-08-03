import type { OrderState } from '../state-machine/order-state';

export const ORDER_EVENTS = {
  CREATED: 'order.created',
  STATE_CHANGED: 'order.state_changed',
  CANCELLED: 'order.cancelled',
  COMPLETED: 'order.completed',
  REFUNDED: 'order.refunded',
  PETPOOJA_LINKED: 'order.petpooja_linked',
  PAYMENT_LINKED: 'order.payment_linked',
} as const;

export interface OrderLifecycleEvent {
  orderId: string;
  clientOrderId: string;
  userId: string;
  storeId: string;
  status: OrderState;
  correlationId?: string;
}

export interface OrderStateChangedEvent extends OrderLifecycleEvent {
  fromStatus: OrderState;
  toStatus: OrderState;
  reason?: string;
}
