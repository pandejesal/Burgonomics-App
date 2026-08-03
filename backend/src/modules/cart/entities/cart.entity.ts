import type { CartItemEntity } from './cart-item.entity';

export type FulfillmentType = 'DELIVERY' | 'TAKEAWAY' | 'DINE_IN';
export type CartStatus = 'ACTIVE' | 'CONVERTED' | 'ABANDONED' | 'EXPIRED';

export class CartEntity {
  id!: string;
  userId?: string | null;
  anonymousId?: string | null;
  storeId?: string | null;
  fulfillment!: FulfillmentType;
  addressId?: string | null;
  tableNumber?: string | null;
  status!: CartStatus;
  currency!: string;
  notes?: string | null;
  expiresAt?: Date | null;
  createdAt!: Date;
  updatedAt!: Date;
  items!: CartItemEntity[];
}
