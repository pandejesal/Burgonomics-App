import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@common/decorators/public.decorator';
import { OffersService } from '../services/offers.service';
import { OfferMapper } from '../mappers/offer.mapper';
import { ListOffersQueryDto, OfferResponseDto, ValidateCouponDto } from '../dto';

@ApiTags('Offers')
@Public()
@Controller({ path: 'offers', version: '1' })
export class OffersController {
  constructor(private readonly svc: OffersService) {}

  @Get()
  @ApiOperation({ summary: 'List offers (active, store/category/product filters)' })
  @ApiOkResponse({ type: [OfferResponseDto] })
  async list(@Query() q: ListOffersQueryDto): Promise<OfferResponseDto[]> {
    const items = await this.svc.list(q);
    return items.map(OfferMapper.toResponse);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single offer' })
  @ApiOkResponse({ type: OfferResponseDto })
  async get(@Param('id') id: string): Promise<OfferResponseDto> {
    return OfferMapper.toResponse(await this.svc.get(id));
  }

  @Post('validate-coupon')
  @ApiOperation({ summary: 'Validate a coupon code (offer-level checks only)' })
  @ApiOkResponse({ type: OfferResponseDto })
  async validate(@Body() body: ValidateCouponDto): Promise<OfferResponseDto> {
    return OfferMapper.toResponse(await this.svc.validateCoupon(body));
  }
}
