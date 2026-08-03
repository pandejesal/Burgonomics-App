import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum NotificationCategoryDto {
  ORDER = 'ORDER',
  PAYMENT = 'PAYMENT',
  OFFER = 'OFFER',
  SYSTEM = 'SYSTEM',
  GENERAL = 'GENERAL',
  LOYALTY = 'LOYALTY',
  MEMBERSHIP = 'MEMBERSHIP',
}

export enum NotificationStatusDto {
  PENDING = 'PENDING',
  QUEUED = 'QUEUED',
  SENDING = 'SENDING',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  READ = 'READ',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED',
  ARCHIVED = 'ARCHIVED',
}

export class ListNotificationsQueryDto {
  @ApiPropertyOptional({ enum: NotificationCategoryDto })
  @IsOptional()
  @IsEnum(NotificationCategoryDto)
  category?: NotificationCategoryDto;

  @ApiPropertyOptional({ description: 'Only unread' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  unread?: boolean;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}

export class NotificationResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() type!: string;
  @ApiProperty({ enum: NotificationCategoryDto }) category!: NotificationCategoryDto;
  @ApiProperty() title!: string;
  @ApiProperty() body!: string;
  @ApiPropertyOptional() deeplink?: string;
  @ApiPropertyOptional() imageUrl?: string;
  @ApiPropertyOptional() data?: Record<string, unknown>;
  @ApiProperty({ enum: NotificationStatusDto }) status!: NotificationStatusDto;
  @ApiProperty() read!: boolean;
  @ApiProperty() createdAt!: string;
  @ApiPropertyOptional() readAt?: string;
  @ApiPropertyOptional() archivedAt?: string;
}

export class NotificationListResponseDto {
  @ApiProperty({ type: [NotificationResponseDto] }) items!: NotificationResponseDto[];
  @ApiProperty() total!: number;
  @ApiProperty() unreadCount!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}

export class MarkReadDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsString({ each: true })
  ids?: string[];
}

export class BroadcastNotificationDto {
  @ApiProperty() @IsString() @Length(1, 128) type!: string;
  @ApiProperty() @IsString() @Length(1, 200) title!: string;
  @ApiProperty() @IsString() @Length(1, 2000) body!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() deeplink?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() imageUrl?: string;
  @ApiPropertyOptional({ enum: NotificationCategoryDto })
  @IsOptional()
  @IsEnum(NotificationCategoryDto)
  category?: NotificationCategoryDto;
  @ApiPropertyOptional({ type: [String], description: 'FCM topic names' })
  @IsOptional()
  @IsString({ each: true })
  topics?: string[];
  @ApiPropertyOptional({ type: [String], description: 'Target user ids (fan-out)' })
  @IsOptional()
  @IsString({ each: true })
  userIds?: string[];
}

export class SendTestPushDto {
  @ApiProperty() @IsString() @Length(1, 200) title!: string;
  @ApiProperty() @IsString() @Length(1, 500) body!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() token?: string;
}

export class NotificationUnreadCountDto {
  @ApiProperty() unreadCount!: number;
}

export const SEVERITY_LEVELS = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'] as const;

export class UpdateNotificationPriorityDto {
  @ApiProperty({ enum: SEVERITY_LEVELS })
  @IsIn(SEVERITY_LEVELS as unknown as string[])
  priority!: (typeof SEVERITY_LEVELS)[number];
}
