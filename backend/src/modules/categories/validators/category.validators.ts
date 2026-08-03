import { z } from 'zod';

/** Schema used by the PETPOOJA synchronization pipeline to validate
 * upstream category payloads before they touch the database. */
export const CategoryUpsertSchema = z.object({
  petpoojaId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullish(),
  imageUrl: z.string().url().nullish(),
  bannerUrl: z.string().url().nullish(),
  displayOrder: z.number().int().nonnegative().default(0),
  isVisible: z.boolean().default(true),
  isAvailable: z.boolean().default(true),
  parentPetpoojaId: z.string().nullish(),
  translations: z.record(z.string(), z.string()).nullish(),
});
export type CategoryUpsertInput = z.infer<typeof CategoryUpsertSchema>;
