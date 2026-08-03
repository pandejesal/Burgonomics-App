import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { QUEUE_NAMES } from '@infra/queue/queue.constants';
import { DomainEventBus } from '@infra/events/domain-event-bus';
import { MetricsService } from '@infra/observability/metrics/metrics.service';
import { FirebaseService } from '@modules/firebase';
import {
  NOTIFICATION_REPOSITORY,
  type INotificationRepository,
} from '../repositories/interfaces/notification-repository.interface';
import {
  DELIVERY_REPOSITORY,
  type IDeliveryRepository,
} from '../repositories/interfaces/delivery-repository.interface';
import { DevicesService } from './devices.service';
import { PreferencesService } from './preferences.service';
import { RealtimeBroadcaster } from '@modules/realtime/services/realtime-broadcaster.service';
import { NOTIFICATION_EVENTS } from '../events/notification.events';
import { NotificationSpecs } from '../specifications/notification.specifications';

/**
 * Multi-channel delivery orchestrator. Called by the notifications
 * queue consumer; fans out to Push (FCM), SSE, and IN_APP records.
 * Each channel's success/failure is written to `notification_deliveries`.
 */
@Injectable()
export class NotificationDispatcherService {
  private readonly logger = new Logger(NotificationDispatcherService.name);

  constructor(
    @Inject(NOTIFICATION_REPOSITORY) private readonly notifRepo: INotificationRepository,
    @Inject(DELIVERY_REPOSITORY) private readonly deliveryRepo: IDeliveryRepository,
    private readonly devices: DevicesService,
    private readonly prefs: PreferencesService,
    private readonly firebase: FirebaseService,
    private readonly realtime: RealtimeBroadcaster,
    private readonly bus: DomainEventBus,
    private readonly metrics: MetricsService,
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS_PUSH) private readonly pushQueue: Queue,
  ) {}

  async dispatch(notificationId: string, correlationId?: string): Promise<void> {
    const notification = await this.notifRepo.findById(notificationId);
    if (!notification) {
      this.logger.warn(`dispatch: notification ${notificationId} missing`);
      return;
    }
    if (!NotificationSpecs.isDeliverable(notification)) {
      this.logger.log(
        `dispatch: ${notificationId} not deliverable (status=${notification.status})`,
      );
      return;
    }

    await this.notifRepo.patch(notificationId, { status: 'SENDING' });

    const channels = this.desiredChannels(notification.category);
    const results = await Promise.allSettled(
      channels.map((ch) => this.dispatchChannel(ch, notification, correlationId)),
    );

    const anySuccess = results.some((r) => r.status === 'fulfilled' && r.value === true);
    await this.notifRepo.patch(notificationId, { status: anySuccess ? 'SENT' : 'FAILED' });

    if (anySuccess) {
      this.bus.publish(NOTIFICATION_EVENTS.SENT, {
        notificationId,
        userId: notification.userId,
        type: notification.type,
        category: notification.category,
        channel: notification.channel,
        correlationId,
      });
    } else {
      this.bus.publish(NOTIFICATION_EVENTS.FAILED, {
        notificationId,
        userId: notification.userId,
        type: notification.type,
        category: notification.category,
        channel: notification.channel,
        error: 'all-channels-failed',
        attempt: 1,
        correlationId,
      });
    }
  }

  private desiredChannels(category: string): Array<'PUSH' | 'SSE' | 'IN_APP'> {
    const base: Array<'PUSH' | 'SSE' | 'IN_APP'> = ['PUSH', 'SSE', 'IN_APP'];
    // category-specific filtering delegated to preferences check in dispatchChannel
    void category;
    return base;
  }

  private async dispatchChannel(
    channel: 'PUSH' | 'SSE' | 'IN_APP',
    notification: Awaited<ReturnType<INotificationRepository['findById']>> & object,
    correlationId?: string,
  ): Promise<boolean> {
    const enabled = await this.prefs.isChannelEnabled(
      notification.userId,
      notification.category,
      channel,
    );
    if (!enabled) return false;

    const started = process.hrtime.bigint();
    try {
      if (channel === 'IN_APP') {
        await this.deliveryRepo.record({
          notificationId: notification.id,
          channel,
          status: 'SUCCESS',
          attempt: 1,
          ackAt: new Date(),
          latencyMs: Number(process.hrtime.bigint() - started) / 1e6,
        });
        return true;
      }

      if (channel === 'SSE') {
        const delivered = await this.realtime.emitNotification(notification.userId, {
          id: notification.id,
          type: notification.type,
          category: notification.category,
          title: notification.title,
          body: notification.body,
          data: notification.data,
          deeplink: notification.deeplink,
          imageUrl: notification.imageUrl,
          createdAt: notification.createdAt.toISOString(),
        });
        await this.deliveryRepo.record({
          notificationId: notification.id,
          channel,
          status: delivered > 0 ? 'SUCCESS' : 'FAILED',
          attempt: 1,
          providerMessage: `sse-fanout=${delivered}`,
          ackAt: new Date(),
          latencyMs: Number(process.hrtime.bigint() - started) / 1e6,
        });
        return delivered > 0;
      }

      // PUSH — enqueue for isolated retryable worker
      await this.pushQueue.add(
        'push',
        { notificationId: notification.id, correlationId },
        {
          jobId: `push:${notification.id}`,
          attempts: 6,
          backoff: { type: 'exponential', delay: 3_000 },
          removeOnComplete: { age: 3_600, count: 500 },
          removeOnFail: { age: 7 * 24 * 3_600 },
        },
      );
      return true;
    } catch (err) {
      this.logger.error(
        `Channel ${channel} failed for notification ${notification.id}: ${(err as Error).message}`,
      );
      await this.deliveryRepo
        .record({
          notificationId: notification.id,
          channel,
          status: 'FAILED',
          attempt: 1,
          providerMessage: (err as Error).message,
          latencyMs: Number(process.hrtime.bigint() - started) / 1e6,
        })
        .catch(() => undefined);
      return false;
    }
  }

  async pushForNotification(notificationId: string): Promise<void> {
    const notification = await this.notifRepo.findById(notificationId);
    if (!notification || !NotificationSpecs.isDeliverable(notification)) return;
    if (!this.firebase.available) {
      this.logger.warn(`FCM unavailable — skipping push for ${notificationId}`);
      return;
    }
    const devices = await this.devices.activeTokensForUsers([notification.userId]);
    if (!devices.length) return;

    const started = process.hrtime.bigint();
    const res = await this.firebase.sendToDevices({
      tokens: devices.map((d) => d.token),
      title: notification.title,
      body: notification.body,
      imageUrl: notification.imageUrl ?? undefined,
      data: this.stringifyData({
        notificationId,
        type: notification.type,
        deeplink: notification.deeplink,
        ...(notification.data as Record<string, unknown> | null),
      }),
      priority:
        notification.priority === 'HIGH' || notification.priority === 'CRITICAL'
          ? 'high'
          : 'normal',
    });

    const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
    for (const r of res.responses) {
      await this.deliveryRepo
        .record({
          notificationId,
          channel: 'PUSH',
          status: r.success ? 'SUCCESS' : 'FAILED',
          attempt: 1,
          providerRef: r.success ? r.token.slice(0, 12) : null,
          providerCode: r.error ?? null,
          latencyMs: elapsed,
          ackAt: r.success ? new Date() : null,
        })
        .catch(() => undefined);
    }

    if (res.invalidTokens.length) await this.devices.disableInvalidTokens(res.invalidTokens);

    this.metrics.notificationEvents.inc({
      event: res.failureCount === 0 ? 'fcm-success' : 'fcm-partial',
      type: notification.type,
      channel: 'PUSH',
    });
    this.metrics.notificationLatency.observe(
      { channel: 'PUSH', type: notification.type },
      elapsed / 1000,
    );

    if (res.successCount > 0) {
      this.bus.publish(NOTIFICATION_EVENTS.FCM_SENT, { notificationId, count: res.successCount });
      await this.notifRepo.patch(notificationId, { status: 'DELIVERED' });
    } else {
      this.bus.publish(NOTIFICATION_EVENTS.FCM_FAILED, { notificationId });
      throw new Error(`FCM delivery failed for notification ${notificationId}`);
    }
  }

  private stringifyData(data: Record<string, unknown>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined || v === null) continue;
      out[k] = typeof v === 'string' ? v : JSON.stringify(v);
    }
    return out;
  }
}
