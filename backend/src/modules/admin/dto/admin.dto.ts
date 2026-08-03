import { z } from 'zod';

export const dashboardRangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  storeId: z.string().optional(),
});
export type DashboardRangeDto = z.infer<typeof dashboardRangeSchema>;

export const queueActionSchema = z.object({
  jobIds: z.array(z.string()).optional(),
});
export type QueueActionDto = z.infer<typeof queueActionSchema>;

export const broadcastNotificationSchema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(500),
  topic: z.string().max(120).optional(),
  data: z.record(z.string(), z.string()).optional(),
  deeplink: z.string().url().optional(),
});
export type BroadcastNotificationDto = z.infer<typeof broadcastNotificationSchema>;

export const listPaymentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().optional(),
  gatewayPaymentId: z.string().optional(),
  orderId: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type ListPaymentsQueryDto = z.infer<typeof listPaymentsQuerySchema>;

export const webhookReplaySchema = z.object({
  eventId: z.string().min(1),
});
export type WebhookReplayDto = z.infer<typeof webhookReplaySchema>;
