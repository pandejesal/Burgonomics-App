import { z } from 'zod';

export const UpdateUserSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  email: z.string().email().optional(),
  avatarUrl: z.string().url().optional(),
});

export const UpdatePreferencesSchema = z.object({
  language: z.string().min(2).max(10).optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
  notificationsEnabled: z.boolean().optional(),
  marketingOptIn: z.boolean().optional(),
});
