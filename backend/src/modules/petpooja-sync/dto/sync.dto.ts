export const SYNC_SCOPES = [
  'STORES',
  'CATEGORIES',
  'PRODUCTS',
  'MODIFIERS',
  'OFFERS',
  'STOCK',
  'STORE_STATUS',
  'FULL',
] as const;
export type SyncScope = (typeof SYNC_SCOPES)[number];

export interface PetpoojaFetchJob {
  scope: SyncScope;
  storeId?: string;
  force?: boolean;
  correlationId?: string;
}

export interface PetpoojaWebhookJob {
  webhookEventId: string;
  webhookType: string;
  correlationId?: string;
}

export interface StockToggleJob {
  productPetpoojaId: string;
  storePetpoojaRestId: string;
  inStock: boolean;
  correlationId?: string;
}

export const CATALOG_SYNC_EVENTS = {
  STARTED: 'catalog_sync.started',
  FINISHED: 'catalog_sync.finished',
  FAILED: 'catalog_sync.failed',
  MENU_SYNCED: 'menu.synced',
} as const;
