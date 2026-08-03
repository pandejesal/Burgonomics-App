import { z } from 'zod';

export const registerDeviceSchema = z.object({
  token: z.string().min(10).max(4096),
  platform: z.enum(['IOS', 'ANDROID', 'WEB']),
  appVersion: z.string().max(32).optional(),
  osVersion: z.string().max(32).optional(),
  deviceModel: z.string().max(128).optional(),
  language: z.string().min(2).max(16).optional(),
  timezone: z.string().max(64).optional(),
  pushEnabled: z.boolean().optional(),
});

export const broadcastSchema = z.object({
  type: z.string().min(1).max(128),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
  deeplink: z.string().url().optional(),
  imageUrl: z.string().url().optional(),
  category: z.string().optional(),
  topics: z.array(z.string().min(1)).optional(),
  userIds: z.array(z.string().min(1)).optional(),
});

export type BroadcastPayload = z.infer<typeof broadcastSchema>;
