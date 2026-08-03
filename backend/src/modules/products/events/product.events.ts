export const PRODUCT_EVENTS = {
  CREATED: 'product.created',
  UPDATED: 'product.updated',
  DELETED: 'product.deleted',
  AVAILABILITY_CHANGED: 'product.availability_changed',
  STOCK_UPDATED: 'product.stock_updated',
} as const;

export interface ProductChangedEvent {
  productId: string;
  petpoojaId: string;
  categoryId?: string;
  source: 'PETPOOJA_SYNC' | 'SYSTEM';
  correlationId?: string;
}

export interface StockUpdatedEvent {
  productId: string;
  storeId: string;
  inStock: boolean;
  source: 'PETPOOJA_SYNC' | 'PETPOOJA_WEBHOOK';
  correlationId?: string;
}
