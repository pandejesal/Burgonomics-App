import { z } from 'zod';
import { REPORT_FORMATS, REPORT_TYPES } from '../constants';

export const createReportSchema = z.object({
  type: z.enum(Object.values(REPORT_TYPES) as [string, ...string[]]),
  format: z.enum(REPORT_FORMATS).default('csv'),
  from: z.coerce.date(),
  to: z.coerce.date(),
  storeId: z.string().optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
});
export type CreateReportDto = z.infer<typeof createReportSchema>;

export const listReportsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  type: z.string().optional(),
  status: z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED']).optional(),
});
export type ListReportsQueryDto = z.infer<typeof listReportsQuerySchema>;
