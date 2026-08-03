import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsEnum, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { NotificationCategoryDto } from './notification.dto';

export enum NotificationChannelDto {
  PUSH = 'PUSH',
  SSE = 'SSE',
  EMAIL = 'EMAIL',
  SMS = 'SMS',
  IN_APP = 'IN_APP',
}

export class ChannelPreferenceItemDto {
  @ApiProperty({ enum: NotificationCategoryDto })
  @IsEnum(NotificationCategoryDto)
  category!: NotificationCategoryDto;

  @ApiProperty({ enum: NotificationChannelDto })
  @IsEnum(NotificationChannelDto)
  channel!: NotificationChannelDto;

  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;
}

export class UpdatePreferencesDto {
  @ApiPropertyOptional({ description: 'Master push toggle' })
  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean;

  @ApiPropertyOptional({ type: [ChannelPreferenceItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChannelPreferenceItemDto)
  channels?: ChannelPreferenceItemDto[];
}

export class PreferencesResponseDto {
  @ApiProperty() pushEnabled!: boolean;
  @ApiProperty({ type: [ChannelPreferenceItemDto] })
  channels!: ChannelPreferenceItemDto[];
}
