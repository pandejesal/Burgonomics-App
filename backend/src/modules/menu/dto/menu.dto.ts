import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { CategoryResponseDto } from '../../categories/dto';
import { ProductResponseDto } from '../../products/dto';
import { ModifierGroupResponseDto } from '../../modifiers/dto';

export enum MenuChannel {
  DELIVERY = 'DELIVERY',
  TAKEAWAY = 'TAKEAWAY',
  DINE_IN = 'DINE_IN',
}

export enum MenuDaypart {
  ALL = 'ALL',
  BREAKFAST = 'BREAKFAST',
  LUNCH = 'LUNCH',
  DINNER = 'DINNER',
}

export class MenuQueryDto {
  @ApiProperty() @IsString() storeId!: string;
  @ApiPropertyOptional({ enum: MenuChannel })
  @IsOptional()
  @IsEnum(MenuChannel)
  channel?: MenuChannel;
  @ApiPropertyOptional({ enum: MenuDaypart })
  @IsOptional()
  @IsEnum(MenuDaypart)
  daypart?: MenuDaypart;
}

export class MenuCategorySectionDto {
  @ApiProperty({ type: CategoryResponseDto }) category!: CategoryResponseDto;
  @ApiProperty({ type: [ProductResponseDto] }) products!: ProductResponseDto[];
}

export class MenuResponseDto {
  @ApiProperty() storeId!: string;
  @ApiProperty() channel!: MenuChannel;
  @ApiProperty() daypart!: MenuDaypart;
  @ApiProperty() generatedAt!: string;
  @ApiProperty() version!: string;
  @ApiProperty({ type: [MenuCategorySectionDto] }) sections!: MenuCategorySectionDto[];
  @ApiProperty({ type: [ModifierGroupResponseDto] }) modifierGroups!: ModifierGroupResponseDto[];
}

export class MenuRefreshDto {
  @ApiPropertyOptional() @IsOptional() @IsString() storeId?: string;
  @ApiPropertyOptional({
    enum: ['FULL', 'CATEGORIES', 'PRODUCTS', 'MODIFIERS', 'OFFERS', 'STOCK', 'STORE_STATUS'],
  })
  @IsOptional()
  @IsIn(['FULL', 'CATEGORIES', 'PRODUCTS', 'MODIFIERS', 'OFFERS', 'STOCK', 'STORE_STATUS'])
  scope?: 'FULL' | 'CATEGORIES' | 'PRODUCTS' | 'MODIFIERS' | 'OFFERS' | 'STOCK' | 'STORE_STATUS';
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  force?: boolean;
}
