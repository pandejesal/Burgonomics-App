import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions, PERMISSIONS } from '@modules/rbac';
import { ZodValidationPipe } from '@common/pipes';
import { AnalyticsService } from '../services/analytics.service';
import { analyticsRangeSchema, type AnalyticsRangeDto } from '../dto';

@ApiTags('Admin Analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSIONS.ANALYTICS_READ)
@Controller({ path: 'admin/analytics', version: '1' })
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Composite dashboard summary' })
  summary(@Query(new ZodValidationPipe(analyticsRangeSchema)) q: AnalyticsRangeDto) {
    return this.analytics.dashboardSnapshot(q);
  }

  @Get('revenue')
  @ApiOperation({ summary: 'Revenue summary' })
  revenue(@Query(new ZodValidationPipe(analyticsRangeSchema)) q: AnalyticsRangeDto) {
    return this.analytics.revenueSummary(q);
  }

  @Get('revenue/series')
  @ApiOperation({ summary: 'Revenue time-series' })
  revenueSeries(@Query(new ZodValidationPipe(analyticsRangeSchema)) q: AnalyticsRangeDto) {
    return this.analytics.revenueSeries(q);
  }

  @Get('orders/series')
  @ApiOperation({ summary: 'Order count time-series' })
  orderSeries(@Query(new ZodValidationPipe(analyticsRangeSchema)) q: AnalyticsRangeDto) {
    return this.analytics.orderCountSeries(q);
  }

  @Get('orders/status')
  @ApiOperation({ summary: 'Orders grouped by status' })
  ordersByStatus(@Query(new ZodValidationPipe(analyticsRangeSchema)) q: AnalyticsRangeDto) {
    return this.analytics.ordersByStatus(q);
  }

  @Get('products/top')
  @ApiOperation({ summary: 'Top selling products' })
  topProducts(@Query(new ZodValidationPipe(analyticsRangeSchema)) q: AnalyticsRangeDto) {
    return this.analytics.topProducts(q, 10);
  }

  @Get('customers')
  @ApiOperation({ summary: 'Customer insights (new vs returning)' })
  customers(@Query(new ZodValidationPipe(analyticsRangeSchema)) q: AnalyticsRangeDto) {
    return this.analytics.customerInsights(q);
  }
}
