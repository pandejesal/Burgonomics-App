import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { QUEUE_NAMES, DEAD_LETTER_SUFFIX } from '@infra/queue/queue.constants';
import { PaymentWebhookProcessorService } from '../services/webhook-processor.service';

export interface PaymentWebhookJob {
  webhookEventId: string;
  eventType: string;
  correlationId?: string;
}

@Injectable()
@Processor(QUEUE_NAMES.PAYMENTS_WEBHOOK_PROCESS)
export class PaymentWebhookConsumer extends WorkerHost {
  private readonly logger = new Logger(PaymentWebhookConsumer.name);

  constructor(
    private readonly processor: PaymentWebhookProcessorService,
    @InjectQueue(QUEUE_NAMES.PAYMENTS_WEBHOOK_PROCESS + DEAD_LETTER_SUFFIX)
    private readonly dlq: Queue,
  ) {
    super();
  }

  async process(job: Job<PaymentWebhookJob>): Promise<void> {
    const { webhookEventId, eventType, correlationId } = job.data;
    this.logger.log(
      `[${correlationId}] processing payment webhook id=${webhookEventId} event=${eventType} attempt=${job.attemptsMade + 1}`,
    );
    try {
      await this.processor.process(webhookEventId, correlationId);
    } catch (err) {
      const opts = job.opts;
      const isFinal = typeof opts.attempts === 'number' && job.attemptsMade + 1 >= opts.attempts;
      if (isFinal) {
        await this.processor.deadLetter(webhookEventId, (err as Error).message);
        await this.dlq
          .add('dead-letter', { ...job.data, error: (err as Error).message })
          .catch(() => undefined);
      }
      throw err;
    }
  }
}
