import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';
import { NotFoundError } from '@common/errors';
import { OrderMapper } from '../../mappers/order.mapper';
import { OrderSpecifications } from '../../specifications/order.specifications';
import type { OrderEntity } from '../../entities/order.entity';
import type { OrderState } from '../../state-machine/order-state';
import type { ListOrdersQueryDto } from '../../dto';
import type {
  AppendEventInput,
  CreateOrderInput,
  IOrderRepository,
} from '../interfaces/order-repository.interface';

const INCLUDE = {
  items: { orderBy: { id: 'asc' as const }, include: { modifiers: true } },
  events: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.OrderInclude;

@Injectable()
export class OrderPrismaRepository implements IOrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateOrderInput): Promise<OrderEntity> {
    const row = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          clientOrderId: input.clientOrderId,
          userId: input.userId,
          storeId: input.storeId,
          addressId: input.addressId ?? null,
          fulfillment: input.fulfillment,
          tableNumber: input.tableNumber ?? null,
          currency: input.currency,
          customerNotes: input.customerNotes ?? null,
          couponCode: input.couponCode ?? null,
          prepEtaMinutes: input.prepEtaMinutes ?? null,
          subtotal: new Prisma.Decimal(input.totals.subtotal),
          itemDiscount: new Prisma.Decimal(input.totals.itemDiscount),
          offerDiscount: new Prisma.Decimal(input.totals.offerDiscount),
          couponDiscount: new Prisma.Decimal(input.totals.couponDiscount),
          taxes: new Prisma.Decimal(input.totals.taxes),
          packingFee: new Prisma.Decimal(input.totals.packingFee),
          deliveryFee: new Prisma.Decimal(input.totals.deliveryFee),
          serviceCharge: new Prisma.Decimal(input.totals.serviceCharge),
          roundOff: new Prisma.Decimal(input.totals.roundOff),
          grandTotal: new Prisma.Decimal(input.totals.grandTotal),
          pricingSnapshot: input.pricingSnapshot,
          taxSnapshot: input.taxSnapshot,
          status: 'ORDER_CREATED',
        },
      });

      for (const item of input.items) {
        const oi = await tx.orderItem.create({
          data: {
            orderId: order.id,
            productId: item.productId,
            productPetpoojaId: item.productPetpoojaId,
            name: item.name,
            quantity: item.quantity,
            unitPrice: new Prisma.Decimal(item.unitPrice),
            taxRate: new Prisma.Decimal(item.taxRate),
            lineTotal: new Prisma.Decimal(item.lineTotal),
            notes: item.notes ?? null,
          },
        });
        if (item.modifiers.length) {
          await tx.orderItemModifier.createMany({
            data: item.modifiers.map((m) => ({
              orderItemId: oi.id,
              groupId: m.groupId,
              groupName: m.groupName,
              optionId: m.optionId,
              optionPetpoojaId: m.optionPetpoojaId,
              optionName: m.optionName,
              priceDelta: new Prisma.Decimal(m.priceDelta),
            })),
          });
        }
      }

      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          type: 'STATE_CHANGED',
          fromStatus: null,
          toStatus: 'ORDER_CREATED',
          message: 'Order created',
        },
      });

      return tx.order.findUnique({ where: { id: order.id }, include: INCLUDE });
    });
    if (!row) throw new NotFoundError('Order not created');
    return OrderMapper.toEntity(row);
  }

  async findById(id: string): Promise<OrderEntity | null> {
    const row = await this.prisma.order.findUnique({ where: { id }, include: INCLUDE });
    return row ? OrderMapper.toEntity(row) : null;
  }

  async findByClientOrderId(clientOrderId: string): Promise<OrderEntity | null> {
    const row = await this.prisma.order.findUnique({ where: { clientOrderId }, include: INCLUDE });
    return row ? OrderMapper.toEntity(row) : null;
  }

  async list(userId: string, q: ListOrdersQueryDto) {
    const where = OrderSpecifications.forListQuery(userId, q);
    const skip = (q.page - 1) * q.pageSize;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        orderBy: OrderSpecifications.sortOrder(q),
        include: INCLUDE,
        skip,
        take: q.pageSize,
      }),
      this.prisma.order.count({ where }),
    ]);
    return { items: rows.map(OrderMapper.toEntity), total };
  }

  async updateStatus(
    id: string,
    status: OrderState,
    patch: Partial<{
      acceptedAt: Date;
      readyAt: Date;
      dispatchedAt: Date;
      deliveredAt: Date;
      cancelledAt: Date;
      cancellationReason: string;
      petpoojaOrderId: string;
      paymentReference: string;
    }> = {},
  ): Promise<OrderEntity> {
    const row = await this.prisma.order.update({
      where: { id },
      data: { status, ...patch },
      include: INCLUDE,
    });
    return OrderMapper.toEntity(row);
  }

  async appendEvent(input: AppendEventInput): Promise<void> {
    await this.prisma.orderEvent.create({
      data: {
        orderId: input.orderId,
        type: input.type,
        fromStatus: input.fromStatus ?? null,
        toStatus: input.toStatus ?? null,
        message: input.message ?? null,
        metadata: input.metadata,
        actorId: input.actorId ?? null,
        correlationId: input.correlationId ?? null,
      },
    });
  }
}
