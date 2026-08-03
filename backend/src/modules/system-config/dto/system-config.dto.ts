import { z } from 'zod';

export const setConfigSchema = z.object({
  key: z
    .string()
    .min(2)
    .max(120)
    .regex(/^[a-z0-9._-]+$/),
  value: z.unknown(),
  category: z.string().min(1).max(60).default('general'),
  description: z.string().max(240).optional(),
  changeNote: z.string().max(240).optional(),
});
export type SetConfigDto = z.infer<typeof setConfigSchema>;

export const listConfigQuerySchema = z.object({
  category: z.string().optional(),
});
export type ListConfigQueryDto = z.infer<typeof listConfigQuerySchema>;
