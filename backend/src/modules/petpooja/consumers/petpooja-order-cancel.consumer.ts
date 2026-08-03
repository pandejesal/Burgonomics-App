import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { QUEUE_NAMES } from '@infra/queue/queue.constants';
import { PetpoojaAdapter } from '../services/petpooja-adapter.service';

export interface OrderCancelJob {
  orderId: string;
  reason: string;
  correlationId?: string;
}

@Processor(QUEUE_NAMES.PETPOOJA_ORDER_CANCEL)
export class PetpoojaOrderCancelConsumer extends WorkerHost {
  private readonly logger = new Logger(PetpoojaOrderCancelConsumer.name);
  constructor(private readonly adapter: PetpoojaAdapter) {
    super();
  }
  async process(job: Job<OrderCancelJob>): Promise<void> {
    const { orderId, reason, correlationId } = job.data;
    this.logger.log(`[${correlationId}] cancel_order for order=${orderId}`);
    await this.adapter.dispatchCancelOrder(orderId, reason, correlationId);
  }
}
