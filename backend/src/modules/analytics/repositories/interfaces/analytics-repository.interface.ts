import type {
  AnalyticsRangeDto,
  CustomerInsight,
  OrderStatusBreakdown,
  RevenueSummary,
  TimeSeriesPoint,
  TopProduct,
} from '../../dto';

export const ANALYTICS_REPOSITORY = Symbol('ANALYTICS_REPOSITORY');

export interface IAnalyticsRepository {
  revenueSummary(range: AnalyticsRangeDto): Promise<RevenueSummary>;
  revenueSeries(range: AnalyticsRangeDto): Promise<TimeSeriesPoint[]>;
  orderCountSeries(range: AnalyticsRangeDto): Promise<TimeSeriesPoint[]>;
  ordersByStatus(range: AnalyticsRangeDto): Promise<OrderStatusBreakdown[]>;
  topProducts(range: AnalyticsRangeDto, limit: number): Promise<TopProduct[]>;
  customerInsights(range: AnalyticsRangeDto): Promise<CustomerInsight>;
  offerRedemptionCount(range: AnalyticsRangeDto): Promise<number>;
  refundTotalPaise(range: AnalyticsRangeDto): Promise<number>;
}
