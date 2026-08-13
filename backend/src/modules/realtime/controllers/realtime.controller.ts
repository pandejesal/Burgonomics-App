import {
  Controller,
  Get,
  Logger,
  Param,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { ConnectionManager } from '../services/connection-manager.service';
import { REALTIME_STREAMS } from '@modules/notifications/constants';

/**
 * SSE endpoints. Each stream is a long-lived HTTP response;
 * authentication strictly requires an Authorization Bearer header via JwtAuthGuard.
 */
@ApiTags('Realtime')
@Controller({ path: 'realtime', version: '1' })
export class RealtimeController {
  private readonly logger = new Logger(RealtimeController.name);

  constructor(
    private readonly manager: ConnectionManager,
  ) {}

  @Get('notifications')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'SSE stream of realtime notifications for the authenticated user' })
  @ApiExcludeEndpoint()
  async notifications(
    @CurrentUser('id') userId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    await this.manager.open({
      userId,
      stream: REALTIME_STREAMS.NOTIFICATIONS,
      res,
      userAgent: req.headers['user-agent'],
      ip: req.ip,
      correlationId: (req.headers['x-correlation-id'] as string | undefined) ?? undefined,
    });
  }

  @Get('orders/:orderId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'SSE stream of realtime status updates for a single order' })
  async orderTracking(
    @CurrentUser('id') userId: string,
    @Param('orderId') orderId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    await this.manager.open({
      userId,
      stream: REALTIME_STREAMS.ORDER_TRACKING,
      res,
      userAgent: req.headers['user-agent'],
      ip: req.ip,
      correlationId: (req.headers['x-correlation-id'] as string | undefined) ?? undefined,
    });
    // orderId scoping is enforced at emit-time (payload includes orderId; client filters)
    void orderId;
  }
}
