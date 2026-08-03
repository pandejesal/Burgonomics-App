import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { OrderTrackingService } from '../services/order-tracking.service';
import { OrdersService } from '../services/orders.service';
import { OrderMapper } from '../mappers/order.mapper';
import { OrderTimelineResponseDto } from '../dto';

@ApiTags('Order Tracking')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'orders', version: '1' })
export class OrderTrackingController {
  constructor(
    private readonly tracking: OrderTrackingService,
    private readonly orders: OrdersService,
  ) {}

  @Get(':id/timeline')
  @ApiOperation({ summary: 'Fetch the event timeline and ETA for an order' })
  async timeline(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<OrderTimelineResponseDto> {
    // Authorization: must belong to caller.
    await this.orders.getForUser(id, userId);
    const { order, etaAt } = await this.tracking.timeline(id);
    return OrderMapper.toTimeline(order, etaAt);
  }
}
