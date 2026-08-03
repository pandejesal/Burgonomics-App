import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { QUEUE_NAMES } from '@infra/queue/queue.constants';
import { PetpoojaAdapter } from '../services/petpooja-adapter.service';

export interface RiderUpdateJob {
  orderId: string;
  status: string;
  riderName: string;
  riderPhone: string;
  correlationId?: string;
}

@Processor(QUEUE_NAMES.PETPOOJA_RIDER_UPDATE)
export class PetpoojaRiderUpdateConsumer extends WorkerHost {
  private readonly logger = new Logger(PetpoojaRiderUpdateConsumer.name);
  constructor(private readonly adapter: PetpoojaAdapter) {
    super();
  }
  async process(job: Job<RiderUpdateJob>): Promise<void> {
    const { orderId, status, riderName, riderPhone, correlationId } = job.data;
    this.logger.log(`[${correlationId}] rider_status_update order=${orderId} status=${status}`);
    await this.adapter.dispatchRiderUpdate(orderId, status, riderName, riderPhone, correlationId);
  }
}
