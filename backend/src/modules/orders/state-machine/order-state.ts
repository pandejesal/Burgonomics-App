/**
 * Order state machine — strongly typed, deterministic. This is the
 * single source of truth for legal transitions across the entire
 * Commerce Domain. Illegal transitions MUST be rejected by callers.
 */
export const ORDER_STATES = [
  'CART',
  'CHECKOUT',
  'PAYMENT_PENDING',
  'PAYMENT_VERIFIED',
  'ORDER_CREATED',
  'ORDER_SENT_TO_PETPOOJA',
  'ORDER_ACCEPTED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
  'FAILED',
  'REFUNDED',
] as const;

export type OrderState = (typeof ORDER_STATES)[number];

export const TERMINAL_STATES: readonly OrderState[] = ['COMPLETED', 'CANCELLED', 'REFUNDED'];
