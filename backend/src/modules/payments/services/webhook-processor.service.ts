import { Inject, Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@infra/redis/redis.service';
import { DomainEventBus } from '@infra/events/domain-event-bus';
import { MetricsService } from '@infra/observability/metrics/metrics.service';
import {
  PAYMENT_WEBHOOK_REPOSITORY,
  type IPaymentWebhookRepository,
} from '../repositories/interfaces/payment-webhook-repository.interface';
import { RazorpayWebhookEnvelopeSchema, type RazorpayWebhookEnvelope } from '../dto/payments.dto';
import { RAZORPAY_WEBHOOK_EVENTS } from '../constants';
import { PaymentsService } from './payments.service';
import { RefundsService } from './refunds.service';
import { PAYMENT_EVENTS, type PaymentWebhookEventPayload } from '../events/payment.events';

const IDEMP_TTL = 24 * 60 * 60; // 24h
const IDEMP_KEY = (id: string) => `payments:webhook:${id}:done`;

/**
 * Central Razorpay webhook processor.
 *
 * Guarantees:
 *   • Verified signature before processing (done by the guard, upstream)
 *   • Idempotent via Redis SETNX keyed on the persisted webhook row id
 *   • Every event is auditable via `PaymentWebhookEvent`
 *   • Retryable failures re-enter the BullMQ queue; terminal failures
 *     land in the DLQ + `WebhookStatus.DEAD_LETTER`
 */
@Injectable()
export class PaymentWebhookProcessorService {
  private readonly logger = new Logger(PaymentWebhookProcessorService.name);

  constructor(
    private readonly payments: PaymentsService,
    private readonly refunds: RefundsService,
    private readonly redis: RedisService,
    private readonly bus: DomainEventBus,
    private readonly metrics: MetricsService,
    @Inject(PAYMENT_WEBHOOK_REPOSITORY)
    private readonly repo: IPaymentWebhookRepository,
  ) {}

  /**
   * Persist a verified webhook. Called synchronously by the controller.
   */
  async accept(input: {
    eventType: string;
    rawPayload: Record<string, unknown>;
    gatewayEventId?: string | null;
    signature?: string | null;
    correlationId?: string;
  }): Promise<{ webhookEventId: string; deduplicated: boolean }> {
    if (input.gatewayEventId) {
      const existing = await this.repo.findByGatewayEventId(input.gatewayEventId);
      if (existing) {
        this.metrics.paymentWebhookEvents.labels(input.eventType, 'duplicate').inc();
        return { webhookEventId: existing.id, deduplicated: true };
      }
    }
    const row = await this.repo.record({
      gateway: 'razorpay',
      eventType: input.eventType,
      gatewayEventId: input.gatewayEventId ?? null,
      rawPayload: input.rawPayload as never,
      signature: input.signature ?? null,
      correlationId: input.correlationId ?? null,
    });
    this.metrics.paymentWebhookEvents.labels(input.eventType, 'received').inc();
    this.bus.publish<PaymentWebhookEventPayload>(PAYMENT_EVENTS.WEBHOOK_RECEIVED, {
      webhookEventId: row.id,
      eventType: input.eventType,
      correlationId: input.correlationId,
    });
    return { webhookEventId: row.id, deduplicated: false };
  }

  /**
   * Process a persisted webhook. Called by the BullMQ consumer.
   */
  async process(webhookEventId: string, correlationId?: string): Promise<void> {
    const row = await this.repo.findById(webhookEventId);
    if (!row) {
      this.logger.warn(`webhook ${webhookEventId} not found — skipping`);
      return;
    }
    const key = IDEMP_KEY(webhookEventId);
    const acquired = await this.redis.client.set(key, '1', 'EX', IDEMP_TTL, 'NX');
    if (acquired !== 'OK') {
      this.logger.log(`webhook ${webhookEventId} already processed — skipping`);
      return;
    }
    await this.repo.markProcessing(webhookEventId);
    try {
      const envelope = RazorpayWebhookEnvelopeSchema.parse(row.rawPayload);
      await this.dispatch(envelope, correlationId);
      await this.repo.markProcessed(webhookEventId);
      this.metrics.paymentWebhookEvents.labels(row.eventType, 'processed').inc();
      this.bus.publish<PaymentWebhookEventPayload>(PAYMENT_EVENTS.WEBHOOK_PROCESSED, {
        webhookEventId,
        eventType: row.eventType,
        correlationId,
      });
    } catch (err) {
      await this.redis.client.del(key);
      const msg = (err as Error).message;
      await this.repo.markFailed(webhookEventId, msg);
      this.metrics.paymentWebhookEvents.labels(row.eventType, 'failed').inc();
      this.logger.error(`webhook ${webhookEventId} (${row.eventType}) failed: ${msg}`);
      throw err;
    }
  }

  async deadLetter(webhookEventId: string, error: string): Promise<void> {
    await this.repo.markDeadLetter(webhookEventId, error);
    this.metrics.paymentWebhookEvents.labels('unknown', 'dead_letter').inc();
    this.bus.publish(PAYMENT_EVENTS.WEBHOOK_DEAD_LETTERED, {
      webhookEventId,
      eventType: 'unknown',
    });
  }

  private async dispatch(envelope: RazorpayWebhookEnvelope, correlationId?: string): Promise<void> {
    const paymentEntity = (
      envelope.payload as {
        payment?: { entity?: Record<string, unknown> };
      }
    ).payment?.entity;
    const refundEntity = (
      envelope.payload as {
        refund?: { entity?: Record<string, unknown> };
      }
    ).refund?.entity;

    switch (envelope.event) {
      case RAZORPAY_WEBHOOK_EVENTS.PAYMENT_AUTHORIZED: {
        if (!paymentEntity) return;
        await this.payments.recordAuthorization({
          gatewayPaymentId: String(paymentEntity.id),
          method: (paymentEntity.method as string | undefined) ?? null,
          correlationId,
        });
        return;
      }
      case RAZORPAY_WEBHOOK_EVENTS.PAYMENT_CAPTURED:
      case RAZORPAY_WEBHOOK_EVENTS.ORDER_PAID: {
        if (!paymentEntity) return;
        await this.payments.recordCapture({
          gatewayPaymentId: String(paymentEntity.id),
          method: (paymentEntity.method as string | undefined) ?? null,
          correlationId,
        });
        return;
      }
      case RAZORPAY_WEBHOOK_EVENTS.PAYMENT_FAILED: {
        if (!paymentEntity) return;
        await this.payments.recordFailure({
          gatewayPaymentId: String(paymentEntity.id),
          code: (paymentEntity.error_code as string | undefined) ?? undefined,
          description: (paymentEntity.error_description as string | undefined) ?? undefined,
          correlationId,
        });
        return;
      }
      case RAZORPAY_WEBHOOK_EVENTS.REFUND_CREATED:
      case RAZORPAY_WEBHOOK_EVENTS.REFUND_PROCESSED: {
        if (!refundEntity) return;
        await this.refunds.markProcessed(String(refundEntity.id), correlationId);
        return;
      }
      case RAZORPAY_WEBHOOK_EVENTS.REFUND_FAILED: {
        if (!refundEntity) return;
        await this.refunds.markFailed(String(refundEntity.id), undefined, undefined, correlationId);
        return;
      }
      default:
        this.logger.debug(`unhandled razorpay webhook event: ${envelope.event}`);
        return;
    }
  }
}
