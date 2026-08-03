export const OFFER_EVENTS = {
  CREATED: 'offer.created',
  UPDATED: 'offer.updated',
  DEACTIVATED: 'offer.deactivated',
  COUPON_VALIDATED: 'offer.coupon_validated',
} as const;

export interface OfferChangedEvent {
  offerId: string;
  petpoojaId?: string | null;
  source: 'PETPOOJA_SYNC' | 'SYSTEM';
  correlationId?: string;
}
