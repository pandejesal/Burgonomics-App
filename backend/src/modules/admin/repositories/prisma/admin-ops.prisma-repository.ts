import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Payment, PaymentWebhookEvent, PetpoojaWebhookEvent, Refund } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';
import type {
  DashboardCounts,
  IAdminOpsRepository,
  PaymentReconciliationSummary,
  PaymentSearchFilter,
  WebhookHistoryFilter,
  WebhookHistoryResult,
} from '../interfaces/admin-ops-repository.interface';

@Injectable()
export class AdminOpsPrismaRepository implements IAdminOpsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private paginateMeta<T>(
    rows: T[],
    total: number,
    page: number,
    pageSize: number,
  ): WebhookHistoryResult<T> {
    return {
      items: rows,
      total,
      page,
      pageSize,
      hasNext: page * pageSize < total,
    };
  }

  async listPetpoojaWebhooks(
    f: WebhookHistoryFilter,
  ): Promise<WebhookHistoryResult<PetpoojaWebhookEvent>> {
    const where: Prisma.PetpoojaWebhookEventWhereInput = {};
    if (f.status) where.status = f.status as Prisma.PetpoojaWebhookEventWhereInput['status'];
    if (f.from || f.to) {
      where.receivedAt = {};
      if (f.from) where.receivedAt.gte = f.from;
      if (f.to) where.receivedAt.lte = f.to;
    }
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.petpoojaWebhookEvent.findMany({
        where,
        orderBy: { receivedAt: 'desc' },
        skip: (f.page - 1) * f.pageSize,
        take: f.pageSize,
      }),
      this.prisma.petpoojaWebhookEvent.count({ where }),
    ]);
    return this.paginateMeta(rows, total, f.page, f.pageSize);
  }

  getPetpoojaWebhook(id: string) {
    return this.prisma.petpoojaWebhookEvent.findUnique({ where: { id } });
  }

  async listPaymentWebhooks(
    f: WebhookHistoryFilter,
  ): Promise<WebhookHistoryResult<PaymentWebhookEvent>> {
    const where: Prisma.PaymentWebhookEventWhereInput = {};
    if (f.status) where.status = f.status as Prisma.PaymentWebhookEventWhereInput['status'];
    if (f.from || f.to) {
      where.receivedAt = {};
      if (f.from) where.receivedAt.gte = f.from;
      if (f.to) where.receivedAt.lte = f.to;
    }
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.paymentWebhookEvent.findMany({
        where,
        orderBy: { receivedAt: 'desc' },
        skip: (f.page - 1) * f.pageSize,
        take: f.pageSize,
      }),
      this.prisma.paymentWebhookEvent.count({ where }),
    ]);
    return this.paginateMeta(rows, total, f.page, f.pageSize);
  }

  getPaymentWebhook(id: string) {
    return this.prisma.paymentWebhookEvent.findUnique({ where: { id } });
  }

  async searchPayments(f: PaymentSearchFilter): Promise<WebhookHistoryResult<Payment>> {
    const where: Prisma.PaymentWhereInput = {};
    if (f.status) where.status = f.status as Prisma.PaymentWhereInput['status'];
    if (f.gatewayPaymentId) where.gatewayPaymentId = f.gatewayPaymentId;
    if (f.orderId) where.orderId = f.orderId;
    if (f.from || f.to) {
      where.createdAt = {};
      if (f.from) where.createdAt.gte = f.from;
      if (f.to) where.createdAt.lte = f.to;
    }
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (f.page - 1) * f.pageSize,
        take: f.pageSize,
      }),
      this.prisma.payment.count({ where }),
    ]);
    return this.paginateMeta(rows, total, f.page, f.pageSize);
  }

  listRecentRefunds(limit: number): Promise<Refund[]> {
    return this.prisma.refund.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async detectDuplicatePayments(windowMinutes: number) {
    const since = new Date(Date.now() - windowMinutes * 60_000);
    const rows = await this.prisma.$queryRaw<Array<{ orderId: string; count: bigint }>>(
      Prisma.sql`
        SELECT "orderId", COUNT(*)::bigint AS count
        FROM payments
        WHERE "createdAt" >= ${since} AND status IN ('CREATED', 'AUTHORIZED', 'CAPTURED')
        GROUP BY "orderId"
        HAVING COUNT(*) > 1
        ORDER BY count DESC
      `,
    );
    return rows.map((r) => ({ orderId: r.orderId, count: Number(r.count) }));
  }

  async reconcilePayments(from: Date, to: Date): Promise<PaymentReconciliationSummary> {
    const payments = await this.prisma.payment.findMany({
      where: { createdAt: { gte: from, lte: to } },
      select: {
        id: true,
        status: true,
        amount: true,
        amountRefunded: true,
        gatewayPaymentId: true,
      },
    });
    let totalPaise = 0;
    let refundedPaise = 0;
    const discrepancies: Array<{ paymentId: string; reason: string }> = [];
    for (const p of payments) {
      const amt = Math.round(Number(p.amount) * 100);
      const refunded = Math.round(Number(p.amountRefunded) * 100);
      totalPaise += amt;
      refundedPaise += refunded;
      if (p.status === 'CAPTURED' && !p.gatewayPaymentId) {
        discrepancies.push({ paymentId: p.id, reason: 'captured-without-gateway-id' });
      }
      if (refunded > amt) {
        discrepancies.push({ paymentId: p.id, reason: 'refund-exceeds-capture' });
      }
    }
    return { count: payments.length, totalPaise, refundedPaise, discrepancies };
  }

  async dashboardCounts(): Promise<DashboardCounts> {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);
    const [
      ordersLast24h,
      ordersActive,
      paymentsCapturedLast24h,
      refundsPendingCount,
      petpoojaWebhooksPending,
      paymentWebhooksPending,
      realtimeSessionsActive,
      storesActive,
    ] = await this.prisma.$transaction([
      this.prisma.order.count({ where: { placedAt: { gte: yesterday } } }),
      this.prisma.order.count({
        where: {
          status: {
            in: ['ORDER_CREATED', 'ORDER_ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'],
          },
        },
      }),
      this.prisma.payment.count({
        where: { status: 'CAPTURED', capturedAt: { gte: yesterday } },
      }),
      this.prisma.refund.count({ where: { status: 'PENDING' } }),
      this.prisma.petpoojaWebhookEvent.count({
        where: { status: { in: ['RECEIVED', 'PROCESSING'] } },
      }),
      this.prisma.paymentWebhookEvent.count({
        where: { status: { in: ['RECEIVED', 'PROCESSING'] } },
      }),
      this.prisma.realtimeSession.count({ where: { disconnectedAt: null } }),
      this.prisma.store.count({ where: { status: 'OPEN' } }),
    ]);
    return {
      ordersLast24h,
      ordersActive,
      paymentsCapturedLast24h,
      refundsPendingCount,
      petpoojaWebhooksPending,
      paymentWebhooksPending,
      realtimeSessionsActive,
      storesActive,
    };
  }
}
