export const MENU_EVENTS = {
  SYNCED: 'menu.synced',
  CACHE_INVALIDATED: 'menu.cache_invalidated',
  REFRESH_REQUESTED: 'menu.refresh_requested',
} as const;

export interface MenuSyncedEvent {
  storeId?: string;
  syncType: string;
  version: string;
  correlationId?: string;
}

export interface MenuCacheInvalidatedEvent {
  storeId?: string;
  reason: string;
  correlationId?: string;
}
