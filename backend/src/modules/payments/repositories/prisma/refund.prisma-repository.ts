import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infra/prisma/prisma.service';
import type {
  CreateRefundInput,
  IRefundRepository,
  UpdateRefundInput,
} from '../interfaces/refund-repository.interface';

@Injectable()
export class RefundPrismaRepository implements IRefundRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreateRefundInput) {
    return this.prisma.refund.create({
      data: {
        paymentId: input.paymentId,
        orderId: input.orderId,
        amount: input.amount,
        currency: input.currency,
        reason: input.reason ?? null,
        isPartial: input.isPartial,
        speed: input.speed ?? 'normal',
        requestedBy: input.requestedBy ?? null,
        notes: input.notes,
        correlationId: input.correlationId ?? null,
      },
    });
  }

  findById(id: string) {
    return this.prisma.refund.findUnique({ where: { id } });
  }

  findByGatewayRefundId(id: string) {
    return this.prisma.refund.findUnique({ where: { gatewayRefundId: id } });
  }

  listForPayment(paymentId: string) {
    return this.prisma.refund.findMany({
      where: { paymentId },
      orderBy: { createdAt: 'desc' },
    });
  }

  listForOrder(orderId: string) {
    return this.prisma.refund.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });
  }

  patch(id: string, patch: UpdateRefundInput) {
    return this.prisma.refund.update({ where: { id }, data: { ...patch } });
  }
}
