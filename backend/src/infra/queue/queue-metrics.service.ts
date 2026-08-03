import { Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { QueueEvents } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { QUEUE_NAMES } from './queue.constants';
import { MetricsService } from '@infra/observability/metrics/metrics.service';
import type { RedisConfig } from '@config/redis.config';
import type { BullMqConfig } from '@config/bullmq.config';

@Injectable()
export class QueueMetricsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private listeners: QueueEvents[] = [];

  constructor(
    private readonly config: ConfigService,
    private readonly metrics: MetricsService,
  ) {}

  onApplicationBootstrap() {
    const redis = this.config.getOrThrow<RedisConfig>('redis');
    const bull = this.config.getOrThrow<BullMqConfig>('bullmq');

    const connection = {
      host: redis.host,
      port: redis.port,
      password: redis.password,
      db: redis.db,
      tls: redis.tls ? {} : undefined,
    };

    for (const queueName of Object.values(QUEUE_NAMES)) {
      try {
        const events = new QueueEvents(queueName, {
          connection,
          prefix: bull.prefix,
        });

        events.on('completed', () => {
          this.metrics.bullmqJobs.inc({ queue: queueName, status: 'completed' });
        });

        events.on('failed', () => {
          this.metrics.bullmqJobs.inc({ queue: queueName, status: 'failed' });
        });

        events.on('active', () => {
          this.metrics.bullmqJobs.inc({ queue: queueName, status: 'active' });
        });

        this.listeners.push(events);
      } catch (err) {
        // Safe catch - do not prevent app boot if one queue listener fails
      }
    }
  }

  async onApplicationShutdown() {
    await Promise.all(this.listeners.map((l) => l.close().catch(() => {})));
  }
}
