import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';
import { RedisService } from './redis.service';
import type { RedisConfig } from '@config/redis.config';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis => {
        const cfg = config.getOrThrow<RedisConfig>('redis');
        const logger = new Logger('RedisModule');

        const client = new Redis({
          host: cfg.host,
          port: cfg.port,
          password: cfg.password,
          db: cfg.db,
          tls: cfg.tls ? {} : undefined,
          lazyConnect: false,
          maxRetriesPerRequest: null, // Required by BullMQ
          enableReadyCheck: true,
          retryStrategy: (times) => {
            const delay = Math.min(times * 100, 3000); // Backoff strategy
            logger.warn(`Redis connection lost. Retrying in ${delay}ms (attempt ${times})...`);
            return delay;
          },
          reconnectOnError: (err) => {
            const targetError = 'READONLY';
            if (err.message.includes(targetError)) {
              return true; // Reconnect on readonly errors (e.g. cluster failover)
            }
            return false;
          },
        });

        client.on('connect', () => {
          logger.log('Redis client initiating connection...');
        });

        client.on('ready', () => {
          logger.log('Redis client connection established and ready.');
        });

        client.on('error', (err) => {
          logger.error('Redis client connection error:', err);
        });

        client.on('close', () => {
          logger.warn('Redis client connection closed.');
        });

        client.on('reconnecting', (delay: number) => {
          logger.warn(`Redis client reconnecting in ${delay}ms.`);
        });

        return client;
      },
    },
    RedisService,
  ],
  exports: [REDIS_CLIENT, RedisService],
})
export class RedisModule {}
