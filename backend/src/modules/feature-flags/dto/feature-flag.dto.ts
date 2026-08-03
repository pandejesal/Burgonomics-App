import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class FeatureFlagDto {
  @ApiProperty() key!: string;
  @ApiProperty() enabled!: boolean;
  @ApiPropertyOptional() description?: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
}

export class UpsertFeatureFlagDto {
  @ApiProperty() @IsString() @MaxLength(80) key!: string;
  @ApiProperty() @IsBoolean() enabled!: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(240) description?: string;
}

export class FlagCheckDto {
  @ApiProperty() key!: string;
  @ApiProperty() enabled!: boolean;
}
