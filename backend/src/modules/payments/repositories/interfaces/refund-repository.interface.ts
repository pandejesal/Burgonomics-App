import type { Prisma, Refund, RefundStatus } from '@prisma/client';

export const REFUND_REPOSITORY = Symbol('REFUND_REPOSITORY');

export interface CreateRefundInput {
  paymentId: string;
  orderId: string;
  amount: string;
  currency: string;
  reason?: string;
  isPartial: boolean;
  speed?: string;
  requestedBy?: string;
  notes?: Prisma.InputJsonValue;
  correlationId?: string;
}

export interface UpdateRefundInput {
  status?: RefundStatus;
  gatewayRefundId?: string;
  failureCode?: string | null;
  failureDescription?: string | null;
  processedAt?: Date | null;
  failedAt?: Date | null;
}

export interface IRefundRepository {
  create(input: CreateRefundInput): Promise<Refund>;
  findById(id: string): Promise<Refund | null>;
  findByGatewayRefundId(id: string): Promise<Refund | null>;
  listForPayment(paymentId: string): Promise<Refund[]>;
  listForOrder(orderId: string): Promise<Refund[]>;
  patch(id: string, patch: UpdateRefundInput): Promise<Refund>;
}
