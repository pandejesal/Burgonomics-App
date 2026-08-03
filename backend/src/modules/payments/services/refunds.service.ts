import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Refund } from '@prisma/client';
import { DomainEventBus } from '@infra/events/domain-event-bus';
import { MetricsService } from '@infra/observability/metrics/metrics.service';
import { RedisService } from '@infra/redis/redis.service';
import { ConflictError, NotFoundError, ValidationError } from '@common/errors';
import {
  PAYMENT_REPOSITORY,
  type IPaymentRepository,
} from '../repositories/interfaces/payment-repository.interface';
import {
  REFUND_REPOSITORY,
  type IRefundRepository,
} from '../repositories/interfaces/refund-repository.interface';
import { RazorpayGatewayService } from './razorpay-gateway.service';
import { PaymentSpecs } from '../specifications/payment.specifications';
import { rupeesToPaise } from '../validators/payment.validators';
import { PAYMENT_EVENTS, type RefundEventPayload } from '../events/payment.events';

interface CreateRefundInput {
  paymentId: string;
  amount?: number; // rupees; omit for full refund
  reason?: string;
  speed?: 'normal' | 'optimum';
  requestedBy?: string;
  correlationId?: string;
}

const LOCK_TTL_MS = 15_000;

/**
 * Refunds domain service. Guarantees:
 *   • No double-refund (Redis lock + amountRefunded ledger + spec check)
 *   • Fully auditable (every attempt persisted as a PaymentAttempt row)
 *   • Automatic retry (async processor consumes PAYMENTS_REFUND queue)
 */
@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);

  constructor(
    @Inject(PAYMENT_REPOSITORY) private readonly payments: IPaymentRepository,
    @Inject(REFUND_REPOSITORY) private readonly refunds: IRefundRepository,
    private readonly gateway: RazorpayGatewayService,
    private readonly redis: RedisService,
    private readonly metrics: MetricsService,
    private readonly bus: DomainEventBus,
  ) {}

  async createRefund(input: CreateRefundInput): Promise<Refund> {
    const payment = await this.payments.findById(input.paymentId);
    if (!payment) throw new NotFoundError('Payment not found');
    if (!payment.gatewayPaymentId) {
      throw new ValidationError('Payment has no gateway payment id');
    }

    const remaining = Number(payment.amount) - Number(payment.amountRefunded);
    const amount = input.amount ?? remaining;
    if (!PaymentSpecs.canRefund(payment, String(amount))) {
      throw new ConflictError('Refund amount exceeds refundable balance');
    }
    const isPartial = amount + 1e-6 < Number(payment.amount);

    const lockKey = `payments:refund:${payment.id}`;
    const token = await this.redis.acquireLock(lockKey, LOCK_TTL_MS);
    if (!token) throw new ConflictError('Refund already in progress');

    try {
      const refundRow = await this.refunds.create({
        paymentId: payment.id,
        orderId: payment.orderId,
        amount: amount.toFixed(2),
        currency: payment.currency,
        reason: input.reason,
        isPartial,
        speed: input.speed ?? 'normal',
        requestedBy: input.requestedBy,
        correlationId: input.correlationId,
        notes: {
          reason: input.reason ?? '',
          requestedBy: input.requestedBy ?? '',
        } as Record<string, string>,
      });

      try {
        const gwRefund = await this.gateway.createRefund(
          payment.gatewayPaymentId,
          {
            amount: rupeesToPaise(amount),
            speed: input.speed ?? 'normal',
            notes: {
              refundId: refundRow.id,
              orderId: payment.orderId,
              reason: input.reason ?? '',
            },
          },
          input.correlationId,
          `refund:${refundRow.id}`,
        );

        const patched = await this.refunds.patch(refundRow.id, {
          gatewayRefundId: gwRefund.id,
          status: 'PROCESSING',
        });
        await this.payments.recordAttempt({
          paymentId: payment.id,
          action: 'REFUND',
          status: 'requested',
          response: gwRefund as never,
          correlationId: input.correlationId ?? null,
        });
        this.metrics.refundEvents.labels('created', 'ok').inc();
        this.bus.publish<RefundEventPayload>(PAYMENT_EVENTS.REFUND_CREATED, {
          refundId: patched.id,
          paymentId: payment.id,
          orderId: payment.orderId,
          amount: patched.amount.toString(),
          isPartial,
          gatewayRefundId: gwRefund.id,
          correlationId: input.correlationId,
        });
        return patched;
      } catch (err) {
        await this.refunds.patch(refundRow.id, {
          status: 'FAILED',
          failedAt: new Date(),
          failureCode: 'gateway_refund_failed',
          failureDescription: (err as Error).message,
        });
        await this.payments.recordAttempt({
          paymentId: payment.id,
          action: 'REFUND',
          status: 'failed',
          gatewayMessage: (err as Error).message,
          correlationId: input.correlationId ?? null,
        });
        this.metrics.refundEvents.labels('created', 'failed').inc();
        this.bus.publish(PAYMENT_EVENTS.REFUND_FAILED, {
          refundId: refundRow.id,
          paymentId: payment.id,
          orderId: payment.orderId,
          amount: refundRow.amount.toString(),
          isPartial,
          correlationId: input.correlationId,
        });
        throw err;
      }
    } finally {
      await this.redis.releaseLock(lockKey, token);
    }
  }

  /**
   * Called from the refund webhook when Razorpay confirms the refund
   * has actually settled. Updates the ledger + payment status.
   */
  async markProcessed(gatewayRefundId: string, correlationId?: string): Promise<Refund | null> {
    const refund = await this.refunds.findByGatewayRefundId(gatewayRefundId);
    if (!refund) return null;
    if (refund.status === 'PROCESSED') return refund;

    const updated = await this.refunds.patch(refund.id, {
      status: 'PROCESSED',
      processedAt: new Date(),
    });
    const payment = await this.payments.incrementRefunded(
      refund.paymentId,
      refund.amount.toString(),
    );
    const remaining = Number(payment.amount) - Number(payment.amountRefunded);
    await this.payments.patch(payment.id, {
      status: remaining <= 1e-6 ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
    });
    this.metrics.refundEvents.labels('completed', 'ok').inc();
    this.bus.publish<RefundEventPayload>(PAYMENT_EVENTS.REFUND_COMPLETED, {
      refundId: updated.id,
      paymentId: payment.id,
      orderId: payment.orderId,
      amount: updated.amount.toString(),
      isPartial: refund.isPartial,
      gatewayRefundId,
      correlationId,
    });
    return updated;
  }

  async markFailed(
    gatewayRefundId: string,
    code?: string,
    message?: string,
    correlationId?: string,
  ): Promise<Refund | null> {
    const refund = await this.refunds.findByGatewayRefundId(gatewayRefundId);
    if (!refund) return null;
    if (refund.status === 'FAILED') return refund;
    const updated = await this.refunds.patch(refund.id, {
      status: 'FAILED',
      failedAt: new Date(),
      failureCode: code ?? null,
      failureDescription: message ?? null,
    });
    this.metrics.refundEvents.labels('failed', code ?? 'unknown').inc();
    this.bus.publish(PAYMENT_EVENTS.REFUND_FAILED, {
      refundId: updated.id,
      paymentId: refund.paymentId,
      orderId: refund.orderId,
      amount: refund.amount.toString(),
      isPartial: refund.isPartial,
      gatewayRefundId,
      correlationId,
    });
    return updated;
  }

  listForPayment(paymentId: string) {
    return this.refunds.listForPayment(paymentId);
  }

  listForOrder(orderId: string) {
    return this.refunds.listForOrder(orderId);
  }
}
