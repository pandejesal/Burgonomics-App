import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { QUEUE_NAMES } from '@infra/queue/queue.constants';
import { PetpoojaAdapter } from '../services/petpooja-adapter.service';

export interface SaveOrderJob {
  orderId: string;
  correlationId?: string;
}

@Processor(QUEUE_NAMES.PETPOOJA_SAVE_ORDER)
export class PetpoojaSaveOrderConsumer extends WorkerHost {
  private readonly logger = new Logger(PetpoojaSaveOrderConsumer.name);
  constructor(private readonly adapter: PetpoojaAdapter) {
    super();
  }
  async process(job: Job<SaveOrderJob>): Promise<void> {
    const { orderId, correlationId } = job.data;
    this.logger.log(
      `[${correlationId}] save_order attempt ${job.attemptsMade + 1} for order=${orderId}`,
    );
    await this.adapter.dispatchSaveOrder(orderId, correlationId);
  }
}
