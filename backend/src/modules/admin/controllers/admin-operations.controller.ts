import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions, PERMISSIONS } from '@modules/rbac';
import { Audit } from '@modules/audit';
import { ZodValidationPipe } from '@common/pipes';
import { QueueOpsService } from '../services/queue-ops.service';
import { WebhookOpsService, type WebhookGateway } from '../services/webhook-ops.service';
import { PaymentOpsService } from '../services/payment-ops.service';
import type { QueueName } from '@infra/queue/queue.constants';
import {
  listPaymentsQuerySchema,
  queueActionSchema,
  type ListPaymentsQueryDto,
  type QueueActionDto,
} from '../dto';

/**
 * Aggregated operations surface: queues, webhooks, payments, refunds.
 * Split intentionally kept flat — auditors want a single controller
 * to reason about mutating side-effects.
 */
@ApiTags('Admin Operations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller({ path: 'admin/ops', version: '1' })
export class AdminOperationsController {
  constructor(
    private readonly queues: QueueOpsService,
    private readonly webhooks: WebhookOpsService,
    private readonly payments: PaymentOpsService,
  ) {}

  // ── Queues ────────────────────────────────────────────────
  @Get('queues')
  @RequirePermissions(PERMISSIONS.QUEUES_READ)
  @ApiOperation({ summary: 'List all queue statistics' })
  listQueueStats() {
    return this.queues.statsAll();
  }

  @Get('queues/:name')
  @RequirePermissions(PERMISSIONS.QUEUES_READ)
  @ApiOperation({ summary: 'Stats for a single queue' })
  queueStats(@Param('name') name: QueueName) {
    return this.queues.stats(name);
  }

  @Get('queues/:name/failed')
  @RequirePermissions(PERMISSIONS.QUEUES_READ)
  @ApiOperation({ summary: 'List failed jobs on a queue' })
  failedJobs(@Param('name') name: QueueName) {
    return this.queues.listFailed(name);
  }

  @Post('queues/:name/pause')
  @RequirePermissions(PERMISSIONS.QUEUES_MANAGE)
  @Audit({ action: 'queue.pause', resourceType: 'queue' })
  @ApiOperation({ summary: 'Pause a queue' })
  pauseQueue(@Param('name') name: QueueName) {
    return this.queues.pause(name).then(() => ({ ok: true }));
  }

  @Post('queues/:name/resume')
  @RequirePermissions(PERMISSIONS.QUEUES_MANAGE)
  @Audit({ action: 'queue.resume', resourceType: 'queue' })
  @ApiOperation({ summary: 'Resume a queue' })
  resumeQueue(@Param('name') name: QueueName) {
    return this.queues.resume(name).then(() => ({ ok: true }));
  }

  @Post('queues/:name/retry-failed')
  @RequirePermissions(PERMISSIONS.QUEUES_MANAGE)
  @Audit({ action: 'queue.retry-failed', resourceType: 'queue' })
  @ApiOperation({ summary: 'Retry failed jobs (all or specific ids)' })
  retryFailed(
    @Param('name') name: QueueName,
    @Body(new ZodValidationPipe(queueActionSchema)) body: QueueActionDto,
  ) {
    return this.queues.retryFailed(name, body.jobIds).then((retried) => ({ retried }));
  }

  @Post('queues/:name/replay-dlq')
  @RequirePermissions(PERMISSIONS.QUEUES_MANAGE)
  @Audit({ action: 'queue.replay-dlq', resourceType: 'queue' })
  @ApiOperation({ summary: 'Replay dead-letter jobs back to the primary queue' })
  replayDlq(@Param('name') name: QueueName) {
    return this.queues.replayDlq(name);
  }

  @Delete('queues/:name/jobs/:jobId')
  @RequirePermissions(PERMISSIONS.QUEUES_MANAGE)
  @Audit({ action: 'queue.cancel-job', resourceType: 'queue' })
  @ApiOperation({ summary: 'Cancel a single job' })
  cancelJob(@Param('name') name: QueueName, @Param('jobId') jobId: string) {
    return this.queues.cancel(name, jobId).then((ok) => ({ ok }));
  }

  // ── Webhooks ──────────────────────────────────────────────
  @Get('webhooks/:gateway')
  @RequirePermissions(PERMISSIONS.WEBHOOKS_READ)
  @ApiOperation({ summary: 'Webhook history for a gateway' })
  listWebhooks(
    @Param('gateway') gateway: WebhookGateway,
    @Query('status') status?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    return this.webhooks.list({
      gateway,
      status,
      page: Math.max(1, Number(page)),
      pageSize: Math.min(100, Math.max(1, Number(pageSize))),
    });
  }

  @Get('webhooks/:gateway/:id')
  @RequirePermissions(PERMISSIONS.WEBHOOKS_READ)
  @ApiOperation({ summary: 'Inspect a single webhook payload' })
  getWebhook(@Param('gateway') gateway: WebhookGateway, @Param('id') id: string) {
    return this.webhooks.get(gateway, id);
  }

  @Post('webhooks/:gateway/:id/replay')
  @RequirePermissions(PERMISSIONS.WEBHOOKS_REPLAY)
  @Audit({ action: 'webhook.replay', resourceType: 'webhook' })
  @ApiOperation({ summary: 'Replay a webhook back through the processor' })
  replayWebhook(@Param('gateway') gateway: WebhookGateway, @Param('id') id: string) {
    return this.webhooks.replay(gateway, id);
  }

  // ── Payments monitoring ───────────────────────────────────
  @Get('payments')
  @RequirePermissions(PERMISSIONS.PAYMENTS_READ)
  @ApiOperation({ summary: 'Search payments' })
  searchPayments(@Query(new ZodValidationPipe(listPaymentsQuerySchema)) q: ListPaymentsQueryDto) {
    return this.payments.search(q);
  }

  @Get('payments/duplicates')
  @RequirePermissions(PERMISSIONS.PAYMENTS_READ)
  @ApiOperation({ summary: 'Detect duplicate in-flight payments' })
  duplicates(@Query('windowMinutes') minutes = '60') {
    return this.payments.detectDuplicates(Number(minutes) || 60);
  }

  @Get('payments/reconcile')
  @RequirePermissions(PERMISSIONS.PAYMENTS_RECONCILE)
  @ApiOperation({ summary: 'Reconciliation window summary' })
  reconcile(@Query('from') from: string, @Query('to') to: string) {
    return this.payments.reconcile(new Date(from), new Date(to));
  }

  @Get('refunds')
  @RequirePermissions(PERMISSIONS.PAYMENTS_READ)
  @ApiOperation({ summary: 'Recent refunds' })
  refunds(@Query('limit') limit = '50') {
    return this.payments.recentRefunds(Math.min(200, Number(limit) || 50));
  }
}
