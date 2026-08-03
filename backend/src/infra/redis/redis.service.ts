import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { ulid } from 'ulid';
import { REDIS_CLIENT } from './redis.constants';
import { MetricsService } from '@infra/observability/metrics/metrics.service';

/**
 * Thin, tested wrapper around ioredis exposing the operations feature
 * modules actually need: cache primitives, pub/sub, distributed locks.
 */
@Injectable()
export class RedisService {
  constructor(
    @Inject(REDIS_CLIENT) public readonly client: Redis,
    private readonly metrics: MetricsService,
  ) {
    this.instrumentClient();
  }

  private instrumentClient() {
    const originalSendCommand = this.client.sendCommand.bind(this.client);
    this.client.sendCommand = (command: any, ...args: any[]) => {
      const commandName = (command?.name || 'unknown').toLowerCase();
      const end = this.metrics.redisLatency.startTimer({ command: commandName });

      const promise = originalSendCommand(command, ...args) as Promise<any>;
      promise.then(
        () => {
          this.metrics.redisOperations.inc({ command: commandName, status: 'success' });
          end();
        },
        () => {
          this.metrics.redisOperations.inc({ command: commandName, status: 'error' });
          end();
        },
      );
      return promise;
    };
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }

  // ─── Pub/Sub ─────────────────────────────────────────────────
  async publish(channel: string, message: string): Promise<number> {
    return this.client.publish(channel, message);
  }

  duplicate(): Redis {
    return this.client.duplicate();
  }

  // ─── Distributed Lock (single-node SETNX-based) ──────────────
  async acquireLock(key: string, ttlMs: number): Promise<string | null> {
    const token = ulid();
    const res = await this.client.set(`lock:${key}`, token, 'PX', ttlMs, 'NX');
    return res === 'OK' ? token : null;
  }

  async releaseLock(key: string, token: string): Promise<boolean> {
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    const res = await this.client.eval(script, 1, `lock:${key}`, token);
    return res === 1;
  }
}
