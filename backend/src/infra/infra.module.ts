import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { CacheModule } from './cache/cache.module';
import { QueueModule } from './queue/queue.module';
import { EventsModule } from './events/events.module';
import { OutboxModule } from './outbox/outbox.module';
import { ObservabilityModule } from './observability/observability.module';
import { SecurityModule } from './security/security.module';
import { StorageModule } from './storage/storage.module';
import { NotificationsInfraModule } from './notifications/notifications-infra.module';
import { FeatureFlagsModule } from './feature-flags/feature-flags.module';

/**
 * Aggregates every infrastructure adapter into a single import for the
 * root `AppModule`. Order matters: PrismaModule and RedisModule must
 * initialize before anything that depends on them.
 */
@Module({
  imports: [
    PrismaModule,
    RedisModule,
    CacheModule,
    QueueModule,
    EventsModule,
    OutboxModule,
    ObservabilityModule,
    SecurityModule,
    StorageModule,
    NotificationsInfraModule,
    FeatureFlagsModule,
  ],
  exports: [
    PrismaModule,
    RedisModule,
    CacheModule,
    QueueModule,
    EventsModule,
    OutboxModule,
    ObservabilityModule,
    SecurityModule,
    StorageModule,
    NotificationsInfraModule,
    FeatureFlagsModule,
  ],
})
export class InfraModule {}
