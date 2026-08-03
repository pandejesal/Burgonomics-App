import { Inject, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { QUEUE_NAMES } from '@infra/queue/queue.constants';
import { NotFoundError } from '@common/errors';
import {
  ADMIN_OPS_REPOSITORY,
  type IAdminOpsRepository,
  type WebhookHistoryFilter,
} from '../repositories/interfaces/admin-ops-repository.interface';

export type WebhookGateway = 'petpooja' | 'razorpay';

@Injectable()
export class WebhookOpsService {
  constructor(
    @Inject(ADMIN_OPS_REPOSITORY) private readonly repo: IAdminOpsRepository,
    @InjectQueue(QUEUE_NAMES.PETPOOJA_WEBHOOK_PROCESS) private readonly petpoojaQ: Queue,
    @InjectQueue(QUEUE_NAMES.PAYMENTS_WEBHOOK_PROCESS) private readonly paymentQ: Queue,
  ) {}

  list(filter: WebhookHistoryFilter) {
    return filter.gateway === 'petpooja'
      ? this.repo.listPetpoojaWebhooks(filter)
      : this.repo.listPaymentWebhooks(filter);
  }

  async get(gateway: WebhookGateway, id: string) {
    const row =
      gateway === 'petpooja'
        ? await this.repo.getPetpoojaWebhook(id)
        : await this.repo.getPaymentWebhook(id);
    if (!row) throw new NotFoundError(`${gateway} webhook`);
    return row;
  }

  async replay(gateway: WebhookGateway, id: string): Promise<{ enqueued: boolean }> {
    const row = await this.get(gateway, id);
    if (gateway === 'petpooja') {
      await this.petpoojaQ.add(
        'process',
        {
          webhookEventId: row.id,
          webhookType: (row as { webhookType?: string }).webhookType ?? 'unknown',
          correlationId: (row as { correlationId?: string | null }).correlationId ?? undefined,
        },
        { jobId: `replay:${row.id}:${Date.now()}` },
      );
    } else {
      await this.paymentQ.add(
        'process',
        {
          eventId: row.id,
          eventType: (row as { eventType?: string }).eventType ?? 'unknown',
          correlationId: (row as { correlationId?: string | null }).correlationId ?? undefined,
        },
        { jobId: `replay:${row.id}:${Date.now()}` },
      );
    }
    return { enqueued: true };
  }
}
