import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { DEAD_LETTER_SUFFIX, QUEUE_NAMES } from '@infra/queue/queue.constants';
import { NotificationDispatcherService } from '../services/dispatcher.service';

export interface NotificationSendJob {
  notificationId: string;
  correlationId?: string;
}

@Injectable()
@Processor(QUEUE_NAMES.NOTIFICATIONS_SEND)
export class NotificationSendConsumer extends WorkerHost {
  private readonly logger = new Logger(NotificationSendConsumer.name);

  constructor(
    private readonly dispatcher: NotificationDispatcherService,
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS_SEND + DEAD_LETTER_SUFFIX) private readonly dlq: Queue,
  ) {
    super();
  }

  async process(job: Job<NotificationSendJob>): Promise<void> {
    const { notificationId, correlationId } = job.data;
    try {
      await this.dispatcher.dispatch(notificationId, correlationId);
    } catch (err) {
      const opts = job.opts;
      const isFinal = typeof opts.attempts === 'number' && job.attemptsMade + 1 >= opts.attempts;
      if (isFinal) {
        await this.dlq
          .add('dead-letter', { ...job.data, error: (err as Error).message })
          .catch(() => undefined);
      }
      throw err;
    }
  }
}
