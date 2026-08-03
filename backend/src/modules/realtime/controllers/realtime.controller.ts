import {
  Controller,
  Get,
  Logger,
  Param,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { ConnectionManager } from '../services/connection-manager.service';
import { REALTIME_STREAMS } from '@modules/notifications/constants';

/**
 * SSE endpoints. Each stream is a long-lived HTTP response;
 * authentication supports either a Bearer header (native SSE clients
 * that can set headers) or a short-lived `?token=` query param
 * (browser `EventSource`, which cannot).
 */
@ApiTags('Realtime')
@Controller({ path: 'realtime', version: '1' })
export class RealtimeController {
  private readonly logger = new Logger(RealtimeController.name);

  constructor(
    private readonly manager: ConnectionManager,
    private readonly jwt: JwtService,
  ) {}

  @Get('notifications')
  @ApiOperation({ summary: 'SSE stream of realtime notifications for the authenticated user' })
  @ApiExcludeEndpoint()
  async notifications(@Req() req: Request, @Res() res: Response, @Query('token') token?: string) {
    const userId = this.resolveUser(req, token);
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

  private resolveUser(req: Request, queryToken?: string): string {
    let raw: string | undefined;
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) raw = header.slice(7);
    else if (queryToken) raw = queryToken;

    if (!raw) throw new UnauthorizedException('Missing SSE token');
    try {
      const payload = this.jwt.verify<{ sub: string }>(raw);
      if (!payload.sub) throw new UnauthorizedException('Invalid SSE token');
      return payload.sub;
    } catch {
      throw new UnauthorizedException('Invalid SSE token');
    }
  }
}
