export const CART_EVENTS = {
  CREATED: 'cart.created',
  UPDATED: 'cart.updated',
  ITEM_ADDED: 'cart.item_added',
  ITEM_UPDATED: 'cart.item_updated',
  ITEM_REMOVED: 'cart.item_removed',
  CLEARED: 'cart.cleared',
  MERGED: 'cart.merged',
  EXPIRED: 'cart.expired',
} as const;

export interface CartLifecycleEvent {
  cartId: string;
  userId?: string | null;
  anonymousId?: string | null;
  storeId?: string | null;
  correlationId?: string;
}

export interface CartItemEvent extends CartLifecycleEvent {
  itemId: string;
  productId: string;
  quantity: number;
}

export interface CartMergedEvent {
  sourceCartId: string;
  targetCartId: string;
  userId: string;
  itemsMerged: number;
  correlationId?: string;
}
