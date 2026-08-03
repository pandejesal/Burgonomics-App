import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infra/prisma/prisma.service';
import type {
  IRealtimeSessionRepository,
  OpenSessionInput,
} from '../interfaces/realtime-session-repository.interface';

@Injectable()
export class RealtimeSessionPrismaRepository implements IRealtimeSessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  open(input: OpenSessionInput) {
    return this.prisma.realtimeSession.create({
      data: {
        userId: input.userId,
        instanceId: input.instanceId,
        stream: input.stream,
        correlationId: input.correlationId,
        userAgent: input.userAgent,
        ip: input.ip,
      },
    });
  }

  async ping(id: string): Promise<void> {
    await this.prisma.realtimeSession
      .update({ where: { id }, data: { lastPingAt: new Date() } })
      .catch(() => undefined);
  }

  async close(id: string): Promise<void> {
    await this.prisma.realtimeSession
      .update({ where: { id }, data: { disconnectedAt: new Date() } })
      .catch(() => undefined);
  }

  async closeStale(olderThan: Date): Promise<number> {
    const res = await this.prisma.realtimeSession.updateMany({
      where: { disconnectedAt: null, lastPingAt: { lt: olderThan } },
      data: { disconnectedAt: new Date() },
    });
    return res.count;
  }

  countActiveForUser(userId: string): Promise<number> {
    return this.prisma.realtimeSession.count({ where: { userId, disconnectedAt: null } });
  }

  countActive(): Promise<number> {
    return this.prisma.realtimeSession.count({ where: { disconnectedAt: null } });
  }
}
