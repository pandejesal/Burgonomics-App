import { z } from 'zod';

export const timeGranularitySchema = z.enum(['hour', 'day', 'week', 'month', 'year']);
export type TimeGranularity = z.infer<typeof timeGranularitySchema>;

export const analyticsRangeSchema = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
    granularity: timeGranularitySchema.default('day'),
    storeId: z.string().optional(),
  })
  .refine((v) => v.from <= v.to, { message: '`from` must be <= `to`' });
export type AnalyticsRangeDto = z.infer<typeof analyticsRangeSchema>;

export interface TimeSeriesPoint {
  bucket: string; // ISO timestamp aligned to bucket start
  value: number;
}

export interface RevenueSummary {
  totalRevenuePaise: number;
  netRevenuePaise: number;
  refundsPaise: number;
  orderCount: number;
  aov: number;
}

export interface OrderStatusBreakdown {
  status: string;
  count: number;
}

export interface TopProduct {
  productId: string;
  name: string;
  units: number;
  revenuePaise: number;
}

export interface CustomerInsight {
  newCustomers: number;
  returningCustomers: number;
  totalActive: number;
}
