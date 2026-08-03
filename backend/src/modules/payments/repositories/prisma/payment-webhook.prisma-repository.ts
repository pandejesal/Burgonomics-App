import { Injectable } from '@nestjs/common';
import type { WebhookStatus } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';
import type {
  IPaymentWebhookRepository,
  RecordPaymentWebhookInput,
} from '../interfaces/payment-webhook-repository.interface';

@Injectable()
export class PaymentWebhookPrismaRepository implements IPaymentWebhookRepository {
  constructor(private readonly prisma: PrismaService) {}

  record(input: RecordPaymentWebhookInput) {
    return this.prisma.paymentWebhookEvent.create({
      data: {
        gateway: input.gateway ?? 'razorpay',
        eventType: input.eventType,
        gatewayEventId: input.gatewayEventId ?? null,
        rawPayload: input.rawPayload,
        signature: input.signature ?? null,
        correlationId: input.correlationId ?? null,
        status: 'RECEIVED',
      },
    });
  }

  findById(id: string) {
    return this.prisma.paymentWebhookEvent.findUnique({ where: { id } });
  }

  findByGatewayEventId(id: string) {
    return this.prisma.paymentWebhookEvent.findUnique({
      where: { gatewayEventId: id },
    });
  }

  private async patch(id: string, status: WebhookStatus, error?: string) {
    await this.prisma.paymentWebhookEvent.update({
      where: { id },
      data: {
        status,
        lastError: error ?? null,
        processedAt: status === 'PROCESSED' || status === 'DEAD_LETTER' ? new Date() : null,
        attempts: { increment: 1 },
      },
    });
  }

  async markProcessing(id: string) {
    await this.prisma.paymentWebhookEvent.update({
      where: { id },
      data: { status: 'PROCESSING' },
    });
  }
  markProcessed(id: string) {
    return this.patch(id, 'PROCESSED');
  }
  markFailed(id: string, error: string) {
    return this.patch(id, 'FAILED', error);
  }
  markDeadLetter(id: string, error: string) {
    return this.patch(id, 'DEAD_LETTER', error);
  }
}
