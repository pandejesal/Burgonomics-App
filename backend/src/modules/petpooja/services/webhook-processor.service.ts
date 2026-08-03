import { Inject, Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@infra/redis/redis.service';
import { DomainEventBus } from '@infra/events/domain-event-bus';
import { PetpoojaAdapter } from './petpooja-adapter.service';
import {
  PetpoojaWebhookPrismaRepository,
  PETPOOJA_WEBHOOK_REPOSITORY,
  type IPetpoojaWebhookRepository,
} from '../repositories/petpooja-webhook.repository';
import {
  OrderCallbackWebhookSchema,
  PushMenuWebhookSchema,
  StockUpdateWebhookSchema,
  StoreStatusWebhookSchema,
} from '../dto/petpooja.dto';
import { PETPOOJA_WEBHOOK_TYPES } from '../constants';
import { PETPOOJA_EVENTS, type WebhookReceivedEvent } from '../events/petpooja.events';

const IDEMP_KEY = (id: string) => `petpooja:webhook:${id}:done`;
const IDEMP_TTL = 24 * 60 * 60; // 24h

/**
 * Central webhook processor. Responsible for:
 *   1. Idempotent replay protection (Redis SETNX)
 *   2. Zod validation of the raw payload
 *   3. Delegating to the adapter's ingest* methods
 *   4. Marking the persisted webhook row as processed/failed
 */
@Injectable()
export class WebhookProcessorService {
  private readonly logger = new Logger(WebhookProcessorService.name);

  constructor(
    private readonly adapter: PetpoojaAdapter,
    private readonly redis: RedisService,
    private readonly bus: DomainEventBus,
    @Inject(PETPOOJA_WEBHOOK_REPOSITORY)
    private readonly repo: IPetpoojaWebhookRepository,
  ) {}

  /** Called by the webhook controller after signature verification. */
  async accept(
    webhookType: string,
    rawPayload: Record<string, unknown>,
    signature: string | null,
    correlationId?: string,
  ): Promise<{ webhookEventId: string; alreadyReceived: boolean }> {
    const row = await this.repo.record({
      webhookType,
      rawPayload: rawPayload as never,
      signature,
      correlationId: correlationId ?? null,
    });
    this.bus.publish<WebhookReceivedEvent>(PETPOOJA_EVENTS.WEBHOOK_RECEIVED, {
      webhookEventId: row.id,
      webhookType,
      correlationId,
    });
    return { webhookEventId: row.id, alreadyReceived: false };
  }

  /** Called by the BullMQ consumer to actually process the row. */
  async process(webhookEventId: string, correlationId?: string): Promise<void> {
    const row = await this.repo.findById(webhookEventId);
    if (!row) {
      this.logger.warn(`Webhook ${webhookEventId} not found; skipping.`);
      return;
    }
    const key = IDEMP_KEY(webhookEventId);
    const acquired = await this.redis.client.set(key, '1', 'EX', IDEMP_TTL, 'NX');
    if (acquired !== 'OK') {
      this.logger.log(`Webhook ${webhookEventId} already processed; skipping.`);
      return;
    }
    await this.repo.markProcessing(webhookEventId);
    try {
      await this.dispatch(
        row.webhookType,
        row.rawPayload as Record<string, unknown>,
        correlationId,
      );
      await this.repo.markProcessed(webhookEventId);
      this.bus.publish(PETPOOJA_EVENTS.WEBHOOK_PROCESSED, {
        webhookEventId,
        webhookType: row.webhookType,
        correlationId,
      });
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.error(`Webhook ${webhookEventId} (${row.webhookType}) failed: ${msg}`);
      // Release the idempotency key so retries can proceed.
      await this.redis.client.del(key);
      await this.repo.markFailed(webhookEventId, msg);
      throw err;
    }
  }

  /** Terminal failure — invoked when BullMQ has exhausted all retries. */
  async deadLetter(webhookEventId: string, error: string): Promise<void> {
    await this.repo.markDeadLetter(webhookEventId, error);
  }

  private async dispatch(
    type: string,
    payload: Record<string, unknown>,
    correlationId?: string,
  ): Promise<void> {
    switch (type) {
      case PETPOOJA_WEBHOOK_TYPES.PUSH_MENU: {
        const parsed = PushMenuWebhookSchema.parse(payload);
        await this.adapter.ingestPushMenu(parsed, correlationId);
        return;
      }
      case PETPOOJA_WEBHOOK_TYPES.ORDER_CALLBACK: {
        const parsed = OrderCallbackWebhookSchema.parse(payload);
        await this.adapter.ingestOrderCallback(parsed, correlationId);
        return;
      }
      case PETPOOJA_WEBHOOK_TYPES.STOCK_UPDATE: {
        const parsed = StockUpdateWebhookSchema.parse(payload);
        await this.adapter.ingestStockUpdate(parsed, correlationId);
        return;
      }
      case PETPOOJA_WEBHOOK_TYPES.STORE_STATUS: {
        const parsed = StoreStatusWebhookSchema.parse(payload);
        await this.adapter.ingestStoreStatus(parsed, correlationId);
        return;
      }
      default:
        throw new Error(`Unknown PETPOOJA webhook type: ${type}`);
    }
  }
}

// Re-export for DI wiring elsewhere.
export { PetpoojaWebhookPrismaRepository };
