import type { FulfillmentType } from '@modules/cart/entities/cart.entity';

export type CheckoutSessionStatus =
  'DRAFT' | 'VALIDATED' | 'LOCKED' | 'EXPIRED' | 'CONVERTED' | 'FAILED';

export class CheckoutSessionEntity {
  id!: string;
  cartId!: string;
  userId!: string;
  storeId!: string;
  fulfillment!: FulfillmentType;
  addressId?: string | null;
  tableNumber?: string | null;
  status!: CheckoutSessionStatus;
  couponCode?: string | null;
  pricingSnapshot?: Record<string, unknown> | null;
  taxSnapshot?: Record<string, unknown> | null;
  prepEtaMinutes?: number | null;
  expiresAt!: Date;
  validatedAt?: Date | null;
  lockedAt?: Date | null;
  convertedAt?: Date | null;
  orderId?: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}
