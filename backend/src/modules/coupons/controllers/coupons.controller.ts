import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { Public } from '@common/decorators/public.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { CartService } from '@modules/cart/services/cart.service';
import { CouponsService } from '../services/coupons.service';
import { CouponValidatorService } from '../services/coupon-validator.service';
import { CouponMapper } from '../mappers/coupon.mapper';
import {
  CouponResponseDto,
  CouponValidationResponseDto,
  ListCouponsQueryDto,
  ValidateCouponDto,
} from '../dto';

@ApiTags('Coupons')
@Controller({ path: 'coupons', version: '1' })
export class CouponsController {
  constructor(
    private readonly svc: CouponsService,
    private readonly validator: CouponValidatorService,
    private readonly cart: CartService,
  ) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'List active coupons' })
  async list(@Query() q: ListCouponsQueryDto) {
    const { items, total } = await this.svc.list(q);
    return {
      items: items.map(CouponMapper.toResponse),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  @Post('validate')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Validate a coupon code against the current cart' })
  async validate(
    @CurrentUser('id') userId: string | undefined,
    @Body() body: ValidateCouponDto,
  ): Promise<CouponValidationResponseDto> {
    const cart = body.cartId ? await this.cart.getById(body.cartId) : null;
    const result = await this.validator.validate({
      code: body.code,
      userId,
      storeId: body.storeId ?? cart?.storeId ?? undefined,
      cart,
    });
    return {
      valid: result.valid,
      reason: result.reason,
      coupon: result.coupon ? CouponMapper.toResponse(result.coupon) : undefined,
      estimatedDiscount: result.estimatedDiscount,
    } as CouponResponseDto & CouponValidationResponseDto;
  }
}
