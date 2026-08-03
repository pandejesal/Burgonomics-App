/**
 * PETPOOJA integration constants. These endpoint paths mirror the
 * official V1 URLs from the PETPOOJA Online Ordering API guide;
 * only the base URL (dev vs prod) is configurable via env.
 */
export const PETPOOJA_ENDPOINTS = {
  MAPPED_RESTAURANT_MENUS: '/mapped_restaurant_menus',
  SAVE_ORDER: '/save_order',
  UPDATE_ORDER_STATUS: '/update_order_status',
  RIDER_STATUS_UPDATE: '/rider_status_update',
} as const;

export type PetpoojaEndpoint = (typeof PETPOOJA_ENDPOINTS)[keyof typeof PETPOOJA_ENDPOINTS];

/**
 * PETPOOJA order-callback status codes (documented in the integration guide).
 */
export const PETPOOJA_CALLBACK_STATUS = {
  CANCELLED: '-1',
  ACCEPTED_1: '1',
  ACCEPTED_2: '2',
  ACCEPTED_3: '3',
  DISPATCHED: '4',
  FOOD_READY: '5',
  DELIVERED: '10',
} as const;

/**
 * PETPOOJA webhook types — used as routing keys inside the
 * webhook-processor queue and in audit tables.
 */
export const PETPOOJA_WEBHOOK_TYPES = {
  PUSH_MENU: 'push_menu',
  ORDER_CALLBACK: 'order_callback',
  STORE_STATUS: 'store_status',
  GET_STORE_STATUS: 'get_store_status',
  STOCK_UPDATE: 'stock_update',
} as const;

export type PetpoojaWebhookType =
  (typeof PETPOOJA_WEBHOOK_TYPES)[keyof typeof PETPOOJA_WEBHOOK_TYPES];

/** Rider status values accepted by PETPOOJA (rider_status_update). */
export const PETPOOJA_RIDER_STATUS = {
  ASSIGNED: 'rider-assigned',
  ARRIVED: 'rider-arrived',
  PICKED_UP: 'rider-picked-up',
  DELIVERED: 'rider-delivered',
} as const;

export type PetpoojaRiderStatus =
  (typeof PETPOOJA_RIDER_STATUS)[keyof typeof PETPOOJA_RIDER_STATUS];

/** Circuit-breaker defaults for the PETPOOJA HTTP client. */
export const PETPOOJA_BREAKER_DEFAULTS = {
  failureThreshold: 5,
  cooldownMs: 30_000,
  halfOpenMax: 1,
};

export const PETPOOJA_METRIC_LABELS = {
  MENU: 'menu',
  SAVE_ORDER: 'save_order',
  UPDATE_ORDER_STATUS: 'update_order_status',
  RIDER_STATUS: 'rider_status',
} as const;
