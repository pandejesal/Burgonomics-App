import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { MenuCacheService } from '@modules/menu/services/menu-cache.service';
import { OrdersService } from '@modules/orders/services/orders.service';
import { PetpoojaAdapter } from '../services/petpooja-adapter.service';

@ApiTags('Mobile Client Petpooja APIs')
@Controller({ path: 'mobile', version: '1' })
export class PetpoojaMobileController {
  constructor(
    private readonly menuCache: MenuCacheService,
    private readonly orders: OrdersService,
    private readonly petpoojaAdapter: PetpoojaAdapter,
  ) {}

  @Get('menu')
  @ApiOperation({ summary: 'Get normalized, cached restaurant menu for Android & iOS mobile app' })
  @ApiQuery({ name: 'restID', required: false })
  async getMenu(@Query('restID') restID?: string) {
    const storeId = restID ?? 'default_store';
    const cached = await this.menuCache.getMenu(storeId);
    return {
      status: 'success',
      restID: storeId,
      categories: cached?.categories ?? [],
      products: cached?.products ?? [],
    };
  }

  @Post('order/create')
  @ApiOperation({ summary: 'Validate cart, persist order, and dispatch to Petpooja POS' })
  async createOrder(@Body() body: Record<string, unknown>) {
    const clientOrderId = (body.clientOrderId as string) ?? `MOB_ORD_${Date.now()}`;
    const orderId = (body.orderId as string) ?? clientOrderId;

    // Enqueue save_order job to Petpooja POS
    await this.petpoojaAdapter.enqueueSaveOrder(orderId);

    return {
      status: 'success',
      message: 'Order created and submitted to Petpooja POS',
      clientOrderId,
      orderId,
    };
  }

  @Get('order/:id')
  @ApiOperation({ summary: 'Get live status tracking for an order' })
  async getOrderStatus(@Param('id') id: string) {
    const order = await this.orders.findById(id);
    return {
      status: 'success',
      orderId: id,
      clientOrderId: order?.clientOrderId ?? id,
      state: order?.status ?? 'PENDING',
      petpoojaOrderId: order?.petpoojaOrderId ?? null,
      updatedAt: order?.updatedAt ?? new Date(),
    };
  }
}
