import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, Length } from 'class-validator';

export enum DevicePlatformDto {
  IOS = 'IOS',
  ANDROID = 'ANDROID',
  WEB = 'WEB',
}

export class RegisterDeviceDto {
  @ApiProperty() @IsString() @Length(10, 4096) token!: string;
  @ApiProperty({ enum: DevicePlatformDto }) @IsEnum(DevicePlatformDto) platform!: DevicePlatformDto;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 32) appVersion?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 32) osVersion?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 128) deviceModel?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 16) language?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 64) timezone?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() pushEnabled?: boolean;
}

export class DeviceResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: DevicePlatformDto }) platform!: DevicePlatformDto;
  @ApiPropertyOptional() appVersion?: string;
  @ApiPropertyOptional() osVersion?: string;
  @ApiProperty() language!: string;
  @ApiPropertyOptional() timezone?: string;
  @ApiProperty() pushEnabled!: boolean;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() lastSeenAt!: string;
  @ApiProperty() registeredAt!: string;
}

export class DeviceHeartbeatDto {
  @ApiPropertyOptional() @IsOptional() @IsString() appVersion?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() language?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() timezone?: string;
}
