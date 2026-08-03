import { Injectable } from '@nestjs/common';
import type { Payment, PaymentAttempt } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';
import type {
  CreatePaymentInput,
  IPaymentRepository,
  RecordAttemptInput,
  UpdateGatewayIdsInput,
} from '../interfaces/payment-repository.interface';

@Injectable()
export class PaymentPrismaRepository implements IPaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreatePaymentInput): Promise<Payment> {
    return this.prisma.payment.create({
      data: {
        orderId: input.orderId,
        userId: input.userId,
        receipt: input.receipt,
        amount: input.amount,
        currency: input.currency,
        notes: input.notes,
        metadata: input.metadata,
        expiresAt: input.expiresAt,
        correlationId: input.correlationId,
      },
    });
  }

  findById(id: string) {
    return this.prisma.payment.findUnique({ where: { id } });
  }

  findByReceipt(receipt: string) {
    return this.prisma.payment.findUnique({ where: { receipt } });
  }

  findByGatewayOrderId(id: string) {
    return this.prisma.payment.findUnique({ where: { gatewayOrderId: id } });
  }

  findByGatewayPaymentId(id: string) {
    return this.prisma.payment.findUnique({ where: { gatewayPaymentId: id } });
  }

  findLatestForOrder(orderId: string) {
    return this.prisma.payment.findFirst({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });
  }

  listForUser(userId: string, limit = 50) {
    return this.prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  patch(id: string, patch: UpdateGatewayIdsInput) {
    return this.prisma.payment.update({
      where: { id },
      data: { ...patch },
    });
  }

  async incrementRefunded(id: string, delta: string): Promise<Payment> {
    return this.prisma.payment.update({
      where: { id },
      data: { amountRefunded: { increment: delta } },
    });
  }

  async recordAttempt(input: RecordAttemptInput): Promise<PaymentAttempt> {
    const nextNo =
      input.attemptNo ??
      (await this.prisma.paymentAttempt.count({
        where: { paymentId: input.paymentId },
      })) + 1;
    return this.prisma.paymentAttempt.create({
      data: {
        paymentId: input.paymentId,
        attemptNo: nextNo,
        action: input.action,
        status: input.status,
        gatewayCode: input.gatewayCode ?? null,
        gatewayMessage: input.gatewayMessage ?? null,
        request: input.request ?? undefined,
        response: input.response ?? undefined,
        correlationId: input.correlationId ?? null,
      },
    });
  }

  listAttempts(paymentId: string) {
    return this.prisma.paymentAttempt.findMany({
      where: { paymentId },
      orderBy: { createdAt: 'asc' },
    });
  }
}
