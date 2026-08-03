import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { CartService } from '../services/cart.service';
import { CartMapper } from '../mappers/cart.mapper';
import {
  AddCartItemDto,
  CartResponseDto,
  CreateCartDto,
  MergeCartDto,
  UpdateCartItemDto,
  UpdateCartMetaDto,
} from '../dto';
import type { FulfillmentType } from '../entities/cart.entity';

@ApiTags('Cart')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'cart', version: '1' })
export class CartController {
  constructor(private readonly svc: CartService) {}

  @Post()
  @ApiOperation({ summary: 'Get or create the active cart' })
  async open(
    @CurrentUser('id') userId: string | undefined,
    @Body() body: CreateCartDto,
  ): Promise<CartResponseDto> {
    const cart = await this.svc.getOrCreateActive(
      { userId: userId ?? null, anonymousId: body.anonymousId ?? null },
      body.fulfillment as FulfillmentType | undefined,
    );
    return CartMapper.toResponse(cart, this.svc.computeTotals(cart));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch a cart by id' })
  async get(@Param('id') id: string): Promise<CartResponseDto> {
    const cart = await this.svc.getById(id);
    return CartMapper.toResponse(cart, this.svc.computeTotals(cart));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update cart metadata (store, fulfillment, notes)' })
  async update(@Param('id') id: string, @Body() body: UpdateCartMetaDto): Promise<CartResponseDto> {
    const cart = await this.svc.updateMeta(id, {
      storeId: body.storeId,
      fulfillment: body.fulfillment as FulfillmentType | undefined,
      addressId: body.addressId,
      tableNumber: body.tableNumber,
      notes: body.notes,
    });
    return CartMapper.toResponse(cart, this.svc.computeTotals(cart));
  }

  @Post(':id/items')
  @ApiOperation({ summary: 'Add an item to the cart' })
  async addItem(@Param('id') id: string, @Body() body: AddCartItemDto): Promise<CartResponseDto> {
    const cart = await this.svc.addItem(id, {
      productId: body.productId,
      quantity: body.quantity,
      modifiers: body.modifiers ?? [],
      notes: body.notes,
    });
    return CartMapper.toResponse(cart, this.svc.computeTotals(cart));
  }

  @Patch(':id/items/:itemId')
  @ApiOperation({ summary: 'Update a cart item' })
  async updateItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: UpdateCartItemDto,
  ): Promise<CartResponseDto> {
    const cart = await this.svc.updateItem(id, itemId, {
      quantity: body.quantity,
      notes: body.notes,
      modifiers: body.modifiers,
    });
    return CartMapper.toResponse(cart, this.svc.computeTotals(cart));
  }

  @Delete(':id/items/:itemId')
  @ApiOperation({ summary: 'Remove a cart item' })
  async removeItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ): Promise<CartResponseDto> {
    const cart = await this.svc.removeItem(id, itemId);
    return CartMapper.toResponse(cart, this.svc.computeTotals(cart));
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Clear all items in the cart' })
  async clear(@Param('id') id: string): Promise<CartResponseDto> {
    const cart = await this.svc.clear(id);
    return CartMapper.toResponse(cart, this.svc.computeTotals(cart));
  }

  @Post('merge')
  @ApiOperation({ summary: 'Merge an anonymous cart into the authenticated user cart' })
  async merge(
    @CurrentUser('id') userId: string,
    @Body() body: MergeCartDto,
  ): Promise<CartResponseDto> {
    const cart = await this.svc.mergeAnonymousIntoUser(body.anonymousId, userId);
    return CartMapper.toResponse(cart, this.svc.computeTotals(cart));
  }

  @Get(':id/validate')
  @ApiOperation({ summary: 'Validate the cart before checkout' })
  async validate(@Param('id') id: string, @Query('coupon') _coupon?: string) {
    const cart = await this.svc.getById(id);
    return this.svc.validateForCheckout(cart);
  }
}
