import type { RealtimeSession } from '@prisma/client';

export const REALTIME_SESSION_REPOSITORY = Symbol('REALTIME_SESSION_REPOSITORY');

export interface OpenSessionInput {
  userId: string;
  instanceId: string;
  stream: string;
  correlationId?: string;
  userAgent?: string;
  ip?: string;
}

export interface IRealtimeSessionRepository {
  open(input: OpenSessionInput): Promise<RealtimeSession>;
  ping(id: string): Promise<void>;
  close(id: string): Promise<void>;
  closeStale(olderThan: Date): Promise<number>;
  countActiveForUser(userId: string): Promise<number>;
  countActive(): Promise<number>;
}
