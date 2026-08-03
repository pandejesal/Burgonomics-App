import { Inject, Injectable } from '@nestjs/common';
import { AnalyticsService } from '@modules/analytics';
import {
  ADMIN_OPS_REPOSITORY,
  type IAdminOpsRepository,
} from '../repositories/interfaces/admin-ops-repository.interface';

@Injectable()
export class DashboardService {
  constructor(
    @Inject(ADMIN_OPS_REPOSITORY) private readonly ops: IAdminOpsRepository,
    private readonly analytics: AnalyticsService,
  ) {}

  async snapshot(range: { from: Date; to: Date; storeId?: string }) {
    const [counts, revenue, topProducts, statusBreakdown] = await Promise.all([
      this.ops.dashboardCounts(),
      this.analytics.revenueSummary({ ...range, granularity: 'day' }),
      this.analytics.topProducts({ ...range, granularity: 'day' }, 10),
      this.analytics.ordersByStatus({ ...range, granularity: 'day' }),
    ]);
    return { counts, revenue, topProducts, statusBreakdown };
  }

  liveOrders() {
    return this.ops.dashboardCounts();
  }
}
