import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { PetpoojaWebhookGuard } from '../guards/petpooja-webhook.guard';
import { PetpoojaAdapter } from '../services/petpooja-adapter.service';
import { WebhookProcessorService } from '../services/webhook-processor.service';
import { PETPOOJA_WEBHOOK_TYPES } from '../constants';
import { GetStoreStatusWebhookSchema, type GetStoreStatusResponse } from '../dto/petpooja.dto';

/**
 * Inbound webhook listener under exact specification path `/api/v1/petpooja/webhook/*`.
 */
@ApiTags('PETPOOJA Webhooks (Direct Spec Path)')
@Controller({ path: 'petpooja/webhook', version: '1' })
@UseGuards(PetpoojaWebhookGuard)
export class PetpoojaDirectWebhookController {
  constructor(
    private readonly adapter: PetpoojaAdapter,
    private readonly processor: WebhookProcessorService,
  ) {}

  @Post(['menu-push', 'menu'])
  @HttpCode(200)
  @ApiOperation({ summary: 'Petpooja Menu Push Webhook' })
  async pushMenu(
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ): Promise<{ status: string; message: string; webhookEventId: string }> {
    const res = await this.receive(PETPOOJA_WEBHOOK_TYPES.PUSH_MENU, body, req);
    return {
      status: 'success',
      message: 'Menu synchronized successfully',
      webhookEventId: res.webhookEventId,
    };
  }

  @Post(['order-status', 'order-callback'])
  @HttpCode(200)
  @ApiOperation({ summary: 'Petpooja Order Status Webhook' })
  async orderStatus(@Body() body: Record<string, unknown>, @Req() req: Request) {
    const res = await this.receive(PETPOOJA_WEBHOOK_TYPES.ORDER_CALLBACK, body, req);
    return {
      status: 'success',
      message: 'Order status callback processed successfully',
      webhookEventId: res.webhookEventId,
    };
  }

  @Post(['stock-status', 'stock-update'])
  @HttpCode(200)
  @ApiOperation({ summary: 'Petpooja Stock and Store Status Webhook' })
  async stockStatus(@Body() body: Record<string, unknown>, @Req() req: Request) {
    const res = await this.receive(PETPOOJA_WEBHOOK_TYPES.STOCK_UPDATE, body, req);
    return {
      status: 'success',
      message: 'Stock status updated successfully',
      webhookEventId: res.webhookEventId,
    };
  }

  @Post('get-store-status')
  @HttpCode(200)
  @ApiOperation({ summary: 'Petpooja Probe Store Status' })
  async getStoreStatus(@Body() body: Record<string, unknown>): Promise<GetStoreStatusResponse> {
    const parsed = GetStoreStatusWebhookSchema.parse(body);
    return this.adapter.computeStoreStatusResponse(parsed.restID);
  }

  private async receive(webhookType: string, body: Record<string, unknown>, req: Request) {
    const signature = (req.headers['x-petpooja-signature'] as string | undefined) ?? null;
    const correlationId = (req.headers['x-correlation-id'] as string | undefined) ?? undefined;
    const { webhookEventId } = await this.processor.accept(
      webhookType,
      body,
      signature,
      correlationId,
    );
    await this.adapter.enqueueWebhook(webhookEventId, webhookType, correlationId);
    return {
      status: 'success',
      message: 'accepted',
      webhookEventId,
    };
  }
}
