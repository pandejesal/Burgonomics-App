import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';

export class OfferResponseDto {
  @ApiProperty() id!: string;
  @ApiPropertyOptional() code?: string | null;
  @ApiProperty() title!: string;
  @ApiPropertyOptional() description?: string | null;
  @ApiProperty() type!: string;
  @ApiProperty() scope!: string;
  @ApiProperty() discountKind!: string;
  @ApiProperty() discountValue!: string;
  @ApiPropertyOptional() maxDiscount?: string | null;
  @ApiPropertyOptional() minOrderValue?: string | null;
  @ApiProperty({ type: [String] }) storeIds!: string[];
  @ApiProperty({ type: [String] }) categoryIds!: string[];
  @ApiProperty({ type: [String] }) productIds!: string[];
  @ApiProperty({ type: [String] }) comboProductIds!: string[];
  @ApiProperty() requiresLogin!: boolean;
  @ApiProperty() requiresCoupon!: boolean;
  @ApiPropertyOptional() startsAt?: string | null;
  @ApiPropertyOptional() endsAt?: string | null;
  @ApiPropertyOptional() bannerUrl?: string | null;
  @ApiProperty() displayOrder!: number;
  @ApiProperty() isActive!: boolean;
}

export class ListOffersQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() storeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() categoryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() productId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() scope?:
    'STORE' | 'CATEGORY' | 'PRODUCT' | 'COMBO' | 'CART';
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  activeOnly?: boolean;
}

export class ValidateCouponDto {
  @ApiProperty() @IsString() code!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() storeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() cartHash?: string;
}
