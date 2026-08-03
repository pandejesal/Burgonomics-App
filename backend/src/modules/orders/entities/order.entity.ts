import type { FulfillmentType } from '@modules/cart/entities/cart.entity';
import type { OrderState } from '../state-machine/order-state';
import type { OrderItemEntity } from './order-item.entity';
import type { OrderEventEntity } from './order-event.entity';

export class OrderEntity {
  id!: string;
  clientOrderId!: string;
  petpoojaOrderId?: string | null;
  userId!: string;
  storeId!: string;
  addressId?: string | null;
  fulfillment!: FulfillmentType;
  status!: OrderState;
  tableNumber?: string | null;
  currency!: string;

  subtotal!: string;
  itemDiscount!: string;
  offerDiscount!: string;
  couponDiscount!: string;
  couponCode?: string | null;
  taxes!: string;
  packingFee!: string;
  deliveryFee!: string;
  serviceCharge!: string;
  roundOff!: string;
  grandTotal!: string;

  pricingSnapshot!: Record<string, unknown>;
  taxSnapshot?: Record<string, unknown> | null;

  customerNotes?: string | null;
  paymentReference?: string | null;
  prepEtaMinutes?: number | null;

  placedAt!: Date;
  acceptedAt?: Date | null;
  readyAt?: Date | null;
  dispatchedAt?: Date | null;
  deliveredAt?: Date | null;
  cancelledAt?: Date | null;
  cancellationReason?: string | null;

  createdAt!: Date;
  updatedAt!: Date;

  items!: OrderItemEntity[];
  events!: OrderEventEntity[];
}
