import { z } from 'zod';

export const listAuditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  actorId: z.string().optional(),
  action: z.string().optional(),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  q: z.string().max(120).optional(),
});
export type ListAuditQueryDto = z.infer<typeof listAuditQuerySchema>;

export const exportAuditQuerySchema = listAuditQuerySchema.extend({
  format: z.enum(['csv', 'json']).default('csv'),
});
export type ExportAuditQueryDto = z.infer<typeof exportAuditQuerySchema>;
