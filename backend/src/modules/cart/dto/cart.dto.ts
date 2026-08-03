import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export enum FulfillmentTypeDto {
  DELIVERY = 'DELIVERY',
  TAKEAWAY = 'TAKEAWAY',
  DINE_IN = 'DINE_IN',
}

export class CartItemModifierResponseDto {
  @ApiProperty() groupId!: string;
  @ApiProperty() groupName!: string;
  @ApiProperty() optionId!: string;
  @ApiProperty() optionName!: string;
  @ApiProperty() priceDelta!: string;
}

export class CartItemResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() productId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() quantity!: number;
  @ApiProperty() unitPrice!: string;
  @ApiProperty() taxRate!: string;
  @ApiProperty() lineSubtotal!: string;
  @ApiProperty({ type: [CartItemModifierResponseDto] })
  modifiers!: CartItemModifierResponseDto[];
  @ApiPropertyOptional() notes?: string | null;
}

export class CartTotalsDto {
  @ApiProperty() subtotal!: string;
  @ApiProperty() itemDiscount!: string;
  @ApiProperty() offerDiscount!: string;
  @ApiProperty() couponDiscount!: string;
  @ApiProperty() taxes!: string;
  @ApiProperty() packingFee!: string;
  @ApiProperty() deliveryFee!: string;
  @ApiProperty() serviceCharge!: string;
  @ApiProperty() roundOff!: string;
  @ApiProperty() grandTotal!: string;
  @ApiProperty() currency!: string;
}

export class CartResponseDto {
  @ApiProperty() id!: string;
  @ApiPropertyOptional() userId?: string | null;
  @ApiPropertyOptional() anonymousId?: string | null;
  @ApiPropertyOptional() storeId?: string | null;
  @ApiProperty({ enum: FulfillmentTypeDto }) fulfillment!: FulfillmentTypeDto;
  @ApiPropertyOptional() addressId?: string | null;
  @ApiPropertyOptional() tableNumber?: string | null;
  @ApiProperty() status!: string;
  @ApiProperty() currency!: string;
  @ApiPropertyOptional() notes?: string | null;
  @ApiProperty({ type: [CartItemResponseDto] }) items!: CartItemResponseDto[];
  @ApiProperty({ type: CartTotalsDto }) totals!: CartTotalsDto;
  @ApiPropertyOptional() expiresAt?: Date | null;
}

export class CreateCartDto {
  @ApiPropertyOptional() @IsOptional() @IsString() storeId?: string;
  @ApiPropertyOptional({ enum: FulfillmentTypeDto })
  @IsOptional()
  @IsEnum(FulfillmentTypeDto)
  fulfillment?: FulfillmentTypeDto;
  @ApiPropertyOptional() @IsOptional() @IsString() anonymousId?: string;
}

export class ModifierSelectionDto {
  @ApiProperty() @IsString() groupId!: string;
  @ApiProperty() @IsString() optionId!: string;
}

export class AddCartItemDto {
  @ApiProperty() @IsString() productId!: string;
  @ApiProperty({ default: 1 }) @IsInt() @Min(1) @Max(50) quantity!: number;
  @ApiPropertyOptional({ type: [ModifierSelectionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ModifierSelectionDto)
  modifiers?: ModifierSelectionDto[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(240) notes?: string;
}

export class UpdateCartItemDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(50) quantity?: number;
  @ApiPropertyOptional({ type: [ModifierSelectionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ModifierSelectionDto)
  modifiers?: ModifierSelectionDto[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(240) notes?: string;
}

export class UpdateCartMetaDto {
  @ApiPropertyOptional() @IsOptional() @IsString() storeId?: string;
  @ApiPropertyOptional({ enum: FulfillmentTypeDto })
  @IsOptional()
  @IsEnum(FulfillmentTypeDto)
  fulfillment?: FulfillmentTypeDto;
  @ApiPropertyOptional() @IsOptional() @IsString() addressId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() tableNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(240) notes?: string;
}

export class MergeCartDto {
  @ApiProperty() @IsString() anonymousId!: string;
}

export class CartValidationIssueDto {
  @ApiProperty() code!: string;
  @ApiProperty() message!: string;
  @ApiPropertyOptional() itemId?: string;
}

export class CartValidationResponseDto {
  @ApiProperty() valid!: boolean;
  @ApiProperty({ type: [CartValidationIssueDto] })
  issues!: CartValidationIssueDto[];
}
