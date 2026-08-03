import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { QUEUE_NAMES } from '@infra/queue/queue.constants';

export interface NotificationRetryJob {
  notificationId: string;
  correlationId?: string;
  previousError?: string;
}

/**
 * Delayed retry lane. `NotificationPushConsumer` enqueues here after
 * a transient failure with exponential-backoff delay; this consumer
 * simply re-enqueues into the main push queue when the delay elapses.
 */
@Injectable()
@Processor(QUEUE_NAMES.NOTIFICATIONS_RETRY)
export class NotificationRetryConsumer extends WorkerHost {
  private readonly logger = new Logger(NotificationRetryConsumer.name);

  constructor(@InjectQueue(QUEUE_NAMES.NOTIFICATIONS_PUSH) private readonly pushQueue: Queue) {
    super();
  }

  async process(job: Job<NotificationRetryJob>): Promise<void> {
    const { notificationId, correlationId } = job.data;
    this.logger.log(`retrying push for ${notificationId}`);
    await this.pushQueue.add(
      'push',
      { notificationId, correlationId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
      },
    );
  }
}
