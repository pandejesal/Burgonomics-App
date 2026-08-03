import { z } from 'zod';

/**
 * PETPOOJA product upsert payload. Note the deliberate absence of any
 * `isVeg` field — the domain forbids representing anything other than
 * pure-veg products. If PETPOOJA ever pushes a non-veg item, the
 * synchronization pipeline is expected to reject it upstream.
 */
export const ProductUpsertSchema = z.object({
  petpoojaId: z.string().min(1),
  categoryPetpoojaId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullish(),
  shortDescription: z.string().nullish(),
  basePrice: z.union([z.number(), z.string()]),
  taxRate: z.union([z.number(), z.string()]).default(0),
  taxCode: z.string().nullish(),
  currency: z.string().default('INR'),
  displayOrder: z.number().int().nonnegative().default(0),
  isAvailable: z.boolean().default(true),
  prepTimeMinutes: z.number().int().nonnegative().nullish(),
  calories: z.number().int().nonnegative().nullish(),
  proteinG: z.union([z.number(), z.string()]).nullish(),
  carbsG: z.union([z.number(), z.string()]).nullish(),
  fatG: z.union([z.number(), z.string()]).nullish(),
  fiberG: z.union([z.number(), z.string()]).nullish(),
  servingSize: z.string().nullish(),
  allergens: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  isPopular: z.boolean().default(false),
  isRecommended: z.boolean().default(false),
  isBestSeller: z.boolean().default(false),
  isFeatured: z.boolean().default(false),
  isSeasonal: z.boolean().default(false),
  seasonalFrom: z.coerce.date().nullish(),
  seasonalTo: z.coerce.date().nullish(),
  translations: z.record(z.string(), z.string()).nullish(),
  images: z
    .array(
      z.object({
        url: z.string().url(),
        altText: z.string().nullish(),
        isPrimary: z.boolean().default(false),
        displayOrder: z.number().int().nonnegative().default(0),
      }),
    )
    .default([]),
  modifierGroupPetpoojaIds: z.array(z.string()).default([]),
});
export type ProductUpsertInput = z.infer<typeof ProductUpsertSchema>;

export const StockUpdateSchema = z.object({
  productPetpoojaId: z.string().min(1),
  storePetpoojaRestId: z.string().min(1),
  inStock: z.boolean(),
});
export type StockUpdateInput = z.infer<typeof StockUpdateSchema>;
