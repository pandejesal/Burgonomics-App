import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { OrdersModule } from '@modules/orders/orders.module';
import { FirebaseModule } from '@modules/firebase';
import { RealtimeModule } from '@modules/realtime/realtime.module';
import { QUEUE_NAMES, DEAD_LETTER_SUFFIX } from '@infra/queue/queue.constants';

import { NotificationsController } from './controllers/notifications.controller';
import { DevicesController } from './controllers/devices.controller';
import { NotificationPreferencesController } from './controllers/preferences.controller';
import { NotificationsAdminController } from './controllers/notifications-admin.controller';

import { NotificationsService } from './services/notifications.service';
import { DevicesService } from './services/devices.service';
import { PreferencesService } from './services/preferences.service';
import { TemplatesService } from './services/templates.service';
import { NotificationDispatcherService } from './services/dispatcher.service';
import { OrderTrackingSubscriber } from './services/order-tracking.subscriber';

import { NotificationSendConsumer } from './consumers/notification-send.consumer';
import { NotificationPushConsumer } from './consumers/notification-push.consumer';
import { NotificationRetryConsumer } from './consumers/notification-retry.consumer';
import { NotificationCleanupConsumer } from './consumers/notification-cleanup.consumer';
import { NotificationBroadcastConsumer } from './consumers/notification-broadcast.consumer';

import { NOTIFICATION_REPOSITORY } from './repositories/interfaces/notification-repository.interface';
import { DEVICE_REPOSITORY } from './repositories/interfaces/device-repository.interface';
import { PREFERENCE_REPOSITORY } from './repositories/interfaces/preference-repository.interface';
import { TEMPLATE_REPOSITORY } from './repositories/interfaces/template-repository.interface';
import { DELIVERY_REPOSITORY } from './repositories/interfaces/delivery-repository.interface';

import { NotificationPrismaRepository } from './repositories/prisma/notification.prisma-repository';
import { DevicePrismaRepository } from './repositories/prisma/device.prisma-repository';
import { PreferencePrismaRepository } from './repositories/prisma/preference.prisma-repository';
import { TemplatePrismaRepository } from './repositories/prisma/template.prisma-repository';
import { DeliveryPrismaRepository } from './repositories/prisma/delivery.prisma-repository';

/**
 * Notifications Module — the ONLY module in the platform allowed to
 * import from `@modules/firebase`. Owns:
 *
 *  • notification lifecycle (create → dispatch → delivery)
 *  • device registration + FCM token management
 *  • channel-level user preferences
 *  • notification templates
 *  • BullMQ fan-out (send / push / retry / cleanup / broadcast)
 *  • bridge from domain events (orders / payments / refunds) to
 *    customer-facing notifications and realtime SSE frames
 */
@Module({
  imports: [
    forwardRef(() => OrdersModule),
    FirebaseModule,
    RealtimeModule,
    BullModule.registerQueue(
      { name: QUEUE_NAMES.NOTIFICATIONS_SEND },
      { name: QUEUE_NAMES.NOTIFICATIONS_SEND + DEAD_LETTER_SUFFIX },
      { name: QUEUE_NAMES.NOTIFICATIONS_PUSH },
      { name: QUEUE_NAMES.NOTIFICATIONS_PUSH + DEAD_LETTER_SUFFIX },
      { name: QUEUE_NAMES.NOTIFICATIONS_RETRY },
      { name: QUEUE_NAMES.NOTIFICATIONS_CLEANUP },
      { name: QUEUE_NAMES.NOTIFICATIONS_BROADCAST },
    ),
  ],
  controllers: [
    NotificationsController,
    DevicesController,
    NotificationPreferencesController,
    NotificationsAdminController,
  ],
  providers: [
    NotificationsService,
    DevicesService,
    PreferencesService,
    TemplatesService,
    NotificationDispatcherService,
    OrderTrackingSubscriber,
    NotificationSendConsumer,
    NotificationPushConsumer,
    NotificationRetryConsumer,
    NotificationCleanupConsumer,
    NotificationBroadcastConsumer,
    NotificationPrismaRepository,
    DevicePrismaRepository,
    PreferencePrismaRepository,
    TemplatePrismaRepository,
    DeliveryPrismaRepository,
    { provide: NOTIFICATION_REPOSITORY, useExisting: NotificationPrismaRepository },
    { provide: DEVICE_REPOSITORY, useExisting: DevicePrismaRepository },
    { provide: PREFERENCE_REPOSITORY, useExisting: PreferencePrismaRepository },
    { provide: TEMPLATE_REPOSITORY, useExisting: TemplatePrismaRepository },
    { provide: DELIVERY_REPOSITORY, useExisting: DeliveryPrismaRepository },
  ],
  exports: [NotificationsService, DevicesService, PreferencesService, TemplatesService],
})
export class NotificationsModule {}
