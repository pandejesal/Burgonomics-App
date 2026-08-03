import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { NotificationsService } from '../services/notifications.service';
import { NotificationMapper } from '../mappers/notification.mapper';
import {
  ListNotificationsQueryDto,
  MarkReadDto,
  NotificationListResponseDto,
  NotificationResponseDto,
  NotificationUnreadCountDto,
} from '../dto';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'notifications', version: '1' })
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List notifications for the authenticated user' })
  async list(
    @CurrentUser('id') userId: string,
    @Query() q: ListNotificationsQueryDto,
  ): Promise<NotificationListResponseDto> {
    const [{ items, total }, unreadCount] = await Promise.all([
      this.svc.list(userId, q),
      this.svc.unreadCount(userId),
    ]);
    return {
      items: items.map(NotificationMapper.toResponse),
      total,
      unreadCount,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Return the unread notification count' })
  async unread(@CurrentUser('id') userId: string): Promise<NotificationUnreadCountDto> {
    return { unreadCount: await this.svc.unreadCount(userId) };
  }

  @Patch('read')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark one, many, or all notifications as read' })
  async markRead(@CurrentUser('id') userId: string, @Body() body: MarkReadDto) {
    const count = await this.svc.markRead(userId, body.ids);
    return { count };
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a single notification as read' })
  async markOneRead(@CurrentUser('id') userId: string, @Param('id') id: string) {
    const count = await this.svc.markRead(userId, [id]);
    return { count };
  }

  @Patch(':id/archive')
  @ApiOperation({ summary: 'Archive a notification' })
  async archive(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<NotificationResponseDto> {
    const archived = await this.svc.archive(id, userId);
    return NotificationMapper.toResponse(archived);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a notification' })
  async remove(@CurrentUser('id') userId: string, @Param('id') id: string): Promise<void> {
    await this.svc.remove(id, userId);
  }

  @Post('test')
  @ApiOperation({ summary: 'Emit a test system notification for the authenticated user' })
  async selfTest(@CurrentUser('id') userId: string): Promise<NotificationResponseDto> {
    const created = await this.svc.create({
      userId,
      type: 'system',
      title: 'Realtime test',
      body: 'This is a test notification from Burgonomics.',
    });
    return NotificationMapper.toResponse(created);
  }
}
