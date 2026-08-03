import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { FulfillmentTypeDto } from '@modules/cart/dto/cart.dto';
import { PricingSnapshotDto } from '@modules/pricing/dto/pricing.dto';

export class StartCheckoutDto {
  @ApiProperty() @IsString() cartId!: string;
  @ApiPropertyOptional({ enum: FulfillmentTypeDto })
  @IsOptional()
  @IsEnum(FulfillmentTypeDto)
  fulfillment?: FulfillmentTypeDto;
  @ApiPropertyOptional() @IsOptional() @IsString() addressId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() tableNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) couponCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(240) customerNotes?: string;
}

export class CheckoutIssueDto {
  @ApiProperty() code!: string;
  @ApiProperty() message!: string;
  @ApiPropertyOptional() itemId?: string;
}

export class CheckoutSessionResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() cartId!: string;
  @ApiProperty() status!: string;
  @ApiProperty() storeId!: string;
  @ApiProperty() fulfillment!: string;
  @ApiPropertyOptional() addressId?: string | null;
  @ApiPropertyOptional() tableNumber?: string | null;
  @ApiPropertyOptional() couponCode?: string | null;
  @ApiPropertyOptional() prepEtaMinutes?: number | null;
  @ApiPropertyOptional({ type: PricingSnapshotDto }) pricing?: PricingSnapshotDto;
  @ApiProperty({ type: [CheckoutIssueDto] }) issues!: CheckoutIssueDto[];
  @ApiProperty() expiresAt!: Date;
}
