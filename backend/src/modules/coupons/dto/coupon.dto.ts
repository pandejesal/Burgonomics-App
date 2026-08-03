import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CouponResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() title!: string;
  @ApiPropertyOptional() description?: string | null;
  @ApiProperty() discountKind!: string;
  @ApiProperty() discountValue!: string;
  @ApiPropertyOptional() maxDiscount?: string | null;
  @ApiPropertyOptional() minOrderValue?: string | null;
  @ApiProperty() requiresLogin!: boolean;
  @ApiProperty() isActive!: boolean;
  @ApiPropertyOptional() startsAt?: Date | null;
  @ApiPropertyOptional() endsAt?: Date | null;
}

export class ValidateCouponDto {
  @ApiProperty() @IsString() code!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() storeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() cartId?: string;
}

export class CouponValidationResponseDto {
  @ApiProperty() valid!: boolean;
  @ApiPropertyOptional() reason?: string;
  @ApiPropertyOptional() coupon?: CouponResponseDto;
  @ApiPropertyOptional() estimatedDiscount?: string;
}

export class ListCouponsQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() storeId?: string;
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
