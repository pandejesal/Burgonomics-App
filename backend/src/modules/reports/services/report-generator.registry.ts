import { Injectable } from '@nestjs/common';
import { AnalyticsService } from '@modules/analytics';
import type { ReportType } from '../constants';
import type { ReportRow } from './report-exporter.service';

export interface GenerateInput {
  from: Date;
  to: Date;
  storeId?: string;
  filters?: Record<string, unknown>;
}

/**
 * Deterministic report row producer. Each generator returns a flat
 * tabular payload that the exporter serializes into the requested
 * format. Heavy analytical aggregations delegate into AnalyticsService.
 */
@Injectable()
export class ReportGeneratorRegistry {
  constructor(private readonly analytics: AnalyticsService) {}

  async generate(type: ReportType, input: GenerateInput): Promise<ReportRow[]> {
    const range = {
      from: input.from,
      to: input.to,
      granularity: 'day' as const,
      storeId: input.storeId,
    };
    switch (type) {
      case 'sales': {
        const series = await this.analytics.revenueSeries(range);
        return series.map((p) => ({ date: p.bucket, revenuePaise: p.value }));
      }
      case 'orders': {
        const series = await this.analytics.orderCountSeries(range);
        return series.map((p) => ({ date: p.bucket, orderCount: p.value }));
      }
      case 'refunds': {
        const total = await this.analytics.refundTotal(range);
        return [
          { from: input.from.toISOString(), to: input.to.toISOString(), refundTotalPaise: total },
        ];
      }
      case 'tax': {
        const revenue = await this.analytics.revenueSummary(range);
        return [
          {
            from: input.from.toISOString(),
            to: input.to.toISOString(),
            revenuePaise: revenue.totalRevenuePaise,
          },
        ];
      }
      case 'offers': {
        const count = await this.analytics.offerRedemptions(range);
        return [{ from: input.from.toISOString(), to: input.to.toISOString(), redemptions: count }];
      }
      case 'stores': {
        const status = await this.analytics.ordersByStatus(range);
        return status.map((s) => ({ status: s.status, count: s.count }));
      }
      case 'customers': {
        const insight = await this.analytics.customerInsights(range);
        return [
          {
            newCustomers: insight.newCustomers,
            returningCustomers: insight.returningCustomers,
            totalActive: insight.totalActive,
          },
        ];
      }
      case 'inventory': {
        // Inventory data lives in PETPOOJA; expose the current top-selling
        // products as a proxy so the report set is always populated.
        const top = await this.analytics.topProducts(range, 50);
        return top.map((t) => ({
          productId: t.productId,
          name: t.name,
          units: t.units,
          revenuePaise: t.revenuePaise,
        }));
      }
    }
  }
}
