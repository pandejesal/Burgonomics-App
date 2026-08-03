import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { CheckoutService } from '../services/checkout.service';
import { CheckoutMapper } from '../mappers/checkout.mapper';
import { CheckoutSessionResponseDto, StartCheckoutDto } from '../dto';

@ApiTags('Checkout')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'checkout', version: '1' })
export class CheckoutController {
  constructor(private readonly svc: CheckoutService) {}

  @Post()
  @ApiOperation({ summary: 'Start or refresh a checkout session for a cart' })
  async start(
    @CurrentUser('id') userId: string,
    @Body() body: StartCheckoutDto,
  ): Promise<CheckoutSessionResponseDto> {
    const { session, pricing, issues } = await this.svc.start(userId, {
      cartId: body.cartId,
      fulfillment: body.fulfillment as 'DELIVERY' | 'TAKEAWAY' | 'DINE_IN' | undefined,
      addressId: body.addressId,
      tableNumber: body.tableNumber,
      couponCode: body.couponCode,
      customerNotes: body.customerNotes,
    });
    return CheckoutMapper.toResponse(session, pricing, issues);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch a checkout session' })
  async get(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<CheckoutSessionResponseDto> {
    const s = await this.svc.get(id, userId);
    return CheckoutMapper.toResponse(s, undefined, []);
  }

  @Post(':id/lock')
  @ApiOperation({ summary: 'Lock a validated checkout session ahead of payment' })
  async lock(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<CheckoutSessionResponseDto> {
    const s = await this.svc.lock(id, userId);
    return CheckoutMapper.toResponse(s, undefined, []);
  }
}
