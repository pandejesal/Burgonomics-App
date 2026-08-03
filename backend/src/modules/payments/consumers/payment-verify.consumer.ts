import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { QUEUE_NAMES } from '@infra/queue/queue.constants';
import { PaymentsService } from '../services/payments.service';

export interface PaymentVerifyJob {
  paymentId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  correlationId?: string;
}

@Injectable()
@Processor(QUEUE_NAMES.PAYMENTS_VERIFY)
export class PaymentVerifyConsumer extends WorkerHost {
  private readonly logger = new Logger(PaymentVerifyConsumer.name);
  constructor(
    private readonly payments: PaymentsService,
    @InjectQueue(QUEUE_NAMES.PAYMENTS_VERIFY) private readonly self: Queue,
  ) {
    super();
  }

  async process(job: Job<PaymentVerifyJob>): Promise<void> {
    this.logger.log(
      `[${job.data.correlationId}] async verify attempt ${job.attemptsMade + 1} for payment=${job.data.paymentId}`,
    );
    await this.payments.verify({
      paymentId: job.data.paymentId,
      razorpayOrderId: job.data.razorpayOrderId,
      razorpayPaymentId: job.data.razorpayPaymentId,
      razorpaySignature: job.data.razorpaySignature,
      correlationId: job.data.correlationId,
    });
  }
}
