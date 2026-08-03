import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';
import { granularityToTruncUnit } from '../../services/time-bucket.util';
import type {
  AnalyticsRangeDto,
  CustomerInsight,
  OrderStatusBreakdown,
  RevenueSummary,
  TimeSeriesPoint,
  TopProduct,
} from '../../dto';
import type { IAnalyticsRepository } from '../interfaces/analytics-repository.interface';

/**
 * Read-only analytics aggregations over the operational database.
 *
 * Every query is bounded by (from, to] and optional storeId. For very
 * large timeframes an OLAP roll-up should be substituted; the
 * repository interface makes that swap invisible to callers.
 */
@Injectable()
export class AnalyticsPrismaRepository implements IAnalyticsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private orderWhere(range: AnalyticsRangeDto): Prisma.OrderWhereInput {
    return {
      placedAt: { gte: range.from, lte: range.to },
      ...(range.storeId ? { storeId: range.storeId } : {}),
    };
  }

  async revenueSummary(range: AnalyticsRangeDto): Promise<RevenueSummary> {
    const [agg, refundsPaise] = await Promise.all([
      this.prisma.order.aggregate({
        where: this.orderWhere(range),
        _sum: { grandTotal: true },
        _count: { _all: true },
      }),
      this.refundTotalPaise(range),
    ]);
    const totalRupees = Number(agg._sum.grandTotal ?? 0);
    const totalRevenuePaise = Math.round(totalRupees * 100);
    const orderCount = agg._count._all;
    const netRevenuePaise = totalRevenuePaise - refundsPaise;
    const aov = orderCount ? totalRevenuePaise / orderCount : 0;
    return { totalRevenuePaise, netRevenuePaise, refundsPaise, orderCount, aov };
  }

  private async bucketSeries(
    range: AnalyticsRangeDto,
    field: 'revenue' | 'orders',
  ): Promise<TimeSeriesPoint[]> {
    const unit = granularityToTruncUnit(range.granularity);
    const value =
      field === 'revenue'
        ? Prisma.sql`COALESCE(SUM("grandTotal"), 0)::float8`
        : Prisma.sql`COUNT(*)::float8`;
    const storeCondition = range.storeId
      ? Prisma.sql`AND "storeId" = ${range.storeId}`
      : Prisma.sql``;
    const rows = await this.prisma.$queryRaw<Array<{ bucket: Date; v: number }>>(
      Prisma.sql`
        SELECT date_trunc(${unit}, "placedAt") AS bucket, ${value} AS v
        FROM orders
        WHERE "placedAt" BETWEEN ${range.from} AND ${range.to} ${storeCondition}
        GROUP BY bucket
        ORDER BY bucket ASC
      `,
    );
    return rows.map((r) => ({ bucket: r.bucket.toISOString(), value: Number(r.v) }));
  }

  revenueSeries(range: AnalyticsRangeDto): Promise<TimeSeriesPoint[]> {
    return this.bucketSeries(range, 'revenue');
  }

  orderCountSeries(range: AnalyticsRangeDto): Promise<TimeSeriesPoint[]> {
    return this.bucketSeries(range, 'orders');
  }

  async ordersByStatus(range: AnalyticsRangeDto): Promise<OrderStatusBreakdown[]> {
    const rows = await this.prisma.order.groupBy({
      by: ['status'],
      where: this.orderWhere(range),
      _count: { _all: true },
    });
    return rows.map((r) => ({ status: r.status, count: r._count._all }));
  }

  async topProducts(range: AnalyticsRangeDto, limit: number): Promise<TopProduct[]> {
    const storeCondition = range.storeId
      ? Prisma.sql`AND o."storeId" = ${range.storeId}`
      : Prisma.sql``;
    const rows = await this.prisma.$queryRaw<
      Array<{ productId: string; name: string; units: number; revenue: number }>
    >(
      Prisma.sql`
        SELECT oi."productId" as "productId",
               MAX(oi."name") as name,
               SUM(oi.quantity)::int as units,
               SUM(oi."lineTotal")::float8 as revenue
        FROM order_items oi
        JOIN orders o ON o.id = oi."orderId"
        WHERE o."placedAt" BETWEEN ${range.from} AND ${range.to} ${storeCondition}
        GROUP BY oi."productId"
        ORDER BY revenue DESC
        LIMIT ${limit}
      `,
    );
    return rows.map((r) => ({
      productId: r.productId,
      name: r.name ?? r.productId,
      units: Number(r.units),
      revenuePaise: Math.round(Number(r.revenue) * 100),
    }));
  }

  async customerInsights(range: AnalyticsRangeDto): Promise<CustomerInsight> {
    const orders = await this.prisma.order.findMany({
      where: this.orderWhere(range),
      select: { userId: true },
    });
    const userIds = Array.from(new Set(orders.map((o) => o.userId)));
    if (userIds.length === 0) {
      return { newCustomers: 0, returningCustomers: 0, totalActive: 0 };
    }
    const firstOrders = await this.prisma.order.groupBy({
      by: ['userId'],
      where: { userId: { in: userIds } },
      _min: { placedAt: true },
    });
    let newCount = 0;
    for (const f of firstOrders) {
      if (f._min.placedAt && f._min.placedAt >= range.from && f._min.placedAt <= range.to) {
        newCount += 1;
      }
    }
    return {
      newCustomers: newCount,
      returningCustomers: userIds.length - newCount,
      totalActive: userIds.length,
    };
  }

  async offerRedemptionCount(range: AnalyticsRangeDto): Promise<number> {
    return this.prisma.couponRedemption.count({
      where: {
        createdAt: { gte: range.from, lte: range.to },
      },
    });
  }

  async refundTotalPaise(range: AnalyticsRangeDto): Promise<number> {
    const agg = await this.prisma.refund.aggregate({
      where: { createdAt: { gte: range.from, lte: range.to } },
      _sum: { amount: true },
    });
    return Math.round(Number(agg._sum.amount ?? 0) * 100);
  }
}
