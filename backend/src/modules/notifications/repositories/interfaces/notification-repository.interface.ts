import type { Notification, NotificationStatus } from '@prisma/client';
import type { NotificationCreateInput } from '../../entities/notification.entity';

export const NOTIFICATION_REPOSITORY = Symbol('NOTIFICATION_REPOSITORY');

export interface ListNotificationsFilter {
  userId: string;
  category?: string;
  unread?: boolean;
  page: number;
  pageSize: number;
}

export interface NotificationPatch {
  status?: NotificationStatus;
  readAt?: Date | null;
  archivedAt?: Date | null;
}

export interface INotificationRepository {
  create(input: NotificationCreateInput): Promise<Notification>;
  findById(id: string): Promise<Notification | null>;
  list(filter: ListNotificationsFilter): Promise<{ items: Notification[]; total: number }>;
  unreadCount(userId: string): Promise<number>;
  patch(id: string, patch: NotificationPatch): Promise<Notification>;
  markManyRead(userId: string, ids?: string[]): Promise<number>;
  archive(id: string, userId: string): Promise<Notification>;
  remove(id: string, userId: string): Promise<void>;
  purgeExpired(now?: Date): Promise<number>;
}
