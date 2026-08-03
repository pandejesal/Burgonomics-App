import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Job } from 'bullmq';
import { QUEUE_NAMES } from '@infra/queue/queue.constants';
import { NotificationsService } from '../services/notifications.service';

@Injectable()
@Processor(QUEUE_NAMES.NOTIFICATIONS_CLEANUP)
export class NotificationCleanupConsumer extends WorkerHost {
  private readonly logger = new Logger(NotificationCleanupConsumer.name);

  constructor(private readonly notifications: NotificationsService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    const n = await this.notifications.purgeExpired();
    if (n) this.logger.log(`Expired ${n} notifications`);
  }

  @Cron(CronExpression.EVERY_HOUR)
  async schedule(): Promise<void> {
    await this.process({} as Job);
  }
}
