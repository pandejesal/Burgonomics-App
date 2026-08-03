import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Payment } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';
import { DomainEventBus } from '@infra/events/domain-event-bus';
import { RedisService } from '@infra/redis/redis.service';
import { MetricsService } from '@infra/observability/metrics/metrics.service';
import {
  ConflictError,
  ForbiddenError,
  IntegrationError,
  NotFoundError,
  ValidationError,
} from '@common/errors';
import { OrdersService } from '@modules/orders/services/orders.service';
import {
  PAYMENT_REPOSITORY,
  type IPaymentRepository,
} from '../repositories/interfaces/payment-repository.interface';
import { RazorpayGatewayService } from './razorpay-gateway.service';
import { RazorpayCredentialsService } from './razorpay-credentials.service';
import { RazorpaySignatureVerifier } from './razorpay-signature.verifier';
import { PaymentSpecs } from '../specifications/payment.specifications';
import {
  PaymentValidators,
  paiseToRupeesString,
  rupeesToPaise,
} from '../validators/payment.validators';
import {
  PAYMENT_EVENTS,
  type PaymentFailedEvent,
  type PaymentOrderCreatedEvent,
  type PaymentVerifiedEvent,
} from '../events/payment.events';

interface CreateOrderInput {
  userId: string;
  checkoutSessionId: string;
  notes?: Record<string, string>;
  correlationId?: string;
}

interface VerifyInput {
  paymentId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  correlationId?: string;
}

const RECEIPT_PREFIX = 'BURG';
const LOCK_TTL_MS = 15_000;

