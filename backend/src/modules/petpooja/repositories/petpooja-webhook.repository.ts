import { Injectable } from '@nestjs/common';
import type { Prisma, PetpoojaWebhookEvent, WebhookStatus } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';

export const PETPOOJA_WEBHOOK_REPOSITORY = Symbol('PETPOOJA_WEBHOOK_REPOSITORY');

export interface RecordWebhookInput {
  webhookType: string;
  rawPayload: Prisma.InputJsonValue;
  signature?: string | null;
  correlationId?: string | null;
}

export interface IPetpoojaWebhookRepository {
  record(input: RecordWebhookInput): Promise<PetpoojaWebhookEvent>;
  findById(id: string): Promise<PetpoojaWebhookEvent | null>;
  markProcessing(id: string): Promise<void>;
  markProcessed(id: string): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
  markDeadLetter(id: string, error: string): Promise<void>;
}

@Injectable()
export class PetpoojaWebhookPrismaRepository implements IPetpoojaWebhookRepository {
  constructor(private readonly prisma: PrismaService) {}

  record(input: RecordWebhookInput) {
    return this.prisma.petpoojaWebhookEvent.create({
      data: {
        webhookType: input.webhookType,
        rawPayload: input.rawPayload,
        signature: input.signature ?? null,
        correlationId: input.correlationId ?? null,
        status: 'RECEIVED',
      },
    });
  }

  findById(id: string) {
    return this.prisma.petpoojaWebhookEvent.findUnique({ where: { id } });
  }

  private async patchStatus(id: string, status: WebhookStatus, error?: string, processed = false) {
    await this.prisma.petpoojaWebhookEvent.update({
      where: { id },
      data: {
        status,
        lastError: error ?? null,
        processedAt: processed ? new Date() : undefined,
        attempts: { increment: 1 },
      },
    });
  }

  async markProcessing(id: string) {
    await this.patchStatus(id, 'PROCESSING');
  }

  async markProcessed(id: string) {
    await this.patchStatus(id, 'PROCESSED', undefined, true);
  }

  async markFailed(id: string, error: string) {
    await this.patchStatus(id, 'FAILED', error);
  }

  async markDeadLetter(id: string, error: string) {
    await this.patchStatus(id, 'DEAD_LETTER', error);
  }
}
