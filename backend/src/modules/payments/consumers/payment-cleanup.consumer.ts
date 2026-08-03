import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { QUEUE_NAMES } from '@infra/queue/queue.constants';
import { PrismaService } from '@infra/prisma/prisma.service';

export interface PaymentCleanupJob {
  cutoffMinutes?: number;
}

/**
 * Reaper: marks abandoned CREATED payments as EXPIRED once their gateway
 * order TTL is past. Runs on a scheduled cadence via BullMQ repeatable
 * jobs configured at bootstrap.
 */
@Injectable()
@Processor(QUEUE_NAMES.PAYMENTS_CLEANUP)
export class PaymentCleanupConsumer extends WorkerHost {
  private readonly logger = new Logger(PaymentCleanupConsumer.name);
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(_job: Job<PaymentCleanupJob>): Promise<void> {
    const now = new Date();
    const res = await this.prisma.payment.updateMany({
      where: {
        status: 'CREATED',
        expiresAt: { lt: now },
      },
      data: { status: 'EXPIRED', failedAt: now, failureCode: 'expired' },
    });
    if (res.count > 0) {
      this.logger.log(`expired ${res.count} abandoned payment orders`);
    }
  }
}
