import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBooleanString, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CategoryResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() description?: string | null;
  @ApiPropertyOptional() imageUrl?: string | null;
  @ApiPropertyOptional() bannerUrl?: string | null;
  @ApiProperty() displayOrder!: number;
  @ApiProperty() isVisible!: boolean;
  @ApiProperty() isAvailable!: boolean;
  @ApiPropertyOptional() parentId?: string | null;
  @ApiPropertyOptional({ type: [Object] }) children?: CategoryResponseDto[];
}

export class ListCategoriesQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() parentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBooleanString() visibleOnly?: string;
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page: number = 1;
  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize: number = 50;
}
