import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class UpdatePreferencesDto {
  @ApiPropertyOptional() @IsOptional() @IsString() language?: string;
  @ApiPropertyOptional({ enum: ['light', 'dark', 'system'] })
  @IsOptional()
  @IsIn(['light', 'dark', 'system'])
  theme?: 'light' | 'dark' | 'system';
  @ApiPropertyOptional() @IsOptional() @IsBoolean() notificationsEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() marketingOptIn?: boolean;
}
