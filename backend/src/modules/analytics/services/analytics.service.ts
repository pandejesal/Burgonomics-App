import { Inject, Injectable } from '@nestjs/common';
import {
  ANALYTICS_REPOSITORY,
  type IAnalyticsRepository,
} from '../repositories/interfaces/analytics-repository.interface';
import type { AnalyticsRangeDto } from '../dto';

/**
 * Aggregate analytics facade. Consumers request one metric at a time
 * or the composite dashboard payload; heavy work is delegated to the
 * repository which owns raw SQL access.
 */
@Injectable()
export class AnalyticsService {
  constructor(@Inject(ANALYTICS_REPOSITORY) private readonly repo: IAnalyticsRepository) {}

  revenueSummary(range: AnalyticsRangeDto) {
    return this.repo.revenueSummary(range);
  }

  revenueSeries(range: AnalyticsRangeDto) {
    return this.repo.revenueSeries(range);
  }

  orderCountSeries(range: AnalyticsRangeDto) {
    return this.repo.orderCountSeries(range);
  }

  ordersByStatus(range: AnalyticsRangeDto) {
    return this.repo.ordersByStatus(range);
  }

  topProducts(range: AnalyticsRangeDto, limit = 10) {
    return this.repo.topProducts(range, limit);
  }

  customerInsights(range: AnalyticsRangeDto) {
    return this.repo.customerInsights(range);
  }

  offerRedemptions(range: AnalyticsRangeDto) {
    return this.repo.offerRedemptionCount(range);
  }

  refundTotal(range: AnalyticsRangeDto) {
    return this.repo.refundTotalPaise(range);
  }

  async dashboardSnapshot(range: AnalyticsRangeDto) {
    const [revenue, statusBreakdown, top, customers, offers] = await Promise.all([
      this.repo.revenueSummary(range),
      this.repo.ordersByStatus(range),
      this.repo.topProducts(range, 5),
      this.repo.customerInsights(range),
      this.repo.offerRedemptionCount(range),
    ]);
    return { revenue, statusBreakdown, topProducts: top, customers, offerRedemptions: offers };
  }
}
