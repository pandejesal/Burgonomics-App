import type { OrderState } from '../state-machine/order-state';

export type OrderEventType =
  | 'STATE_CHANGED'
  | 'PAYMENT_LINKED'
  | 'PETPOOJA_LINKED'
  | 'PETPOOJA_ACK'
  | 'CUSTOMER_NOTE'
  | 'SYSTEM_NOTE'
  | 'CANCELLATION_REQUESTED'
  | 'REFUND_INITIATED'
  | 'REFUND_COMPLETED';

export class OrderEventEntity {
  id!: string;
  orderId!: string;
  type!: OrderEventType;
  fromStatus?: OrderState | null;
  toStatus?: OrderState | null;
  message?: string | null;
  metadata?: Record<string, unknown> | null;
  actorId?: string | null;
  correlationId?: string | null;
  createdAt!: Date;
}
