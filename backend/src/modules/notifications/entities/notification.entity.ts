import type {
  Notification,
  NotificationCategory,
  NotificationChannel,
  NotificationPriority,
  NotificationStatus,
} from '@prisma/client';

export type NotificationEntity = Notification;

export interface NotificationCreateInput {
  userId: string;
  type: string;
  title: string;
  body: string;
  category?: NotificationCategory;
  channel?: NotificationChannel;
  priority?: NotificationPriority;
  data?: Record<string, unknown>;
  deeplink?: string;
  imageUrl?: string;
  templateCode?: string;
  templateVersion?: number;
  correlationId?: string;
  refType?: string;
  refId?: string;
  scheduledAt?: Date;
  expiresAt?: Date;
  status?: NotificationStatus;
}
