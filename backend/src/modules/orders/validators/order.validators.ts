import { z } from 'zod';

export const CancelOrderSchema = z.object({
  reason: z.string().max(240).optional(),
});
export type CancelOrderInput = z.infer<typeof CancelOrderSchema>;
