import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ORDER_EVENTS, type OrderLifecycleEvent } from '@modules/orders/events/order.events';
import { PetpoojaAdapter } from './petpooja-adapter.service';

/**
 * Bridges the Commerce Domain to PETPOOJA. Reacts to
 * `order.payment_linked` (emitted by OrdersService.linkPaymentReference
 * after payment verification) and enqueues the Save Order job.
 *
 * This is the ONLY wiring that couples orders → petpooja; no other
 * module directly enqueues to the PETPOOJA queues.
 */
@Injectable()
export class OrderOutboundBridge {
  private readonly logger = new Logger(OrderOutboundBridge.name);

  constructor(private readonly adapter: PetpoojaAdapter) {}

  @OnEvent(ORDER_EVENTS.PAYMENT_LINKED)
  async onPaymentLinked(evt: {
    orderId: string;
    paymentReference: string;
    correlationId?: string;
  }): Promise<void> {
    this.logger.log(`payment_linked → enqueue save_order (order=${evt.orderId})`);
    await this.adapter.enqueueSaveOrder(evt.orderId, evt.correlationId);
  }

  /**
   * When an order is cancelled by the user AFTER it has been sent to
   * PETPOOJA, push the cancellation to the PoS. Cancellations before
   * PETPOOJA linkage are local-only and don't need to be pushed.
   */
  @OnEvent(ORDER_EVENTS.CANCELLED)
  async onOrderCancelled(evt: OrderLifecycleEvent & { reason?: string }): Promise<void> {
    this.logger.log(`order cancelled → enqueue cancel to PETPOOJA (order=${evt.orderId})`);
    await this.adapter.enqueueCancelOrder(
      evt.orderId,
      evt.reason ?? 'user_cancelled',
      evt.correlationId,
    );
  }
}
