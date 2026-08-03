import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { OrdersService } from '../services/orders.service';
import { OrderMapper } from '../mappers/order.mapper';
import { CancelOrderDto, ListOrdersQueryDto, OrderResponseDto } from '../dto';

@ApiTags('Orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'orders', version: '1' })
export class OrdersController {
  constructor(private readonly svc: OrdersService) {}

  @Get()
  @ApiOperation({ summary: 'List orders for the authenticated user' })
  async list(@CurrentUser('id') userId: string, @Query() q: ListOrdersQueryDto) {
    const { items, total } = await this.svc.list(userId, q);
    return {
      items: items.map(OrderMapper.toResponse),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch order detail' })
  async get(@CurrentUser('id') userId: string, @Param('id') id: string): Promise<OrderResponseDto> {
    const o = await this.svc.getForUser(id, userId);
    return OrderMapper.toResponse(o);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancel an in-progress order' })
  async cancel(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() body: CancelOrderDto,
  ): Promise<OrderResponseDto> {
    const o = await this.svc.cancel(id, userId, body.reason);
    return OrderMapper.toResponse(o);
  }
}
