import { Injectable } from '@nestjs/common';
import { ConnectionRegistry } from './connection-registry.service';
import { REALTIME_STREAMS, type RealtimeStream } from '@modules/notifications/constants';

/**
 * Domain-facing SSE broadcaster. The Notifications domain and Order
 * subscribers publish through this facade; the low-level pub/sub and
 * socket fan-out remain hidden in `ConnectionRegistry`.
 */
@Injectable()
export class RealtimeBroadcaster {
  constructor(private readonly registry: ConnectionRegistry) {}

  emit(stream: RealtimeStream, userId: string, event: string, data: unknown): Promise<number> {
    return this.registry.publish(stream, userId, event, data);
  }

  emitNotification(userId: string, payload: unknown): Promise<number> {
    return this.registry.publish(REALTIME_STREAMS.NOTIFICATIONS, userId, 'notification', payload);
  }

  emitOrderTracking(userId: string, orderId: string, payload: unknown): Promise<number> {
    return this.registry.publish(REALTIME_STREAMS.ORDER_TRACKING, userId, 'order.status', {
      orderId,
      ...(payload as object),
    });
  }
}
