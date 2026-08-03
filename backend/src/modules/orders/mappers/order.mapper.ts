import type { Order, OrderEvent, OrderItem, OrderItemModifier } from '@prisma/client';
import { OrderEntity } from '../entities/order.entity';
import { OrderItemEntity, OrderItemModifierEntity } from '../entities/order-item.entity';
import { OrderEventEntity, type OrderEventType } from '../entities/order-event.entity';
import type { FulfillmentType } from '@modules/cart/entities/cart.entity';
import type { OrderState } from '../state-machine/order-state';
import type {
  OrderEventResponseDto,
  OrderItemModifierResponseDto,
  OrderItemResponseDto,
  OrderResponseDto,
  OrderTimelineResponseDto,
} from '../dto';

type OrderRow = Order & {
  items: (OrderItem & { modifiers: OrderItemModifier[] })[];
  events: OrderEvent[];
};

export class OrderMapper {
  static modifierToEntity(row: OrderItemModifier): OrderItemModifierEntity {
    const e = new OrderItemModifierEntity();
    Object.assign(e, { ...row, priceDelta: row.priceDelta.toString() });
    return e;
  }

  static itemToEntity(row: OrderItem & { modifiers: OrderItemModifier[] }): OrderItemEntity {
    const e = new OrderItemEntity();
    Object.assign(e, {
      ...row,
      unitPrice: row.unitPrice.toString(),
      taxRate: row.taxRate.toString(),
      lineTotal: row.lineTotal.toString(),
      modifiers: row.modifiers.map(OrderMapper.modifierToEntity),
    });
    return e;
  }

  static eventToEntity(row: OrderEvent): OrderEventEntity {
    const e = new OrderEventEntity();
    Object.assign(e, {
      ...row,
      type: row.type as OrderEventType,
      fromStatus: (row.fromStatus as OrderState | null) ?? null,
      toStatus: (row.toStatus as OrderState | null) ?? null,
      metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    });
    return e;
  }

  static toEntity(row: OrderRow): OrderEntity {
    const e = new OrderEntity();
    Object.assign(e, {
      ...row,
      status: row.status as OrderState,
      fulfillment: row.fulfillment as FulfillmentType,
      subtotal: row.subtotal.toString(),
      itemDiscount: row.itemDiscount.toString(),
      offerDiscount: row.offerDiscount.toString(),
      couponDiscount: row.couponDiscount.toString(),
      taxes: row.taxes.toString(),
      packingFee: row.packingFee.toString(),
      deliveryFee: row.deliveryFee.toString(),
      serviceCharge: row.serviceCharge.toString(),
      roundOff: row.roundOff.toString(),
      grandTotal: row.grandTotal.toString(),
      pricingSnapshot: (row.pricingSnapshot as Record<string, unknown>) ?? {},
      taxSnapshot: (row.taxSnapshot as Record<string, unknown> | null) ?? null,
      items: row.items.map(OrderMapper.itemToEntity),
      events: row.events.map(OrderMapper.eventToEntity),
    });
    return e;
  }

  static modifierToResponse(m: OrderItemModifierEntity): OrderItemModifierResponseDto {
    return {
      groupId: m.groupId,
      groupName: m.groupName,
      optionId: m.optionId,
      optionName: m.optionName,
      priceDelta: m.priceDelta,
    };
  }

  static itemToResponse(i: OrderItemEntity): OrderItemResponseDto {
    return {
      id: i.id,
      productId: i.productId,
      name: i.name,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      taxRate: i.taxRate,
      lineTotal: i.lineTotal,
      notes: i.notes ?? null,
      modifiers: i.modifiers.map(OrderMapper.modifierToResponse),
    };
  }

  static eventToResponse(e: OrderEventEntity): OrderEventResponseDto {
    return {
      id: e.id,
      type: e.type,
      fromStatus: e.fromStatus ?? null,
      toStatus: e.toStatus ?? null,
      message: e.message ?? null,
      createdAt: e.createdAt,
    };
  }

  static toResponse(o: OrderEntity): OrderResponseDto {
    return {
      id: o.id,
      clientOrderId: o.clientOrderId,
      petpoojaOrderId: o.petpoojaOrderId ?? null,
      userId: o.userId,
      storeId: o.storeId,
      addressId: o.addressId ?? null,
      fulfillment: o.fulfillment,
      status: o.status,
      tableNumber: o.tableNumber ?? null,
      currency: o.currency,
      subtotal: o.subtotal,
      itemDiscount: o.itemDiscount,
      offerDiscount: o.offerDiscount,
      couponDiscount: o.couponDiscount,
      couponCode: o.couponCode ?? null,
      taxes: o.taxes,
      packingFee: o.packingFee,
      deliveryFee: o.deliveryFee,
      serviceCharge: o.serviceCharge,
      roundOff: o.roundOff,
      grandTotal: o.grandTotal,
      customerNotes: o.customerNotes ?? null,
      paymentReference: o.paymentReference ?? null,
      prepEtaMinutes: o.prepEtaMinutes ?? null,
      placedAt: o.placedAt,
      acceptedAt: o.acceptedAt ?? null,
      readyAt: o.readyAt ?? null,
      dispatchedAt: o.dispatchedAt ?? null,
      deliveredAt: o.deliveredAt ?? null,
      cancelledAt: o.cancelledAt ?? null,
      cancellationReason: o.cancellationReason ?? null,
      items: o.items.map(OrderMapper.itemToResponse),
      events: o.events.map(OrderMapper.eventToResponse),
    };
  }

  static toTimeline(o: OrderEntity, etaAt: Date | null): OrderTimelineResponseDto {
    return {
      orderId: o.id,
      currentStatus: o.status,
      estimatedCompletionAt: etaAt,
      events: o.events.map(OrderMapper.eventToResponse),
    };
  }
}
