import type { Prisma } from '@prisma/client';
import type { OrderEntity } from '../../entities/order.entity';
import type { OrderState } from '../../state-machine/order-state';
import type { OrderEventType } from '../../entities/order-event.entity';
import type { ListOrdersQueryDto } from '../../dto';

export const ORDER_REPOSITORY = Symbol('ORDER_REPOSITORY');

export interface CreateOrderInput {
  clientOrderId: string;
  userId: string;
  storeId: string;
  addressId?: string | null;
  fulfillment: 'DELIVERY' | 'TAKEAWAY' | 'DINE_IN';
  tableNumber?: string | null;
  currency: string;
  customerNotes?: string | null;
  couponCode?: string | null;
  prepEtaMinutes?: number | null;
  totals: {
    subtotal: string;
    itemDiscount: string;
    offerDiscount: string;
    couponDiscount: string;
    taxes: string;
    packingFee: string;
    deliveryFee: string;
    serviceCharge: string;
    roundOff: string;
    grandTotal: string;
  };
  pricingSnapshot: Prisma.InputJsonValue;
  taxSnapshot?: Prisma.InputJsonValue;
  items: {
    productId: string;
    productPetpoojaId: string;
    name: string;
    quantity: number;
    unitPrice: string;
    taxRate: string;
    lineTotal: string;
    notes?: string | null;
    modifiers: {
      groupId: string;
      groupName: string;
      optionId: string;
      optionPetpoojaId: string;
      optionName: string;
      priceDelta: string;
    }[];
  }[];
}

export interface AppendEventInput {
  orderId: string;
  type: OrderEventType;
  fromStatus?: OrderState | null;
  toStatus?: OrderState | null;
  message?: string | null;
  metadata?: Prisma.InputJsonValue;
  actorId?: string | null;
  correlationId?: string | null;
}

export interface IOrderRepository {
  create(input: CreateOrderInput): Promise<OrderEntity>;
  findById(id: string): Promise<OrderEntity | null>;
  findByClientOrderId(clientOrderId: string): Promise<OrderEntity | null>;
  list(userId: string, q: ListOrdersQueryDto): Promise<{ items: OrderEntity[]; total: number }>;
  updateStatus(
    id: string,
    status: OrderState,
    patch?: Partial<{
      acceptedAt: Date;
      readyAt: Date;
      dispatchedAt: Date;
      deliveredAt: Date;
      cancelledAt: Date;
      cancellationReason: string;
      petpoojaOrderId: string;
      paymentReference: string;
    }>,
  ): Promise<OrderEntity>;
  appendEvent(input: AppendEventInput): Promise<void>;
}
