import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeController, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Role } from '@common/enums';
import { QUEUE_NAMES } from '@infra/queue/queue.constants';
import { Roles } from '@common/decorators/roles.decorator';
import { BroadcastNotificationDto } from '../dto';
import {
  DELIVERY_REPOSITORY,
  type IDeliveryRepository,
} from '../repositories/interfaces/delivery-repository.interface';
import { Inject } from '@nestjs/common';
import {
  REALTIME_SESSION_REPOSITORY,
  type IRealtimeSessionRepository,
} from '../repositories/interfaces/realtime-session-repository.interface';

@ApiTags('Notifications (Admin)')
@ApiBearerAuth()
@ApiExcludeController()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller({ path: 'admin/notifications', version: '1' })
export class NotificationsAdminController {
  constructor(
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS_BROADCAST) private readonly queue: Queue,
    @Inject(DELIVERY_REPOSITORY) private readonly deliveries: IDeliveryRepository,
    @Inject(REALTIME_SESSION_REPOSITORY) private readonly sessions: IRealtimeSessionRepository,
  ) {}

  @Post('broadcast')
  @ApiOperation({ summary: 'Fan-out a notification via FCM topics and/or user list' })
  async broadcast(@Body() body: BroadcastNotificationDto): Promise<{ jobId: string }> {
    const job = await this.queue.add(
      'broadcast',
      { payload: body },
      { attempts: 3, backoff: { type: 'exponential', delay: 5_000 } },
    );
    return { jobId: String(job.id) };
  }

  @Get('stats')
  @ApiOperation({ summary: 'Realtime and delivery statistics snapshot' })
  async stats() {
    const since = new Date(Date.now() - 24 * 3_600_000);
    const [success, failed, active] = await Promise.all([
      this.deliveries.countByStatusSince('SUCCESS', since),
      this.deliveries.countByStatusSince('FAILED', since),
      this.sessions.countActive(),
    ]);
    return {
      windowHours: 24,
      deliveries: { success, failed },
      realtime: { activeSessions: active },
    };
  }
}
