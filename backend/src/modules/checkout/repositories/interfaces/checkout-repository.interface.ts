import type { Prisma } from '@prisma/client';
import type {
  CheckoutSessionEntity,
  CheckoutSessionStatus,
} from '../../entities/checkout-session.entity';
import type { FulfillmentType } from '@modules/cart/entities/cart.entity';

export const CHECKOUT_REPOSITORY = Symbol('CHECKOUT_REPOSITORY');

export interface UpsertSessionInput {
  cartId: string;
  userId: string;
  storeId: string;
  fulfillment: FulfillmentType;
  addressId?: string | null;
  tableNumber?: string | null;
  couponCode?: string | null;
  prepEtaMinutes?: number | null;
  pricingSnapshot?: Prisma.InputJsonValue;
  taxSnapshot?: Prisma.InputJsonValue;
  expiresAt: Date;
}

export interface ICheckoutRepository {
  upsertByCart(input: UpsertSessionInput): Promise<CheckoutSessionEntity>;
  findById(id: string): Promise<CheckoutSessionEntity | null>;
  findByCart(cartId: string): Promise<CheckoutSessionEntity | null>;
  updateStatus(
    id: string,
    status: CheckoutSessionStatus,
    patch?: Partial<{ validatedAt: Date; lockedAt: Date; convertedAt: Date; orderId: string }>,
  ): Promise<CheckoutSessionEntity>;
}
