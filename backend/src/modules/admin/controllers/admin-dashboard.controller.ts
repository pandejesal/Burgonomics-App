import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions, PERMISSIONS } from '@modules/rbac';
import { ZodValidationPipe } from '@common/pipes';
import { DashboardService } from '../services/dashboard.service';
import { SystemHealthService } from '../services/system-health.service';
import { dashboardRangeSchema, type DashboardRangeDto } from '../dto';

@ApiTags('Admin Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller({ path: 'admin/dashboard', version: '1' })
export class AdminDashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly systemHealth: SystemHealthService,
  ) {}

  @Get('snapshot')
  @RequirePermissions(PERMISSIONS.ADMIN_DASHBOARD_READ)
  @ApiOperation({ summary: 'Composite operations dashboard payload' })
  snapshot(@Query(new ZodValidationPipe(dashboardRangeSchema)) q: DashboardRangeDto) {
    const to = q.to ?? new Date();
    const from = q.from ?? new Date(to.getTime() - 7 * 24 * 3600 * 1000);
    return this.dashboard.snapshot({ from, to, storeId: q.storeId });
  }

  @Get('live')
  @RequirePermissions(PERMISSIONS.ADMIN_DASHBOARD_READ)
  @ApiOperation({ summary: 'Live operational counters' })
  live() {
    return this.dashboard.liveOrders();
  }

  @Get('system-health')
  @RequirePermissions(PERMISSIONS.ADMIN_SYSTEM_HEALTH_READ)
  @ApiOperation({ summary: 'Aggregate downstream system health' })
  systemHealthCheck() {
    return this.systemHealth.overall();
  }
}
