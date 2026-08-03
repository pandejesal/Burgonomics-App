import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { DomainEventBus } from '@infra/events/domain-event-bus';
import { MetricsService } from '@infra/observability/metrics/metrics.service';
import { QUEUE_NAMES } from '@infra/queue/queue.constants';
import { ForbiddenError, NotFoundError } from '@common/errors';
import {
  NOTIFICATION_REPOSITORY,
  type INotificationRepository,
  type ListNotificationsFilter,
} from '../repositories/interfaces/notification-repository.interface';
import type { NotificationCreateInput, NotificationEntity } from '../entities/notification.entity';
import {
  NOTIFICATION_EVENTS,
  type NotificationLifecycleEvent,
} from '../events/notification.events';
import {
  DEFAULT_CHANNELS_BY_CATEGORY,
  DEFAULT_PRIORITY_BY_TYPE,
  NOTIFICATION_TYPE_TO_CATEGORY,
  type NotificationType,
} from '../constants';

export interface CreateNotificationCommand extends Omit<NotificationCreateInput, 'category'> {
  category?: NotificationCreateInput['category'];
}

/**
 * Owns the Notification aggregate lifecycle. Creates persisted rows,
 * emits domain events, and enqueues fan-out work. Delivery specifics
 * (push, SSE, etc.) live in `NotificationDispatcherService` and its
 * queue consumers.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @Inject(NOTIFICATION_REPOSITORY) private readonly repo: INotificationRepository,
    private readonly bus: DomainEventBus,
    private readonly metrics: MetricsService,
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS_SEND) private readonly sendQueue: Queue,
  ) {}

  async create(
    cmd: CreateNotificationCommand,
    correlationId?: string,
  ): Promise<NotificationEntity> {
    const category =
      cmd.category ?? NOTIFICATION_TYPE_TO_CATEGORY[cmd.type as NotificationType] ?? 'GENERAL';
    const priority =
      cmd.priority ?? DEFAULT_PRIORITY_BY_TYPE[cmd.type as NotificationType] ?? 'NORMAL';

    const notification = await this.repo.create({
      ...cmd,
      category,
      priority,
      correlationId: cmd.correlationId ?? correlationId,
      status: cmd.status ?? 'PENDING',
    });

    this.metrics.notificationEvents.inc({
      event: 'created',
      type: cmd.type,
      channel: notification.channel,
    });
    this.bus.publish<NotificationLifecycleEvent>(NOTIFICATION_EVENTS.CREATED, {
      notificationId: notification.id,
      userId: notification.userId,
      type: notification.type,
      category: notification.category,
      channel: notification.channel,
      correlationId,
    });

    await this.sendQueue.add(
      'dispatch',
      { notificationId: notification.id, correlationId },
      {
        jobId: `notification:${notification.id}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 2_000 },
        removeOnComplete: { age: 3_600, count: 500 },
        removeOnFail: { age: 7 * 24 * 3_600 },
      },
    );
    return notification;
  }

  channelsForCategory(category: string): string[] {
    return (
      DEFAULT_CHANNELS_BY_CATEGORY[category as keyof typeof DEFAULT_CHANNELS_BY_CATEGORY] ?? [
        'IN_APP',
      ]
    );
  }

  list(userId: string, filter: Omit<ListNotificationsFilter, 'userId'>) {
    return this.repo.list({ ...filter, userId });
  }

  unreadCount(userId: string): Promise<number> {
    return this.repo.unreadCount(userId);
  }

  async markRead(userId: string, ids?: string[]): Promise<number> {
    const count = await this.repo.markManyRead(userId, ids);
    if (ids?.length) {
      for (const id of ids) {
        this.bus.publish(NOTIFICATION_EVENTS.READ, { notificationId: id, userId });
      }
    }
    return count;
  }

  async archive(id: string, userId: string): Promise<NotificationEntity> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundError('Notification not found');
    if (existing.userId !== userId) throw new ForbiddenError();
    const archived = await this.repo.archive(id, userId);
    this.bus.publish(NOTIFICATION_EVENTS.ARCHIVED, { notificationId: id, userId });
    return archived;
  }

  async remove(id: string, userId: string): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) return;
    if (existing.userId !== userId) throw new ForbiddenError();
    await this.repo.remove(id, userId);
  }

  patchStatus(
    id: string,
    status: NonNullable<Parameters<INotificationRepository['patch']>[1]['status']>,
  ) {
    return this.repo.patch(id, { status });
  }

  findById(id: string) {
    return this.repo.findById(id);
  }

  purgeExpired() {
    return this.repo.purgeExpired();
  }
}
