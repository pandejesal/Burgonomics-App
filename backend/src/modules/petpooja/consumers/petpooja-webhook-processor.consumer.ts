import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { QUEUE_NAMES } from '@infra/queue/queue.constants';
import { WebhookProcessorService } from '../services/webhook-processor.service';

export interface WebhookProcessJob {
  webhookEventId: string;
  webhookType: string;
  correlationId?: string;
}

@Processor(QUEUE_NAMES.PETPOOJA_WEBHOOK_PROCESS)
export class PetpoojaWebhookProcessorConsumer extends WorkerHost {
  private readonly logger = new Logger(PetpoojaWebhookProcessorConsumer.name);

  constructor(private readonly processor: WebhookProcessorService) {
    super();
  }

  async process(job: Job<WebhookProcessJob>): Promise<void> {
    const { webhookEventId, webhookType, correlationId } = job.data;
    this.logger.log(
      `[${correlationId}] processing webhook id=${webhookEventId} type=${webhookType} attempt=${job.attemptsMade + 1}`,
    );
    try {
      await this.processor.process(webhookEventId, correlationId);
    } catch (err) {
      const opts = job.opts;
      const isFinal = typeof opts.attempts === 'number' && job.attemptsMade + 1 >= opts.attempts;
      if (isFinal) {
        await this.processor.deadLetter(webhookEventId, (err as Error).message);
      }
      throw err;
    }
  }
}
