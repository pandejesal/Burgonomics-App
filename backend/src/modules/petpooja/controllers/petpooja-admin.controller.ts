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
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { Role } from '@common/enums';
import { PrismaService } from '@infra/prisma/prisma.service';
import { PetpoojaService } from '../services/petpooja.service';
import { PetpoojaAdapter } from '../services/petpooja-adapter.service';
import { PetpoojaCredentialsService } from '../services/petpooja-credentials.service';

/**
 * Admin-only manual controls for the PETPOOJA integration. Every
 * endpoint requires ADMIN/SUPER_ADMIN role. Used for on-call debugging
 * and manual re-sync scenarios.
 */
@ApiTags('PETPOOJA (admin)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller({ path: 'admin/petpooja', version: '1' })
export class PetpoojaAdminController {
  constructor(
    private readonly petpooja: PetpoojaService,
    private readonly adapter: PetpoojaAdapter,
    private readonly credentials: PetpoojaCredentialsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'PETPOOJA integration health snapshot' })
  health() {
    return {
      configured: this.credentials.isConfigured(),
      baseUrl: this.credentials.baseUrl(),
      timeoutMs: this.credentials.timeoutMs(),
      breakers: this.petpooja.breakerStates(),
    };
  }

  @Post('menu/fetch')
  @ApiOperation({ summary: 'Manually pull the mapped menu for a store' })
  async fetchMenu(@Query('petpoojaRestId') restId: string) {
    const menu = await this.petpooja.fetchMenu(restId);
    await this.adapter.ingestPushMenu(menu as never);
    return { ok: true };
  }

  @Post('order/resend')
  @ApiOperation({ summary: 'Manually re-enqueue save_order for an order' })
  async resendOrder(@Body() body: { orderId: string; correlationId?: string }) {
    const job = await this.adapter.enqueueSaveOrder(body.orderId, body.correlationId);
    return { jobId: job.id };
  }

  @Post('order/cancel')
  @ApiOperation({ summary: 'Manually cancel an order in PETPOOJA' })
  async cancelOrder(@Body() body: { orderId: string; reason: string; correlationId?: string }) {
    const job = await this.adapter.enqueueCancelOrder(
      body.orderId,
      body.reason,
      body.correlationId,
    );
    return { jobId: job.id };
  }

  @Post('rider/update')
  @ApiOperation({ summary: 'Push rider status to PETPOOJA' })
  async riderUpdate(
    @Body()
    body: {
      orderId: string;
      status: string;
      riderName: string;
      riderPhone: string;
      correlationId?: string;
    },
  ) {
    const job = await this.adapter.enqueueRiderUpdate(
      body.orderId,
      body.status,
      body.riderName,
      body.riderPhone,
      body.correlationId,
    );
    return { jobId: job.id };
  }

  @Get('webhooks')
  @ApiOperation({ summary: 'List and search recent PETPOOJA webhook events' })
  async getWebhooks(
    @Query('status') status?: string,
    @Query('webhookType') webhookType?: string,
    @Query('limit') limit = '50',
    @Query('offset') offset = '0',
  ) {
    const take = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 250);
    const skip = Math.max(parseInt(offset, 10) || 0, 0);

    const where: any = {};
    if (status) where.status = status;
    if (webhookType) where.webhookType = webhookType;

    const [items, total] = await Promise.all([
      this.prisma.petpoojaWebhookEvent.findMany({
        where,
        orderBy: { receivedAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.petpoojaWebhookEvent.count({ where }),
    ]);

    return { items, total, limit: take, offset: skip };
  }

  @Get('webhooks/:id')
  @ApiOperation({ summary: 'Get details of a single PETPOOJA webhook event' })
  async getWebhookDetails(@Param('id') id: string) {
    const webhook = await this.prisma.petpoojaWebhookEvent.findUnique({
      where: { id },
    });
    if (!webhook) {
      throw new NotFoundException(`Webhook event with ID ${id} not found`);
    }
    return webhook;
  }

  @Post('webhooks/:id/replay')
  @ApiOperation({ summary: 'Manually replay a PETPOOJA webhook event (for DLQ/Failure retry)' })
  async replayWebhook(@Param('id') id: string) {
    const webhook = await this.prisma.petpoojaWebhookEvent.findUnique({
      where: { id },
    });
    if (!webhook) {
      throw new NotFoundException(`Webhook event with ID ${id} not found`);
    }

    // Reset webhook status so it can be re-processed
    await this.prisma.petpoojaWebhookEvent.update({
      where: { id },
      data: {
        status: 'RECEIVED',
        lastError: null,
      },
    });

    const job = await this.adapter.enqueueWebhook(
      webhook.id,
      webhook.webhookType,
      webhook.correlationId ?? undefined,
    );

    return { ok: true, jobId: job.id, status: 'RECEIVED' };
  }
}
