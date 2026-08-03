export const STORE_EVENTS = {
  STATUS_CHANGED: 'store.status_changed',
  UPDATED: 'store.updated',
} as const;

export interface StoreStatusChangedEvent {
  storeId: string;
  previous: string;
  next: string;
  turnOnAt?: string;
}
