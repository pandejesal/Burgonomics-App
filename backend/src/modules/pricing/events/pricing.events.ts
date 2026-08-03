export const PRICING_EVENTS = {
  CALCULATED: 'pricing.calculated',
} as const;

export interface PricingCalculatedEvent {
  scope: 'CART' | 'CHECKOUT' | 'ORDER';
  referenceId: string;
  grandTotal: string;
  currency: string;
  correlationId?: string;
}
