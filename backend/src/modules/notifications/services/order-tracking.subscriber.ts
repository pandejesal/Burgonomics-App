import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { OrderState } from '@modules/orders/state-machine/order-state';
import {
  ORDER_EVENTS,
  type OrderLifecycleEvent,
  type OrderStateChangedEvent,
} from '@modules/orders/events/order.events';
import { PAYMENT_EVENTS } from '@modules/payments/events/payment.events';
import {
  ORDER_REPOSITORY,
  type IOrderRepository,
} from '@modules/orders/repositories/interfaces/order-repository.interface';
import { NotificationsService } from './notifications.service';
import { TemplatesService } from './templates.service';
import { RealtimeBroadcaster } from '@modules/realtime/services/realtime-broadcaster.service';
import { REALTIME_STREAMS, NOTIFICATION_TYPES, type NotificationType } from '../constants';
import { NOTIFICATION_EVENTS, type OrderTrackingUpdatedEvent } from '../events/notification.events';
import { DomainEventBus } from '@infra/events/domain-event-bus';

const STATE_TO_TYPE: Partial<Record<OrderState, NotificationType>> = {
  ORDER_CREATED: NOTIFICATION_TYPES.ORDER_CONFIRMATION,
  ORDER_SENT_TO_PETPOOJA: NOTIFICATION_TYPES.ORDER_CONFIRMATION,
  ORDER_ACCEPTED: NOTIFICATION_TYPES.ORDER_ACCEPTED,
  PREPARING: NOTIFICATION_TYPES.ORDER_PREPARING,
  READY: NOTIFICATION_TYPES.ORDER_READY,
  OUT_FOR_DELIVERY: NOTIFICATION_TYPES.ORDER_OUT_FOR_DELIVERY,
  DELIVERED: NOTIFICATION_TYPES.ORDER_DELIVERED,
  COMPLETED: NOTIFICATION_TYPES.ORDER_DELIVERED,
  CANCELLED: NOTIFICATION_TYPES.ORDER_CANCELLED,
  FAILED: NOTIFICATION_TYPES.ORDER_FAILED,
  PAYMENT_VERIFIED: NOTIFICATION_TYPES.PAYMENT_SUCCESS,
};

/**
 * Bridges domain events (`order.*`, `payment.*`, `refund.*`) into the
 * notification platform and the realtime SSE bus. This is the ONLY
 * place order/payment state translates into customer-facing comms.
 */
