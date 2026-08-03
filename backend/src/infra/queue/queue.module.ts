import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import type { RedisConfig } from '@config/redis.config';
import type { BullMqConfig } from '@config/bullmq.config';
import { QUEUE_NAMES } from './queue.constants';
import { QueueMetricsService } from './queue-metrics.service';

/**
 * Registers BullMQ globally, wired to the same Redis instance as the
 * cache module. Individual queues are pre-registered here so feature
 * modules can inject them via `@InjectQueue(QUEUE_NAMES.X)`.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redis = config.getOrThrow<RedisConfig>('redis');
        const bull = config.getOrThrow<BullMqConfig>('bullmq');
        return {
          prefix: bull.prefix,
          connection: {
            host: redis.host,
            port: redis.port,
            password: redis.password,
            db: redis.db,
            tls: redis.tls ? {} : undefined,
            maxRetriesPerRequest: null,
          },
          defaultJobOptions: {
            attempts: bull.defaultAttempts,
            backoff: { type: 'exponential', delay: bull.defaultBackoffMs },
            removeOnComplete: { age: 3600, count: 1000 },
            removeOnFail: { age: 24 * 3600 },
          },
        };
      },
    }),
    BullModule.registerQueue(...Object.values(QUEUE_NAMES).map((name) => ({ name }))),
  ],
  providers: [QueueMetricsService],
  exports: [BullModule],
})
export class QueueModule {}
