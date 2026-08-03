import { z } from 'zod';

export const OfferUpsertSchema = z.object({
  petpoojaId: z.string().min(1).nullish(),
  code: z.string().min(1).nullish(),
  title: z.string().min(1),
  description: z.string().nullish(),
  type: z.enum(['PROMOTIONAL', 'COUPON', 'COMBO', 'LOYALTY', 'MEMBERSHIP']),
  scope: z.enum(['STORE', 'CATEGORY', 'PRODUCT', 'COMBO', 'CART']),
  discountKind: z.enum(['PERCENTAGE', 'FLAT', 'FREE_ITEM', 'BOGO']),
  discountValue: z.union([z.number(), z.string()]),
  maxDiscount: z.union([z.number(), z.string()]).nullish(),
  minOrderValue: z.union([z.number(), z.string()]).nullish(),
  storeIds: z.array(z.string()).default([]),
  categoryIds: z.array(z.string()).default([]),
  productIds: z.array(z.string()).default([]),
  comboProductIds: z.array(z.string()).default([]),
  requiresLogin: z.boolean().default(false),
  requiresCoupon: z.boolean().default(false),
  usageLimit: z.number().int().positive().nullish(),
  perUserLimit: z.number().int().positive().nullish(),
  startsAt: z.coerce.date().nullish(),
  endsAt: z.coerce.date().nullish(),
  bannerUrl: z.string().url().nullish(),
  displayOrder: z.number().int().nonnegative().default(0),
  isActive: z.boolean().default(true),
  metadata: z.record(z.string(), z.unknown()).nullish(),
});
export type OfferUpsertInput = z.infer<typeof OfferUpsertSchema>;
