import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { OrdersModule } from '@modules/orders/orders.module';
import { QUEUE_NAMES, DEAD_LETTER_SUFFIX } from '@infra/queue/queue.constants';
import { RazorpayCredentialsService } from './services/razorpay-credentials.service';
import { RazorpayHttpClient } from './http/razorpay-http.client';
import { RazorpayGatewayService } from './services/razorpay-gateway.service';
import { RazorpaySignatureVerifier } from './services/razorpay-signature.verifier';
import { PaymentsService } from './services/payments.service';
import { RefundsService } from './services/refunds.service';
import { PaymentWebhookProcessorService } from './services/webhook-processor.service';
import { RazorpayWebhookGuard } from './guards/razorpay-webhook.guard';
import { PaymentsController } from './controllers/payments.controller';
import { PaymentsWebhookController } from './controllers/payments-webhook.controller';
import { PaymentsAdminController } from './controllers/payments-admin.controller';
import { PaymentWebhookConsumer } from './consumers/payment-webhook.consumer';
import { PaymentVerifyConsumer } from './consumers/payment-verify.consumer';
import { RefundConsumer } from './consumers/refund.consumer';
import { PaymentCleanupConsumer } from './consumers/payment-cleanup.consumer';
import { PAYMENT_REPOSITORY } from './repositories/interfaces/payment-repository.interface';
import { REFUND_REPOSITORY } from './repositories/interfaces/refund-repository.interface';
import { PAYMENT_WEBHOOK_REPOSITORY } from './repositories/interfaces/payment-webhook-repository.interface';
import { PaymentPrismaRepository } from './repositories/prisma/payment.prisma-repository';
import { RefundPrismaRepository } from './repositories/prisma/refund.prisma-repository';
import { PaymentWebhookPrismaRepository } from './repositories/prisma/payment-webhook.prisma-repository';
import { RazorpayHealthIndicator } from './health/razorpay.indicator';

/**
 * Payments Module — the ONLY entry point to Razorpay in the platform.
 *
 * Public surface:
 *  • REST controllers (customer + admin)
 *  • Razorpay webhook ingress
 *  • Domain events (`payment.*`, `refund.*`) for cross-module reactions
 *
 * Enforces:
 *  • Repository pattern (services never touch Prisma directly except
 *    for cross-aggregate reads like checkout session / order lookup)
 *  • Idempotency on every mutating endpoint
 *  • Distributed locks on verify + refund to eliminate races
 *  • Signature + replay verification on every webhook
 */
@Module({
  imports: [
    OrdersModule,
    BullModule.registerQueue(
      { name: QUEUE_NAMES.PAYMENTS_VERIFY },
      { name: QUEUE_NAMES.PAYMENTS_WEBHOOK_PROCESS },
      { name: QUEUE_NAMES.PAYMENTS_WEBHOOK_PROCESS + DEAD_LETTER_SUFFIX },
      { name: QUEUE_NAMES.PAYMENTS_REFUND },
      { name: QUEUE_NAMES.PAYMENTS_CLEANUP },
    ),
  ],
  controllers: [PaymentsController, PaymentsWebhookController, PaymentsAdminController],
  providers: [
    RazorpayCredentialsService,
    RazorpayHttpClient,
    RazorpayGatewayService,
    RazorpaySignatureVerifier,
    RazorpayWebhookGuard,
    PaymentsService,
    RefundsService,
    PaymentWebhookProcessorService,
    PaymentWebhookConsumer,
    PaymentVerifyConsumer,
    RefundConsumer,
    PaymentCleanupConsumer,
    RazorpayHealthIndicator,
    PaymentPrismaRepository,
    RefundPrismaRepository,
    PaymentWebhookPrismaRepository,
    { provide: PAYMENT_REPOSITORY, useExisting: PaymentPrismaRepository },
    { provide: REFUND_REPOSITORY, useExisting: RefundPrismaRepository },
    {
      provide: PAYMENT_WEBHOOK_REPOSITORY,
      useExisting: PaymentWebhookPrismaRepository,
    },
  ],
  exports: [PaymentsService, RefundsService, RazorpayCredentialsService, RazorpayHealthIndicator],
})
export class PaymentsModule {}
