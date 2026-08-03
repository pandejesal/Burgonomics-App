import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { QUEUE_NAMES } from '@infra/queue/queue.constants';
import { PrismaService } from '@infra/prisma/prisma.service';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { Role } from '@common/enums';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { PaymentsService } from '../services/payments.service';
import { RefundsService } from '../services/refunds.service';
import { RazorpayGatewayService } from '../services/razorpay-gateway.service';
import { PaymentMapper } from '../mappers/payment.mapper';
import { CreateRefundDto } from '../dto/payments.dto';

/**
 * Ops-only endpoints for the Payments platform. Admin-scoped.
 */
@ApiTags('Payments Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller({ path: 'admin/payments', version: '1' })
export class PaymentsAdminController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly refunds: RefundsService,
    private readonly gateway: RazorpayGatewayService,
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.PAYMENTS_WEBHOOK_PROCESS) private readonly webhookQueue: Queue,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Razorpay circuit-breaker health' })
  breakers() {
    return {
      gateway: 'razorpay',
      breakers: this.gateway.breakerStates(),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch any payment by id (admin)' })
  async fetch(@Param('id') id: string) {
    const p = await this.payments.getById(id);
    return PaymentMapper.toResponse(p);
  }

  @Post('refunds')
  @ApiOperation({ summary: 'Admin-initiated refund' })
  async refund(@CurrentUser('id') adminId: string, @Body() body: CreateRefundDto) {
    const refund = await this.refunds.createRefund({
      paymentId: body.paymentId,
      amount: body.amount,
      reason: body.reason ?? 'admin_manual',
      speed: body.speed,
      requestedBy: adminId,
    });
    return PaymentMapper.toRefundResponse(refund);
  }

  @Get('webhooks')
  @ApiOperation({ summary: 'List and search recent payment webhook events' })
  async getWebhooks(
    @Query('status') status?: string,
    @Query('eventType') eventType?: string,
    @Query('limit') limit = '50',
    @Query('offset') offset = '0',
  ) {
    const take = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 250);
    const skip = Math.max(parseInt(offset, 10) || 0, 0);

    const where: any = {};
    if (status) where.status = status;
    if (eventType) where.eventType = eventType;

    const [items, total] = await Promise.all([
      this.prisma.paymentWebhookEvent.findMany({
        where,
        orderBy: { receivedAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.paymentWebhookEvent.count({ where }),
    ]);

    return { items, total, limit: take, offset: skip };
  }

  @Get('webhooks/:id')
  @ApiOperation({ summary: 'Get details of a single payment webhook event' })
  async getWebhookDetails(@Param('id') id: string) {
    const webhook = await this.prisma.paymentWebhookEvent.findUnique({
      where: { id },
    });
    if (!webhook) {
      throw new NotFoundException(`Webhook event with ID ${id} not found`);
    }
    return webhook;
  }

  @Post('webhooks/:id/replay')
  @ApiOperation({ summary: 'Manually replay a payment webhook event (for DLQ/Failure retry)' })
  async replayWebhook(@Param('id') id: string) {
    const webhook = await this.prisma.paymentWebhookEvent.findUnique({
      where: { id },
    });
    if (!webhook) {
      throw new NotFoundException(`Webhook event with ID ${id} not found`);
    }

    // Reset webhook status so it can be re-processed
    await this.prisma.paymentWebhookEvent.update({
      where: { id },
      data: {
        status: 'RECEIVED',
        lastError: null,
      },
    });

    const eventType = webhook.eventType;
    const webhookEventId = webhook.id;
    const correlationId = webhook.correlationId ?? undefined;

    await this.webhookQueue.add(
      eventType,
      { webhookEventId, eventType, correlationId },
      {
        jobId: `payment-webhook-replay:${webhookEventId}:${Date.now()}`,
        attempts: 8,
        backoff: { type: 'exponential', delay: 3_000 },
        removeOnComplete: { age: 3_600, count: 1000 },
        removeOnFail: { age: 7 * 24 * 3_600 },
      },
    );

    return { ok: true, status: 'RECEIVED' };
  }
}
