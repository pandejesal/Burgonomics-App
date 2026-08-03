import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infra/prisma/prisma.service';
import { getRequestContext } from '@common/context/request-context';

/**
 * Transactional outbox writer.
 *
 * Feature services call `record()` inside their own DB transaction to
 * atomically persist domain state + an outbox row. A background worker
 * (registered in Phase 2) publishes pending rows to the durable
 * transport (BullMQ / FCM / Petpooja).
 */
@Injectable()
export class OutboxService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: {
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    payload: Record<string, unknown>;
  }): Promise<void> {
    await this.prisma.outboxEvent.create({
      data: {
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        eventType: input.eventType,
        payload: input.payload as any,
        correlationId: getRequestContext()?.correlationId ?? null,
      },
    });
  }
}
