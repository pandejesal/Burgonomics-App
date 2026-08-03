import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBooleanString, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ProductImageResponseDto {
  @ApiProperty() url!: string;
  @ApiPropertyOptional() altText?: string | null;
  @ApiProperty() isPrimary!: boolean;
  @ApiProperty() displayOrder!: number;
}

export class NutritionResponseDto {
  @ApiPropertyOptional() calories?: number | null;
  @ApiPropertyOptional() proteinG?: string | null;
  @ApiPropertyOptional() carbsG?: string | null;
  @ApiPropertyOptional() fatG?: string | null;
  @ApiPropertyOptional() fiberG?: string | null;
  @ApiPropertyOptional() servingSize?: string | null;
}

export class ProductResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() categoryId!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() description?: string | null;
  @ApiPropertyOptional() shortDescription?: string | null;
  @ApiProperty() basePrice!: string;
  @ApiProperty() taxRate!: string;
  @ApiProperty() currency!: string;
  @ApiProperty({ description: 'Domain invariant: always true.' }) isPureVeg!: true;
  @ApiProperty() isAvailable!: boolean;
  @ApiPropertyOptional() prepTimeMinutes?: number | null;
  @ApiProperty({ type: [ProductImageResponseDto] }) images!: ProductImageResponseDto[];
  @ApiProperty({ type: NutritionResponseDto }) nutrition!: NutritionResponseDto;
  @ApiProperty({ type: [String] }) allergens!: string[];
  @ApiProperty({ type: [String] }) tags!: string[];
  @ApiProperty() displayOrder!: number;
  @ApiProperty() isPopular!: boolean;
  @ApiProperty() isRecommended!: boolean;
  @ApiProperty() isBestSeller!: boolean;
  @ApiProperty() isFeatured!: boolean;
  @ApiProperty() isSeasonal!: boolean;
  @ApiPropertyOptional({ type: [String] }) modifierGroupIds?: string[];
}

export class ListProductsQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() categoryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() storeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional() @IsOptional() @IsBooleanString() availableOnly?: string;
  @ApiPropertyOptional() @IsOptional() @IsBooleanString() popular?: string;
  @ApiPropertyOptional() @IsOptional() @IsBooleanString() featured?: string;
  @ApiPropertyOptional() @IsOptional() @IsBooleanString() bestSeller?: string;
  @ApiPropertyOptional() @IsOptional() @IsBooleanString() recommended?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() tag?: string;
  @ApiPropertyOptional({ enum: ['displayOrder', 'name', 'basePrice', 'createdAt'] })
  @IsOptional()
  @IsString()
  sortBy?: 'displayOrder' | 'name' | 'basePrice' | 'createdAt';
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
