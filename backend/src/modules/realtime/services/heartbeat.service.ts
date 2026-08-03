import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  REALTIME_SESSION_REPOSITORY,
  type IRealtimeSessionRepository,
} from '@modules/notifications/repositories/interfaces/realtime-session-repository.interface';
import { SSE_CONNECTION_MAX_AGE_MS } from '@modules/notifications/constants';

@Injectable()
export class HeartbeatService {
  private readonly logger = new Logger(HeartbeatService.name);

  constructor(
    @Inject(REALTIME_SESSION_REPOSITORY) private readonly sessions: IRealtimeSessionRepository,
  ) {}

  /**
   * Sweep stale sessions every minute — connections whose lastPingAt
   * is older than the max SSE lifetime are marked as disconnected in
   * the database (in-memory registry has already timed them out).
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async sweep(): Promise<void> {
    const cutoff = new Date(Date.now() - SSE_CONNECTION_MAX_AGE_MS - 60_000);
    const n = await this.sessions.closeStale(cutoff);
    if (n) this.logger.log(`Closed ${n} stale realtime sessions`);
  }
}
