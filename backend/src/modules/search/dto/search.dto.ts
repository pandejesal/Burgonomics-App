import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export const SEARCH_SCOPES = ['all', 'products', 'categories', 'offers', 'stores'] as const;
export type SearchScope = (typeof SEARCH_SCOPES)[number];

export class SearchQueryDto {
  @ApiProperty() @IsString() @MinLength(1) q!: string;
  @ApiPropertyOptional({ enum: SEARCH_SCOPES })
  @IsOptional()
  @IsIn(SEARCH_SCOPES as unknown as string[])
  scope?: SearchScope;
  @ApiPropertyOptional() @IsOptional() @IsString() storeId?: string;
  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20;
}

export class AutocompleteQueryDto {
  @ApiProperty() @IsString() @MinLength(1) q!: string;
  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(20)
  limit: number = 10;
}

export class SearchResultItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() type!: 'product' | 'category' | 'offer' | 'store';
  @ApiProperty() title!: string;
  @ApiPropertyOptional() subtitle?: string;
  @ApiPropertyOptional() imageUrl?: string;
  @ApiProperty() score!: number;
}

export class SearchResponseDto {
  @ApiProperty() query!: string;
  @ApiProperty({ type: [SearchResultItemDto] }) results!: SearchResultItemDto[];
  @ApiProperty() total!: number;
  @ApiProperty() took!: number;
  @ApiProperty() driver!: string;
}

export class SuggestionResponseDto {
  @ApiProperty({ type: [String] }) suggestions!: string[];
}
