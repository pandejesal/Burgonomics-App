import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ORDER_STATES, type OrderState } from '../state-machine/order-state';

export class OrderItemModifierResponseDto {
  @ApiProperty() groupId!: string;
  @ApiProperty() groupName!: string;
  @ApiProperty() optionId!: string;
  @ApiProperty() optionName!: string;
  @ApiProperty() priceDelta!: string;
}

export class OrderItemResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() productId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() quantity!: number;
  @ApiProperty() unitPrice!: string;
  @ApiProperty() taxRate!: string;
  @ApiProperty() lineTotal!: string;
  @ApiPropertyOptional() notes?: string | null;
  @ApiProperty({ type: [OrderItemModifierResponseDto] })
  modifiers!: OrderItemModifierResponseDto[];
}

export class OrderEventResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() type!: string;
  @ApiPropertyOptional() fromStatus?: string | null;
  @ApiPropertyOptional() toStatus?: string | null;
  @ApiPropertyOptional() message?: string | null;
  @ApiProperty() createdAt!: Date;
}

export class OrderResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() clientOrderId!: string;
  @ApiPropertyOptional() petpoojaOrderId?: string | null;
  @ApiProperty() userId!: string;
  @ApiProperty() storeId!: string;
  @ApiPropertyOptional() addressId?: string | null;
  @ApiProperty() fulfillment!: string;
  @ApiProperty({ enum: ORDER_STATES }) status!: OrderState;
  @ApiPropertyOptional() tableNumber?: string | null;
  @ApiProperty() currency!: string;
  @ApiProperty() subtotal!: string;
  @ApiProperty() itemDiscount!: string;
  @ApiProperty() offerDiscount!: string;
  @ApiProperty() couponDiscount!: string;
  @ApiPropertyOptional() couponCode?: string | null;
  @ApiProperty() taxes!: string;
  @ApiProperty() packingFee!: string;
  @ApiProperty() deliveryFee!: string;
  @ApiProperty() serviceCharge!: string;
  @ApiProperty() roundOff!: string;
  @ApiProperty() grandTotal!: string;
  @ApiPropertyOptional() customerNotes?: string | null;
  @ApiPropertyOptional() paymentReference?: string | null;
  @ApiPropertyOptional() prepEtaMinutes?: number | null;
  @ApiProperty() placedAt!: Date;
  @ApiPropertyOptional() acceptedAt?: Date | null;
  @ApiPropertyOptional() readyAt?: Date | null;
  @ApiPropertyOptional() dispatchedAt?: Date | null;
  @ApiPropertyOptional() deliveredAt?: Date | null;
  @ApiPropertyOptional() cancelledAt?: Date | null;
  @ApiPropertyOptional() cancellationReason?: string | null;
  @ApiProperty({ type: [OrderItemResponseDto] }) items!: OrderItemResponseDto[];
  @ApiProperty({ type: [OrderEventResponseDto] }) events!: OrderEventResponseDto[];
}

export class ListOrdersQueryDto {
  @ApiPropertyOptional({ enum: ORDER_STATES })
  @IsOptional()
  @IsEnum(ORDER_STATES)
  status?: OrderState;
  @ApiPropertyOptional() @IsOptional() @IsString() storeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional({ enum: ['placedAt', 'grandTotal'] })
  @IsOptional()
  @IsString()
  sortBy?: 'placedAt' | 'grandTotal';
  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsString()
  sortDir?: 'asc' | 'desc';
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page: number = 1;
  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}

export class CancelOrderDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(240) reason?: string;
}

export class OrderTimelineResponseDto {
  @ApiProperty() orderId!: string;
  @ApiProperty({ enum: ORDER_STATES }) currentStatus!: OrderState;
  @ApiPropertyOptional() estimatedCompletionAt?: Date | null;
  @ApiProperty({ type: [OrderEventResponseDto] })
  events!: OrderEventResponseDto[];
}
