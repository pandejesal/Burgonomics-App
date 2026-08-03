import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '@modules/auth';
import { RealtimeController } from './controllers/realtime.controller';
import { ConnectionRegistry } from './services/connection-registry.service';
import { ConnectionManager } from './services/connection-manager.service';
import { HeartbeatService } from './services/heartbeat.service';
import { RealtimeBroadcaster } from './services/realtime-broadcaster.service';
import { REALTIME_SESSION_REPOSITORY } from '@modules/notifications/repositories/interfaces/realtime-session-repository.interface';
import { RealtimeSessionPrismaRepository } from '@modules/notifications/repositories/prisma/realtime-session.prisma-repository';

/**
 * SSE realtime module. Owns the connection registry, per-user
 * fan-out, cross-instance pub/sub, session persistence, and the
 * public `/v1/realtime/*` endpoints.
 */
@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [RealtimeController],
  providers: [
    ConnectionRegistry,
    ConnectionManager,
    HeartbeatService,
    RealtimeBroadcaster,
    RealtimeSessionPrismaRepository,
    { provide: REALTIME_SESSION_REPOSITORY, useExisting: RealtimeSessionPrismaRepository },
  ],
  exports: [
    RealtimeBroadcaster,
    ConnectionRegistry,
    ConnectionManager,
    REALTIME_SESSION_REPOSITORY,
  ],
})
export class RealtimeModule {}
