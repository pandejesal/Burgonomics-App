import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError, NotFoundError, ValidationError } from '@common/errors';
import { DomainEventBus } from '@infra/events/domain-event-bus';
import { OrderStateMachine } from '../state-machine/order-state-machine';
import type { OrderState } from '../state-machine/order-state';
import type { OrderEntity } from '../entities/order.entity';
import {
  ORDER_REPOSITORY,
  type CreateOrderInput,
  type IOrderRepository,
} from '../repositories/interfaces/order-repository.interface';
import {
  ORDER_EVENTS,
  type OrderLifecycleEvent,
  type OrderStateChangedEvent,
} from '../events/order.events';
import type { ListOrdersQueryDto } from '../dto';

@Injectable()
export class OrdersService {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly repo: IOrderRepository,
    private readonly bus: DomainEventBus,
  ) {}

  async createOrder(input: CreateOrderInput, correlationId?: string): Promise<OrderEntity> {
    const existing = await this.repo.findByClientOrderId(input.clientOrderId);
    if (existing) return existing; // idempotency
    const order = await this.repo.create(input);
    this.bus.publish<OrderLifecycleEvent>(ORDER_EVENTS.CREATED, {
      orderId: order.id,
      clientOrderId: order.clientOrderId,
      userId: order.userId,
      storeId: order.storeId,
      status: order.status,
      correlationId,
    });
    return order;
  }

  async getForUser(id: string, userId: string): Promise<OrderEntity> {
    const o = await this.repo.findById(id);
    if (!o) throw new NotFoundError('Order not found');
    if (o.userId !== userId) throw new ForbiddenError('Not your order');
    return o;
  }

  findById(id: string): Promise<OrderEntity | null> {
    return this.repo.findById(id);
  }

  list(userId: string, q: ListOrdersQueryDto) {
    return this.repo.list(userId, q);
  }

  async transition(
    orderId: string,
    to: OrderState,
    opts: {
      actorId?: string;
      reason?: string;
      correlationId?: string;
      patch?: Parameters<IOrderRepository['updateStatus']>[2];
    } = {},
  ): Promise<OrderEntity> {
    const current = await this.repo.findById(orderId);
    if (!current) throw new NotFoundError('Order not found');
    OrderStateMachine.assertTransition(current.status, to);

    const updated = await this.repo.updateStatus(orderId, to, opts.patch);
    await this.repo.appendEvent({
      orderId,
      type: 'STATE_CHANGED',
      fromStatus: current.status,
      toStatus: to,
      message: opts.reason ?? null,
      actorId: opts.actorId ?? null,
      correlationId: opts.correlationId ?? null,
    });

    this.bus.publish<OrderStateChangedEvent>(ORDER_EVENTS.STATE_CHANGED, {
      orderId,
      clientOrderId: updated.clientOrderId,
      userId: updated.userId,
      storeId: updated.storeId,
      status: updated.status,
      fromStatus: current.status,
      toStatus: to,
      reason: opts.reason,
      correlationId: opts.correlationId,
    });

    if (to === 'CANCELLED') this.bus.publish(ORDER_EVENTS.CANCELLED, { orderId });
    if (to === 'COMPLETED') this.bus.publish(ORDER_EVENTS.COMPLETED, { orderId });
    if (to === 'REFUNDED') this.bus.publish(ORDER_EVENTS.REFUNDED, { orderId });

    return updated;
  }

  async cancel(orderId: string, userId: string, reason?: string): Promise<OrderEntity> {
    const order = await this.getForUser(orderId, userId);
    if (
      ![
        'CHECKOUT',
        'PAYMENT_PENDING',
        'ORDER_CREATED',
        'ORDER_SENT_TO_PETPOOJA',
        'ORDER_ACCEPTED',
      ].includes(order.status)
    ) {
      throw new ValidationError('Order can no longer be cancelled');
    }
    return this.transition(orderId, 'CANCELLED', {
      actorId: userId,
      reason,
      patch: { cancelledAt: new Date(), cancellationReason: reason ?? 'user_cancelled' },
    });
  }

  async linkPetpoojaOrderId(
    orderId: string,
    petpoojaOrderId: string,
    correlationId?: string,
  ): Promise<OrderEntity> {
    const updated = await this.repo.updateStatus(orderId, 'ORDER_SENT_TO_PETPOOJA', {
      petpoojaOrderId,
    });
    await this.repo.appendEvent({
      orderId,
      type: 'PETPOOJA_LINKED',
      toStatus: 'ORDER_SENT_TO_PETPOOJA',
      message: `Linked PETPOOJA order ${petpoojaOrderId}`,
      correlationId: correlationId ?? null,
    });
    this.bus.publish(ORDER_EVENTS.PETPOOJA_LINKED, { orderId, petpoojaOrderId });
    return updated;
  }

  async linkPaymentReference(orderId: string, paymentReference: string): Promise<OrderEntity> {
    const order = await this.repo.updateStatus(orderId, 'PAYMENT_VERIFIED', { paymentReference });
    await this.repo.appendEvent({
      orderId,
      type: 'PAYMENT_LINKED',
      toStatus: 'PAYMENT_VERIFIED',
      message: `Payment linked ${paymentReference}`,
    });
    this.bus.publish(ORDER_EVENTS.PAYMENT_LINKED, { orderId, paymentReference });
    return order;
  }
}
