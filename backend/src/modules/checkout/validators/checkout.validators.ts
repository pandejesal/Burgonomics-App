import { z } from 'zod';

export const StartCheckoutSchema = z.object({
  cartId: z.string().min(1),
  fulfillment: z.enum(['DELIVERY', 'TAKEAWAY', 'DINE_IN']).optional(),
  addressId: z.string().optional(),
  tableNumber: z.string().optional(),
  couponCode: z.string().max(64).optional(),
  customerNotes: z.string().max(240).optional(),
});
export type StartCheckoutInput = z.infer<typeof StartCheckoutSchema>;
