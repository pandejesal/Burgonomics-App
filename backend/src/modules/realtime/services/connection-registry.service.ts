import { ulid } from 'ulid';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Response } from 'express';
import { RedisService } from '@infra/redis/redis.service';
import { MetricsService } from '@infra/observability/metrics/metrics.service';
import {
  REALTIME_PUBSUB_CHANNEL,
  SSE_CONNECTION_MAX_AGE_MS,
  SSE_HEARTBEAT_INTERVAL_MS,
  type RealtimeStream,
} from '@modules/notifications/constants';

interface SseConnection {
  id: string;
  userId: string;
  stream: RealtimeStream;
  res: Response;
  openedAt: number;
  heartbeat: NodeJS.Timeout;
  maxAge: NodeJS.Timeout;
  close: () => void;
}

/**
 * Per-instance in-memory registry of open SSE connections. Cross-node
 * fan-out is achieved by publishing to Redis; each instance subscribes
 * once via a duplicate connection and forwards matching events to its
 * local sockets.
 */
@Injectable()
export class ConnectionRegistry implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ConnectionRegistry.name);
  private readonly connections = new Map<string, SseConnection>();
  private readonly byUser = new Map<string, Set<string>>();
  readonly instanceId = `sse-${ulid()}`;
  private subscriber: ReturnType<RedisService['duplicate']> | null = null;

  constructor(
    private readonly redis: RedisService,
    private readonly metrics: MetricsService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.subscriber = this.redis.duplicate();
    await this.subscriber.subscribe(REALTIME_PUBSUB_CHANNEL);
    this.subscriber.on('message', (_, raw) => {
      try {
        const msg = JSON.parse(raw) as {
          stream: RealtimeStream;
          userId: string;
          event: string;
          data: unknown;
        };
        this.deliverLocal(msg.stream, msg.userId, msg.event, msg.data);
      } catch (err) {
        this.logger.warn(`Bad realtime payload: ${(err as Error).message}`);
      }
    });
    this.logger.log(`Realtime registry ready as ${this.instanceId}`);
  }

  async onModuleDestroy(): Promise<void> {
    for (const conn of this.connections.values()) conn.close();
    this.connections.clear();
    this.byUser.clear();
    if (this.subscriber) {
      await this.subscriber.unsubscribe(REALTIME_PUBSUB_CHANNEL).catch(() => undefined);
      this.subscriber.disconnect();
    }
  }

  register(
    userId: string,
    stream: RealtimeStream,
    res: Response,
    onClose: (id: string) => void,
  ): SseConnection {
    const id = ulid();
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    this.write(res, 'ready', { id, stream, instanceId: this.instanceId });

    const heartbeat = setInterval(() => {
      try {
        res.write(`: ping ${Date.now()}\n\n`);
      } catch {
        this.close(id);
      }
    }, SSE_HEARTBEAT_INTERVAL_MS);
    heartbeat.unref?.();

    const maxAge = setTimeout(() => this.close(id), SSE_CONNECTION_MAX_AGE_MS);
    maxAge.unref?.();

    const close = () => {
      clearInterval(heartbeat);
      clearTimeout(maxAge);
      this.connections.delete(id);
      this.byUser.get(userId)?.delete(id);
      this.metrics.sseActiveConnections.dec({ stream });
      this.metrics.sseConnections.inc({ event: 'closed' });
      onClose(id);
      try {
        res.end();
      } catch {
        /* already closed */
      }
    };

    const conn: SseConnection = {
      id,
      userId,
      stream,
      res,
      openedAt: Date.now(),
      heartbeat,
      maxAge,
      close,
    };
    this.connections.set(id, conn);
    if (!this.byUser.has(userId)) this.byUser.set(userId, new Set());
    this.byUser.get(userId)!.add(id);

    this.metrics.sseActiveConnections.inc({ stream });
    this.metrics.sseConnections.inc({ event: 'opened' });
    return conn;
  }

  close(id: string): void {
    this.connections.get(id)?.close();
  }

  countLocalActive(): number {
    return this.connections.size;
  }

  /** Fan-out to all instances via Redis pub/sub. Returns the number of local deliveries. */
  async publish(
    stream: RealtimeStream,
    userId: string,
    event: string,
    data: unknown,
  ): Promise<number> {
    await this.redis.publish(
      REALTIME_PUBSUB_CHANNEL,
      JSON.stringify({ stream, userId, event, data }),
    );
    return this.deliverLocal(stream, userId, event, data);
  }

  private deliverLocal(
    stream: RealtimeStream,
    userId: string,
    event: string,
    data: unknown,
  ): number {
    const ids = this.byUser.get(userId);
    if (!ids?.size) return 0;
    let delivered = 0;
    for (const id of ids) {
      const conn = this.connections.get(id);
      if (!conn || conn.stream !== stream) continue;
      try {
        this.write(conn.res, event, data);
        delivered += 1;
        this.metrics.sseMessages.inc({ stream, event });
      } catch {
        this.close(id);
      }
    }
    return delivered;
  }

  private write(res: Response, event: string, data: unknown): void {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }
}
