import { Injectable } from '@nestjs/common';
import type { Notification, Prisma } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';
import type {
  INotificationRepository,
  ListNotificationsFilter,
  NotificationPatch,
} from '../interfaces/notification-repository.interface';
import type { NotificationCreateInput } from '../../entities/notification.entity';

@Injectable()
export class NotificationPrismaRepository implements INotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: NotificationCreateInput): Promise<Notification> {
    return this.prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        category: input.category ?? 'GENERAL',
        channel: input.channel ?? 'PUSH',
        priority: input.priority ?? 'NORMAL',
        data: (input.data as Prisma.InputJsonValue) ?? undefined,
        deeplink: input.deeplink,
        imageUrl: input.imageUrl,
        templateCode: input.templateCode,
        templateVersion: input.templateVersion,
        correlationId: input.correlationId,
        refType: input.refType,
        refId: input.refId,
        scheduledAt: input.scheduledAt,
        expiresAt: input.expiresAt,
        status: input.status ?? 'PENDING',
      },
    });
  }

  findById(id: string) {
    return this.prisma.notification.findUnique({ where: { id } });
  }

  async list(filter: ListNotificationsFilter) {
    const where: Prisma.NotificationWhereInput = {
      userId: filter.userId,
      archivedAt: null,
    };
    if (filter.category)
      where.category = filter.category as Prisma.NotificationWhereInput['category'];
    if (filter.unread) where.readAt = null;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return { items, total };
  }

  unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null, archivedAt: null } });
  }

  patch(id: string, patch: NotificationPatch): Promise<Notification> {
    return this.prisma.notification.update({ where: { id }, data: patch });
  }

  async markManyRead(userId: string, ids?: string[]): Promise<number> {
    const where: Prisma.NotificationWhereInput = { userId, readAt: null };
    if (ids && ids.length) where.id = { in: ids };
    const res = await this.prisma.notification.updateMany({
      where,
      data: { readAt: new Date(), status: 'READ' },
    });
    return res.count;
  }

  async archive(id: string, userId: string): Promise<Notification> {
    return this.prisma.notification.update({
      where: { id },
      data: { archivedAt: new Date(), status: 'ARCHIVED' },
    });
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.prisma.notification.deleteMany({ where: { id, userId } });
  }

  async purgeExpired(now = new Date()): Promise<number> {
    const res = await this.prisma.notification.updateMany({
      where: { expiresAt: { lte: now }, status: { notIn: ['EXPIRED', 'ARCHIVED'] } },
      data: { status: 'EXPIRED' },
    });
    return res.count;
  }
}
