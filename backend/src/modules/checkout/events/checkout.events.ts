export const CHECKOUT_EVENTS = {
  STARTED: 'checkout.started',
  VALIDATED: 'checkout.validated',
  FAILED: 'checkout.failed',
  LOCKED: 'checkout.locked',
  CONVERTED: 'checkout.converted',
} as const;

export interface CheckoutSessionEvent {
  sessionId: string;
  cartId: string;
  userId: string;
  storeId: string;
  correlationId?: string;
}
