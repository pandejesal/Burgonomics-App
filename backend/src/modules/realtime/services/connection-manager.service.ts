import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { ConnectionRegistry } from './connection-registry.service';
import {
  REALTIME_SESSION_REPOSITORY,
  type IRealtimeSessionRepository,
} from '@modules/notifications/repositories/interfaces/realtime-session-repository.interface';
import type { RealtimeStream } from '@modules/notifications/constants';
import { DomainEventBus } from '@infra/events/domain-event-bus';

/**
 * Facade around the low-level `ConnectionRegistry` that also persists
 * sessions to the database for observability / horizontal-scaling
 * health checks. Controllers use this service to open SSE streams.
 */
@Injectable()
export class ConnectionManager {
  private readonly logger = new Logger(ConnectionManager.name);

  constructor(
    private readonly registry: ConnectionRegistry,
    @Inject(REALTIME_SESSION_REPOSITORY) private readonly sessions: IRealtimeSessionRepository,
    private readonly bus: DomainEventBus,
  ) {}

  async open(input: {
    userId: string;
    stream: RealtimeStream;
    res: Response;
    userAgent?: string;
    ip?: string;
    correlationId?: string;
  }): Promise<{ connectionId: string; sessionId: string }> {
    const session = await this.sessions.open({
      userId: input.userId,
      instanceId: this.registry.instanceId,
      stream: input.stream,
      correlationId: input.correlationId,
      userAgent: input.userAgent,
      ip: input.ip,
    });

    const conn = this.registry.register(input.userId, input.stream, input.res, async () => {
      await this.sessions.close(session.id).catch(() => undefined);
      this.bus.publish('realtime.connection_closed', {
        sessionId: session.id,
        userId: input.userId,
      });
    });

    input.res.on('close', () => this.registry.close(conn.id));
    this.bus.publish('realtime.connection_created', {
      sessionId: session.id,
      userId: input.userId,
    });
    return { connectionId: conn.id, sessionId: session.id };
  }
}