@Injectable()
export class OrderTrackingSubscriber {
  private readonly logger = new Logger(OrderTrackingSubscriber.name);

  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: IOrderRepository,
    private readonly notifications: NotificationsService,
    private readonly templates: TemplatesService,
    private readonly realtime: RealtimeBroadcaster,
    private readonly bus: DomainEventBus,
  ) {}

  @OnEvent(ORDER_EVENTS.CREATED, { async: true })
  async onOrderCreated(evt: OrderLifecycleEvent): Promise<void> {
    await this.publish(
      evt.orderId,
      evt.userId,
      NOTIFICATION_TYPES.ORDER_CONFIRMATION,
      {
        orderNo: evt.clientOrderId,
      },
      evt.correlationId,
    );
  }

  @OnEvent(ORDER_EVENTS.STATE_CHANGED, { async: true })
  async onStateChanged(evt: OrderStateChangedEvent): Promise<void> {
    const type = STATE_TO_TYPE[evt.toStatus];
    if (!type) return;
    const order = await this.orders.findById(evt.orderId);
    if (!order) return;

    await this.publish(
      evt.orderId,
      evt.userId,
      type,
      {
        orderNo: order.clientOrderId,
        status: evt.toStatus,
        reason: evt.reason,
      },
      evt.correlationId,
    );

    // Publish realtime order-tracking stream update
    const trackingEvt: OrderTrackingUpdatedEvent = {
      orderId: evt.orderId,
      userId: evt.userId,
      status: evt.toStatus,
      message: evt.reason,
      correlationId: evt.correlationId,
    };
    await this.realtime.emit(
      REALTIME_STREAMS.ORDER_TRACKING,
      evt.userId,
      'order.status',
      trackingEvt,
    );
    this.bus.publish(NOTIFICATION_EVENTS.ORDER_TRACKING_UPDATED, trackingEvt);
  }

  @OnEvent(PAYMENT_EVENTS.VERIFIED, { async: true })
  async onPaymentSuccess(evt: {
    orderId?: string;
    userId?: string;
    amount?: string | number;
    correlationId?: string;
  }): Promise<void> {
    if (!evt.orderId || !evt.userId) return;
    const order = await this.orders.findById(evt.orderId);
    await this.publish(
      evt.orderId,
      evt.userId,
      NOTIFICATION_TYPES.PAYMENT_SUCCESS,
      {
        orderNo: order?.clientOrderId ?? evt.orderId,
        amount: evt.amount ?? order?.grandTotal ?? '',
      },
      evt.correlationId,
    );
  }

  @OnEvent(PAYMENT_EVENTS.FAILED, { async: true })
  async onPaymentFailure(evt: {
    orderId?: string;
    userId?: string;
    correlationId?: string;
  }): Promise<void> {
    if (!evt.orderId || !evt.userId) return;
    const order = await this.orders.findById(evt.orderId);
    await this.publish(
      evt.orderId,
      evt.userId,
      NOTIFICATION_TYPES.PAYMENT_FAILURE,
      {
        orderNo: order?.clientOrderId ?? evt.orderId,
      },
      evt.correlationId,
    );
  }

  @OnEvent(PAYMENT_EVENTS.REFUND_CREATED, { async: true })
  async onRefundCreated(evt: {
    orderId?: string;
    userId?: string;
    amount?: string;
    correlationId?: string;
  }): Promise<void> {
    if (!evt.orderId || !evt.userId) return;
    const order = await this.orders.findById(evt.orderId);
    await this.publish(
      evt.orderId,
      evt.userId,
      NOTIFICATION_TYPES.REFUND_INITIATED,
      {
        orderNo: order?.clientOrderId ?? evt.orderId,
        amount: evt.amount ?? '',
      },
      evt.correlationId,
    );
  }

  @OnEvent(PAYMENT_EVENTS.REFUND_COMPLETED, { async: true })
  async onRefundProcessed(evt: {
    orderId?: string;
    userId?: string;
    amount?: string;
    correlationId?: string;
  }): Promise<void> {
    if (!evt.orderId || !evt.userId) return;
    const order = await this.orders.findById(evt.orderId);
    await this.publish(
      evt.orderId,
      evt.userId,
      NOTIFICATION_TYPES.REFUND_COMPLETED,
      {
        orderNo: order?.clientOrderId ?? evt.orderId,
        amount: evt.amount ?? '',
      },
      evt.correlationId,
    );
  }

  private async publish(
    orderId: string,
    userId: string,
    type: NotificationType,
    params: Record<string, unknown>,
    correlationId?: string,
  ): Promise<void> {
    const templateCode = this.templateCodeFor(type);
    const rendered = await this.templates.render(templateCode, params);
    if (!rendered) {
      this.logger.warn(`No template for ${templateCode}`);
      return;
    }
    await this.notifications.create(
      {
        userId,
        type,
        title: rendered.title,
        body: rendered.body,
        templateCode: rendered.code,
        templateVersion: rendered.version,
        refType: 'order',
        refId: orderId,
        deeplink: `/orders/${orderId}/track`,
        data: { orderId, ...params },
        correlationId,
      },
      correlationId,
    );
  }

  private templateCodeFor(type: NotificationType): string {
    switch (type) {
      case NOTIFICATION_TYPES.ORDER_CONFIRMATION:
        return 'ORDER_CONFIRMATION_PUSH';
      case NOTIFICATION_TYPES.ORDER_ACCEPTED:
        return 'ORDER_ACCEPTED_PUSH';
      case NOTIFICATION_TYPES.ORDER_PREPARING:
        return 'ORDER_PREPARING_PUSH';
      case NOTIFICATION_TYPES.ORDER_READY:
        return 'ORDER_READY_PUSH';
      case NOTIFICATION_TYPES.ORDER_OUT_FOR_DELIVERY:
        return 'ORDER_OFD_PUSH';
      case NOTIFICATION_TYPES.ORDER_DELIVERED:
        return 'ORDER_DELIVERED_PUSH';
      case NOTIFICATION_TYPES.ORDER_CANCELLED:
        return 'ORDER_CANCELLED_PUSH';
      case NOTIFICATION_TYPES.ORDER_FAILED:
        return 'ORDER_FAILED_PUSH';
      case NOTIFICATION_TYPES.PAYMENT_SUCCESS:
        return 'PAYMENT_SUCCESS_PUSH';
      case NOTIFICATION_TYPES.PAYMENT_FAILURE:
        return 'PAYMENT_FAILURE_PUSH';
      case NOTIFICATION_TYPES.REFUND_INITIATED:
        return 'REFUND_INITIATED_PUSH';
      case NOTIFICATION_TYPES.REFUND_COMPLETED:
        return 'REFUND_COMPLETED_PUSH';
      case NOTIFICATION_TYPES.STORE_CLOSED:
        return 'STORE_CLOSED_PUSH';
      case NOTIFICATION_TYPES.OFFER:
        return 'OFFER_PUSH';
      default:
        return 'SYSTEM_PUSH';
    }
  }
}
