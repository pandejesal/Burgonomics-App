import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { QUEUE_NAMES } from '@infra/queue/queue.constants';
import { RefundsService } from '../services/refunds.service';

export interface RefundJob {
  paymentId: string;
  amount?: number;
  reason?: string;
  requestedBy?: string;
  correlationId?: string;
}

@Injectable()
@Processor(QUEUE_NAMES.PAYMENTS_REFUND)
export class RefundConsumer extends WorkerHost {
  private readonly logger = new Logger(RefundConsumer.name);

  constructor(private readonly refunds: RefundsService) {
    super();
  }

  async process(job: Job<RefundJob>): Promise<void> {
    this.logger.log(
      `[${job.data.correlationId}] refund attempt ${job.attemptsMade + 1} for payment=${job.data.paymentId}`,
    );
    await this.refunds.createRefund({
      paymentId: job.data.paymentId,
      amount: job.data.amount,
      reason: job.data.reason,
      requestedBy: job.data.requestedBy,
      correlationId: job.data.correlationId,
    });
  }
}
