import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { DEAD_LETTER_SUFFIX, QUEUE_NAMES } from '@infra/queue/queue.constants';
import { NotificationDispatcherService } from '../services/dispatcher.service';

export interface NotificationPushJob {
  notificationId: string;
  correlationId?: string;
}

@Injectable()
@Processor(QUEUE_NAMES.NOTIFICATIONS_PUSH)
export class NotificationPushConsumer extends WorkerHost {
  private readonly logger = new Logger(NotificationPushConsumer.name);

  constructor(
    private readonly dispatcher: NotificationDispatcherService,
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS_PUSH + DEAD_LETTER_SUFFIX) private readonly dlq: Queue,
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS_RETRY) private readonly retryQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<NotificationPushJob>): Promise<void> {
    const { notificationId, correlationId } = job.data;
    try {
      await this.dispatcher.pushForNotification(notificationId);
    } catch (err) {
      const opts = job.opts;
      const isFinal = typeof opts.attempts === 'number' && job.attemptsMade + 1 >= opts.attempts;
      if (isFinal) {
        await this.dlq
          .add('dead-letter', { ...job.data, error: (err as Error).message })
          .catch(() => undefined);
      } else {
        await this.retryQueue
          .add(
            'push-retry',
            { notificationId, correlationId, previousError: (err as Error).message },
            {
              delay: Math.min(60_000 * 2 ** job.attemptsMade, 15 * 60_000),
              attempts: 1,
              removeOnComplete: true,
            },
          )
          .catch(() => undefined);
      }
      throw err;
    }
  }
}
