import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { QUEUE_NAMES } from '@infra/queue/queue.constants';
import { FirebaseService } from '@modules/firebase';
import { NotificationsService } from '../services/notifications.service';
import { DevicesService } from '../services/devices.service';
import type { BroadcastPayload } from '../validators/notification.validators';

export interface BroadcastJob {
  payload: BroadcastPayload;
  correlationId?: string;
}

/**
 * Broadcast fan-out worker.
 *
 * • `topics` → FCM topic sends (constant cost, unlimited receivers).
 * • `userIds` → one Notification row per user + push fan-out.
 */
@Injectable()
@Processor(QUEUE_NAMES.NOTIFICATIONS_BROADCAST)
export class NotificationBroadcastConsumer extends WorkerHost {
  private readonly logger = new Logger(NotificationBroadcastConsumer.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly notifications: NotificationsService,
    private readonly devices: DevicesService,
  ) {
    super();
  }

  async process(job: Job<BroadcastJob>): Promise<void> {
    const { payload, correlationId } = job.data;
    if (payload.topics?.length && this.firebase.available) {
      for (const topic of payload.topics) {
        await this.firebase
          .sendToTopic(topic, {
            title: payload.title,
            body: payload.body,
            imageUrl: payload.imageUrl,
            data: { type: payload.type },
          })
          .catch((err) =>
            this.logger.warn(`Topic ${topic} broadcast failed: ${(err as Error).message}`),
          );
      }
    }
    if (payload.userIds?.length) {
      for (const userId of payload.userIds) {
        await this.notifications
          .create(
            {
              userId,
              type: payload.type,
              title: payload.title,
              body: payload.body,
              deeplink: payload.deeplink,
              imageUrl: payload.imageUrl,
              category: (payload.category as never) ?? undefined,
            },
            correlationId,
          )
          .catch((err) =>
            this.logger.warn(`User ${userId} broadcast failed: ${(err as Error).message}`),
          );
      }
      // proactive token warmup so first send is cache-friendly
      await this.devices.activeTokensForUsers(payload.userIds).catch(() => undefined);
    }
  }
}
