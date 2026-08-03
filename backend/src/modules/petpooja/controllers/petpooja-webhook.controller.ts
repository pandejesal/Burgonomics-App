import { Body, Controller, HttpCode, Logger, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { PetpoojaWebhookGuard } from '../guards/petpooja-webhook.guard';
import { PetpoojaAdapter } from '../services/petpooja-adapter.service';
import { WebhookProcessorService } from '../services/webhook-processor.service';
import { PETPOOJA_WEBHOOK_TYPES } from '../constants';
import { GetStoreStatusWebhookSchema, type GetStoreStatusResponse } from '../dto/petpooja.dto';

/**
 * PETPOOJA inbound webhook endpoints. All routes:
 *   • Verify authenticity via `PetpoojaWebhookGuard` (HMAC or bearer)
 *   • Persist the raw payload (`PetpoojaWebhookEvent`) for audit
 *   • Enqueue asynchronous processing on the BullMQ webhook queue,
 *     which invokes `WebhookProcessorService.process`
 *
 * The one synchronous handler is `get_store_status`, which PETPOOJA
 * expects to answer inline with the current store state.
 */
@ApiTags('PETPOOJA Webhooks')
@Controller({ path: 'webhooks/petpooja', version: '1' })
@UseGuards(PetpoojaWebhookGuard)
export class PetpoojaWebhookController {
  private readonly logger = new Logger(PetpoojaWebhookController.name);

  constructor(
    private readonly adapter: PetpoojaAdapter,
    private readonly processor: WebhookProcessorService,
  ) {}

  @Post(['menu', 'menu-push'])
  @HttpCode(200)
  @ApiOperation({ summary: 'PETPOOJA push_menu webhook' })
  async pushMenu(
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ): Promise<{ status: string; success: string; message: string; webhookEventId: string }> {
    const res = await this.receive(PETPOOJA_WEBHOOK_TYPES.PUSH_MENU, body, req);
    return {
      status: 'success',
      success: '1',
      message: 'Menu synchronized successfully',
      webhookEventId: res.webhookEventId,
    };
  }

  @Post(['order-callback', 'order-status'])
  @HttpCode(200)
  @ApiOperation({ summary: 'PETPOOJA order state callback' })
  async orderCallback(@Body() body: Record<string, unknown>, @Req() req: Request) {
    const res = await this.receive(PETPOOJA_WEBHOOK_TYPES.ORDER_CALLBACK, body, req);
    return {
      status: 'success',
      success: '1',
      message: 'Order status callback processed successfully',
      webhookEventId: res.webhookEventId,
    };
  }

  @Post(['stock-update', 'stock-status'])
  @HttpCode(200)
  @ApiOperation({ summary: 'PETPOOJA item/addon stock toggle' })
  async stockUpdate(@Body() body: Record<string, unknown>, @Req() req: Request) {
    const res = await this.receive(PETPOOJA_WEBHOOK_TYPES.STOCK_UPDATE, body, req);
    return {
      status: 'success',
      success: '1',
      message: 'Stock status updated successfully',
      webhookEventId: res.webhookEventId,
    };
  }

  @Post('store-status')
  @HttpCode(200)
  @ApiOperation({ summary: 'PETPOOJA merchant-driven store status change' })
  async storeStatus(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.receive(PETPOOJA_WEBHOOK_TYPES.STORE_STATUS, body, req);
  }

  /**
   * Synchronous probe. PETPOOJA sends `{ restID }` and expects the
   * response body to describe our current store availability.
   */
  @Post('get-store-status')
  @HttpCode(200)
  @ApiOperation({ summary: 'PETPOOJA probe for current store status (sync)' })
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
      success: '1',
      message: 'accepted',
      webhookEventId,
    };
  }
}
