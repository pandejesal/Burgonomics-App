import { z } from 'zod';

export const ValidateCouponSchema = z.object({
  code: z.string().min(1).max(64),
  storeId: z.string().optional(),
  cartId: z.string().optional(),
});
export type ValidateCouponInput = z.infer<typeof ValidateCouponSchema>;
