import { z } from 'zod';

export const ModifierOptionUpsertSchema = z.object({
  petpoojaId: z.string().min(1),
  name: z.string().min(1),
  price: z.union([z.number(), z.string()]).default(0),
  displayOrder: z.number().int().nonnegative().default(0),
  isAvailable: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  translations: z.record(z.string(), z.string()).nullish(),
});
export type ModifierOptionUpsertInput = z.infer<typeof ModifierOptionUpsertSchema>;

export const ModifierGroupUpsertSchema = z
  .object({
    petpoojaId: z.string().min(1),
    name: z.string().min(1),
    description: z.string().nullish(),
    minSelection: z.number().int().nonnegative().default(0),
    maxSelection: z.number().int().nonnegative().default(1),
    isRequired: z.boolean().default(false),
    allowMultiple: z.boolean().default(false),
    displayOrder: z.number().int().nonnegative().default(0),
    isAvailable: z.boolean().default(true),
    translations: z.record(z.string(), z.string()).nullish(),
    options: z.array(ModifierOptionUpsertSchema).default([]),
  })
  .refine((g) => g.maxSelection >= g.minSelection, {
    message: 'maxSelection must be >= minSelection',
  });
export type ModifierGroupUpsertInput = z.infer<typeof ModifierGroupUpsertSchema>;
