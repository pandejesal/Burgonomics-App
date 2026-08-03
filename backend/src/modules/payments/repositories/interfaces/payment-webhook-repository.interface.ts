import type { PaymentWebhookEvent, Prisma, WebhookStatus } from '@prisma/client';

export const PAYMENT_WEBHOOK_REPOSITORY = Symbol('PAYMENT_WEBHOOK_REPOSITORY');

export interface RecordPaymentWebhookInput {
  gateway?: string;
  eventType: string;
  gatewayEventId?: string | null;
  rawPayload: Prisma.InputJsonValue;
  signature?: string | null;
  correlationId?: string | null;
}

export interface IPaymentWebhookRepository {
  record(input: RecordPaymentWebhookInput): Promise<PaymentWebhookEvent>;
  findById(id: string): Promise<PaymentWebhookEvent | null>;
  findByGatewayEventId(id: string): Promise<PaymentWebhookEvent | null>;
  markProcessing(id: string): Promise<void>;
  markProcessed(id: string): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
  markDeadLetter(id: string, error: string): Promise<void>;
}
