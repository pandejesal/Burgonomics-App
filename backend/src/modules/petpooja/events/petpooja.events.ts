import type { OrderState } from '@modules/orders/state-machine/order-state';

export const PETPOOJA_EVENTS = {
  MENU_SYNCED: 'petpooja.menu_synced',
  ORDER_SENT: 'petpooja.order_sent',
  ORDER_ACCEPTED: 'petpooja.order_accepted',
  ORDER_CALLBACK_APPLIED: 'petpooja.order_callback_applied',
  WEBHOOK_RECEIVED: 'petpooja.webhook_received',
  WEBHOOK_PROCESSED: 'petpooja.webhook_processed',
  STOCK_UPDATED: 'petpooja.stock_updated',
  STORE_STATUS_CHANGED: 'petpooja.store_status_changed',
  SYNC_FAILED: 'petpooja.sync_failed',
} as const;

export interface MenuSyncedEvent {
  restaurantPetpoojaId?: string;
  counts: {
    categories: number;
    products: number;
    modifierGroups: number;
    offers: number;
  };
  correlationId?: string;
}

export interface OrderSentToPetpoojaEvent {
  orderId: string;
  petpoojaOrderId: string;
  correlationId?: string;
}

export interface OrderCallbackAppliedEvent {
  orderId: string;
  clientOrderId: string;
  targetState: OrderState;
  correlationId?: string;
}

export interface StockUpdatedEvent {
  petpoojaRestId: string;
  petpoojaItemIds: string[];
  inStock: boolean;
  correlationId?: string;
}

export interface StoreStatusChangedEvent {
  storeId: string;
  petpoojaRestId: string;
  status: 'OPEN' | 'CLOSED';
  turnOnAt: Date | null;
  reason: string | null;
  correlationId?: string;
}

export interface WebhookReceivedEvent {
  webhookEventId: string;
  webhookType: string;
  correlationId?: string;
}
