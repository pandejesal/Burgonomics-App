import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '@infra/redis/redis.service';
import type { CacheConfig } from '@config/cache.config';

/**
 * JSON cache abstraction over Redis. Consumers never reach into ioredis
 * directly; a future swap (e.g. multi-tier cache) is a drop-in.
 */
@Injectable()
export class CacheService {
  private readonly defaultTtl: number;

  constructor(
    private readonly redis: RedisService,
    config: ConfigService,
  ) {
    this.defaultTtl = config.getOrThrow<CacheConfig>('cache').defaultTtlSeconds;
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.redis.client.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const ttl = ttlSeconds ?? this.defaultTtl;
    await this.redis.client.set(key, JSON.stringify(value), 'EX', ttl);
  }

  async del(key: string | string[]): Promise<void> {
    const keys = Array.isArray(key) ? key : [key];
    if (keys.length) await this.redis.client.del(...keys);
  }

  async wrap<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const value = await loader();
    await this.set(key, value, ttlSeconds);
    return value;
  }
}