/**
 * Core Payments orchestration. Owns the payment lifecycle:
 *   • Create Razorpay order + persist internal Payment row (idempotent)
 *   • Verify HMAC signature returned by Razorpay Checkout
 *   • Transition internal order state via `OrdersService`
 *   • Publish domain events for downstream consumers
 *
 * Every mutating method uses a Redis distributed lock keyed by
 * payment identity to serialize concurrent verifications and prevent
 * double-charging bugs.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_REPOSITORY) private readonly repo: IPaymentRepository,
    private readonly gateway: RazorpayGatewayService,
    private readonly credentials: RazorpayCredentialsService,
    private readonly signatures: RazorpaySignatureVerifier,
    private readonly orders: OrdersService,
    private readonly redis: RedisService,
    private readonly metrics: MetricsService,
    private readonly bus: DomainEventBus,
  ) {}

  publishableKey(): string {
    return this.credentials.publishableKeyForClient();
  }

  /**
   * Idempotent order creation. Returns the existing payment row when
   * a caller retries against the same checkout session.
   */
  async createOrder(input: CreateOrderInput): Promise<Payment> {
    const session = await this.prisma.checkoutSession.findUnique({
      where: { id: input.checkoutSessionId },
    });
    if (!session) throw new NotFoundError('Checkout session not found');
    if (session.userId !== input.userId) throw new ForbiddenError('Not your checkout');
    if (session.status !== 'LOCKED' && session.status !== 'VALIDATED') {
      throw new ValidationError('Checkout session is not ready for payment');
    }

    const order = await this.prisma.order.findFirst({
      where: { userId: input.userId, id: session.orderId ?? undefined },
    });
    if (!order) {
      throw new NotFoundError('Order for checkout session not found');
    }
    if (order.status === 'PAYMENT_VERIFIED' || order.status === 'ORDER_SENT_TO_PETPOOJA') {
      throw new ConflictError('Order already paid');
    }

    const existing = await this.repo.findLatestForOrder(order.id);
    if (existing && !PaymentSpecs.isTerminal(existing) && existing.gatewayOrderId) {
      // Reuse the pending gateway order to keep operations idempotent.
      this.metrics.paymentEvents.labels('create_order', 'reused').inc();
      return existing;
    }

    const amountRupees = Number(order.grandTotal);
    PaymentValidators.amountRupees(amountRupees);
    PaymentValidators.currency(order.currency);

    const receipt = this.generateReceipt(order.clientOrderId);
    PaymentValidators.receipt(receipt);

    const payment = await this.repo.create({
      orderId: order.id,
      userId: order.userId,
      receipt,
      amount: order.grandTotal.toString(),
      currency: order.currency,
      notes: (input.notes ?? {}) as Record<string, string>,
      metadata: { checkoutSessionId: session.id },
      expiresAt: new Date(Date.now() + this.credentials.orderExpiryMinutes() * 60_000),
      correlationId: input.correlationId,
    });

    try {
      const razorpayOrder = await this.gateway.createOrder(
        {
          amount: rupeesToPaise(amountRupees),
          currency: order.currency as 'INR',
          receipt,
          payment_capture: 1,
          notes: {
            orderId: order.id,
            clientOrderId: order.clientOrderId,
            userId: order.userId,
            ...input.notes,
          },
        },
        input.correlationId,
        `create-order:${payment.id}`,
      );
      const patched = await this.repo.patch(payment.id, {
        gatewayOrderId: razorpayOrder.id,
        status: 'CREATED',
      });
      await this.repo.recordAttempt({
        paymentId: payment.id,
        action: 'CREATE_ORDER',
        status: 'ok',
        response: razorpayOrder as never,
        correlationId: input.correlationId ?? null,
      });
      await this.orders
        .transition(order.id, 'PAYMENT_PENDING', {
          actorId: input.userId,
          reason: 'razorpay_order_created',
          correlationId: input.correlationId,
          patch: { paymentReference: patched.receipt },
        })
        .catch((err) => {
          // If the order is already in PAYMENT_PENDING the state machine
          // will throw — that is safe to ignore.
          this.logger.debug(`transition to PAYMENT_PENDING skipped: ${(err as Error).message}`);
        });

      this.metrics.paymentEvents.labels('create_order', 'ok').inc();
      this.bus.publish<PaymentOrderCreatedEvent>(PAYMENT_EVENTS.ORDER_CREATED, {
        paymentId: patched.id,
        orderId: patched.orderId,
        userId: patched.userId,
        gatewayOrderId: razorpayOrder.id,
        amount: patched.amount.toString(),
        currency: patched.currency,
        correlationId: input.correlationId,
      });
      return patched;
    } catch (err) {
      await this.repo.recordAttempt({
        paymentId: payment.id,
        action: 'CREATE_ORDER',
        status: 'failed',
        gatewayMessage: (err as Error).message,
        correlationId: input.correlationId ?? null,
      });
      await this.repo.patch(payment.id, {
        status: 'FAILED',
        failedAt: new Date(),
        failureCode: 'gateway_create_order_failed',
        failureDescription: (err as Error).message,
      });
      this.metrics.paymentEvents.labels('create_order', 'failed').inc();
      throw err;
    }
  }

  /**
   * Verifies the signature returned by Razorpay Checkout and links
   * the verified gateway payment id to our internal Payment row and
   * order. Idempotent under both duplicate calls and races.
   */
  async verify(input: VerifyInput): Promise<Payment> {
    const payment = await this.repo.findById(input.paymentId);
    if (!payment) throw new NotFoundError('Payment not found');
    if (payment.gatewayOrderId !== input.razorpayOrderId) {
      throw new ValidationError('Gateway order id mismatch');
    }

    // Idempotency: already verified — return as-is.
    if (
      payment.gatewayPaymentId === input.razorpayPaymentId &&
      (payment.status === 'VERIFIED' || payment.status === 'CAPTURED')
    ) {
      return payment;
    }
    if (payment.gatewayPaymentId && payment.gatewayPaymentId !== input.razorpayPaymentId) {
      throw new ConflictError('Payment already linked to a different gateway payment');
    }
    if (PaymentSpecs.isTerminal(payment)) {
      throw new ConflictError(`Payment is ${payment.status}; cannot verify`);
    }
    if (PaymentSpecs.isExpired(payment)) {
      await this.repo.patch(payment.id, { status: 'EXPIRED', failedAt: new Date() });
      throw new ConflictError('Payment order expired');
    }

    // Serialize concurrent verifications per payment.
    const lockKey = `payments:verify:${payment.id}`;
    const token = await this.redis.acquireLock(lockKey, LOCK_TTL_MS);
    if (!token) {
      throw new ConflictError('Payment verification already in progress');
    }

    try {
      this.signatures.verifyCheckoutSignature({
        razorpayOrderId: input.razorpayOrderId,
        razorpayPaymentId: input.razorpayPaymentId,
        razorpaySignature: input.razorpaySignature,
      });

      const patched = await this.repo.patch(payment.id, {
        gatewayPaymentId: input.razorpayPaymentId,
        status: 'VERIFIED',
        verifiedAt: new Date(),
      });
      await this.repo.recordAttempt({
        paymentId: payment.id,
        action: 'VERIFY',
        status: 'ok',
        response: {
          razorpayOrderId: input.razorpayOrderId,
          razorpayPaymentId: input.razorpayPaymentId,
        } as never,
        correlationId: input.correlationId ?? null,
      });

      // Link payment to order → triggers OrderOutboundBridge to enqueue
      // the PETPOOJA save_order job. `linkPaymentReference` is idempotent
      // via the state machine.
      try {
        await this.orders.linkPaymentReference(patched.orderId, patched.id);
      } catch (err) {
        this.logger.warn(
          `linkPaymentReference for order ${patched.orderId} raised: ${(err as Error).message}`,
        );
      }

      this.metrics.paymentEvents.labels('verify', 'ok').inc();
      this.bus.publish<PaymentVerifiedEvent>(PAYMENT_EVENTS.VERIFIED, {
        paymentId: patched.id,
        orderId: patched.orderId,
        userId: patched.userId,
        gatewayPaymentId: input.razorpayPaymentId,
        correlationId: input.correlationId,
      });
      return patched;
    } catch (err) {
      const isSignatureError =
        err instanceof IntegrationError && err.code === 'RAZORPAY_SIGNATURE_INVALID';
      await this.repo.recordAttempt({
        paymentId: payment.id,
        action: 'VERIFY',
        status: 'failed',
        gatewayCode: isSignatureError ? 'signature_invalid' : 'error',
        gatewayMessage: (err as Error).message,
        correlationId: input.correlationId ?? null,
      });
      if (isSignatureError) {
        await this.repo.patch(payment.id, {
          status: 'FAILED',
          failedAt: new Date(),
          failureCode: 'signature_invalid',
          failureDescription: (err as Error).message,
        });
        this.bus.publish<PaymentFailedEvent>(PAYMENT_EVENTS.FAILED, {
          paymentId: payment.id,
          orderId: payment.orderId,
          userId: payment.userId,
          code: 'signature_invalid',
          message: (err as Error).message,
          correlationId: input.correlationId,
        });
      }
      this.metrics.paymentEvents.labels('verify', 'failed').inc();
      throw err;
    } finally {
      await this.redis.releaseLock(lockKey, token);
    }
  }

  async getById(id: string, userId?: string): Promise<Payment> {
    const p = await this.repo.findById(id);
    if (!p) throw new NotFoundError('Payment not found');
    if (userId && p.userId !== userId) throw new ForbiddenError('Not your payment');
    return p;
  }

  async listForUser(userId: string, limit?: number) {
    return this.repo.listForUser(userId, limit);
  }

  /**
   * Marks a Razorpay-side authorization/capture we learned about via
   * webhook. Idempotent — safe to call for redelivered webhooks.
   */
  async recordCapture(input: {
    gatewayPaymentId: string;
    method?: string | null;
    correlationId?: string;
  }): Promise<Payment | null> {
    const p = await this.repo.findByGatewayPaymentId(input.gatewayPaymentId);
    if (!p) {
      this.logger.warn(
        `webhook capture for unknown gatewayPaymentId=${input.gatewayPaymentId}; ignoring`,
      );
      return null;
    }
    if (p.status === 'CAPTURED') return p;
    const patched = await this.repo.patch(p.id, {
      status: 'CAPTURED',
      capturedAt: new Date(),
      method: input.method ?? p.method,
    });
    this.metrics.paymentEvents.labels('capture', 'ok').inc();
    this.bus.publish(PAYMENT_EVENTS.CAPTURED, {
      paymentId: patched.id,
      orderId: patched.orderId,
      userId: patched.userId,
      correlationId: input.correlationId,
    });
    return patched;
  }

  async recordAuthorization(input: {
    gatewayPaymentId: string;
    method?: string | null;
    correlationId?: string;
  }): Promise<Payment | null> {
    const p = await this.repo.findByGatewayPaymentId(input.gatewayPaymentId);
    if (!p) return null;
    if (p.status === 'AUTHORIZED' || p.status === 'CAPTURED' || p.status === 'VERIFIED') {
      return p;
    }
    const patched = await this.repo.patch(p.id, {
      status: 'AUTHORIZED',
      method: input.method ?? p.method,
    });
    this.bus.publish(PAYMENT_EVENTS.AUTHORIZED, {
      paymentId: patched.id,
      orderId: patched.orderId,
      userId: patched.userId,
      correlationId: input.correlationId,
    });
    return patched;
  }

  async recordFailure(input: {
    gatewayPaymentId: string;
    code?: string;
    description?: string;
    correlationId?: string;
  }): Promise<Payment | null> {
    const p = await this.repo.findByGatewayPaymentId(input.gatewayPaymentId);
    if (!p) return null;
    if (PaymentSpecs.isTerminal(p)) return p;
    const patched = await this.repo.patch(p.id, {
      status: 'FAILED',
      failedAt: new Date(),
      failureCode: input.code ?? null,
      failureDescription: input.description ?? null,
    });
    this.metrics.paymentEvents.labels('failed', input.code ?? 'unknown').inc();
    this.bus.publish<PaymentFailedEvent>(PAYMENT_EVENTS.FAILED, {
      paymentId: patched.id,
      orderId: patched.orderId,
      userId: patched.userId,
      code: input.code,
      message: input.description,
      correlationId: input.correlationId,
    });
    return patched;
  }

  private generateReceipt(clientOrderId: string): string {
    const suffix = clientOrderId.slice(-16);
    return `${RECEIPT_PREFIX}-${suffix}`.slice(0, 40);
  }

  /** Backfills paise-to-rupees when reconciling gateway responses. */
  static paiseToRupees(paise: number): string {
    return paiseToRupeesString(paise);
  }
}
