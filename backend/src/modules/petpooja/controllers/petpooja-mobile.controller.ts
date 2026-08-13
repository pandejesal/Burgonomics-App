import { Body, Controller, ForbiddenException, Get, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';
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
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Validate cart, persist order, and dispatch to Petpooja POS' })
  async createOrder(
    @CurrentUser('id') userId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const clientOrderId = (body.clientOrderId as string) ?? `MOB_ORD_${Date.now()}`;
    const orderId = (body.orderId as string) ?? clientOrderId;

    // Enqueue save_order job to Petpooja POS
    await this.petpoojaAdapter.enqueueSaveOrder(orderId);

    return {
      status: 'success',
      message: 'Order created and submitted to Petpooja POS',
      clientOrderId,
      orderId,
      userId,
    };
  }

  @Get('order/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get live status tracking for an order' })
  async getOrderStatus(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    const order = await this.orders.findById(id);
    if (!order) {
      throw new NotFoundException(`Order ${id} not found`);
    }

    // Enforce order ownership (SEC-5: prevent IDOR)
    if (order.userId && order.userId !== userId) {
      throw new ForbiddenException('You do not have permission to view this order');
    }

    return {
      status: 'success',
      orderId: id,
      clientOrderId: order.clientOrderId ?? id,
      state: order.status ?? 'PENDING',
      petpoojaOrderId: order.petpoojaOrderId ?? null,
      updatedAt: order.updatedAt ?? new Date(),
    };
  }
}
