import { Body, Controller, HttpCode, Logger, Post, Req, UseGuards } from '@nestjs/common';
import { ApiExcludeController, ApiOperation } from '@nestjs/swagger';
import type { Request } from 'express';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { QUEUE_NAMES } from '@infra/queue/queue.constants';
import { RazorpayWebhookGuard } from '../guards/razorpay-webhook.guard';
import { PaymentWebhookProcessorService } from '../services/webhook-processor.service';
import { WebhookAckDto } from '../dto/payments.dto';

/**
 * Razorpay webhook endpoint. Requires the raw body (Nest bootstrapped
 * with `rawBody: true`). Signature verification runs in
 * `RazorpayWebhookGuard`; this handler only persists and enqueues.
 *
 * Uses a single POST endpoint — Razorpay ships every event type through
 * one URL, distinguished by `event`.
 */
@Controller({ path: 'webhooks/razorpay', version: '1' })
@UseGuards(RazorpayWebhookGuard)
@ApiExcludeController()
export class PaymentsWebhookController {
  private readonly logger = new Logger(PaymentsWebhookController.name);

  constructor(
    private readonly processor: PaymentWebhookProcessorService,
    @InjectQueue(QUEUE_NAMES.PAYMENTS_WEBHOOK_PROCESS) private readonly queue: Queue,
  ) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Razorpay webhook ingress' })
  async ingress(
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ): Promise<WebhookAckDto> {
    const eventType = String(body.event ?? 'unknown');
    const gatewayEventId =
      typeof body.id === 'string' ? body.id : ((body as { event_id?: string }).event_id ?? null);
    const signature = (req.headers['x-razorpay-signature'] as string | undefined) ?? null;
    const correlationId = (req.headers['x-correlation-id'] as string | undefined) ?? undefined;

    const { webhookEventId, deduplicated } = await this.processor.accept({
      eventType,
      rawPayload: body,
      gatewayEventId,
      signature,
      correlationId,
    });

    if (!deduplicated) {
      await this.queue.add(
        eventType,
        { webhookEventId, eventType, correlationId },
        {
          jobId: `payment-webhook:${webhookEventId}`,
          attempts: 8,
          backoff: { type: 'exponential', delay: 3_000 },
          removeOnComplete: { age: 3_600, count: 1000 },
          removeOnFail: { age: 7 * 24 * 3_600 },
        },
      );
    }
    return { success: true, eventId: webhookEventId };
  }
}
