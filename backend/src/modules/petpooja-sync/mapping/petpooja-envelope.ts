import { z } from 'zod';

/**
 * Placeholder DTO mapping layer. When the PETPOOJA HTTP client is wired
 * (Phase 4+), each function converts the upstream payload into the
 * canonical domain-side upsert input. The catalog services never see
 * PETPOOJA's raw JSON — they only see these validated inputs.
 */
export const PetpoojaMenuEnvelopeSchema = z.object({
  restaurantId: z.string(),
  version: z.string().optional(),
  categories: z.array(z.record(z.string(), z.unknown())).default([]),
  products: z.array(z.record(z.string(), z.unknown())).default([]),
  modifierGroups: z.array(z.record(z.string(), z.unknown())).default([]),
  offers: z.array(z.record(z.string(), z.unknown())).default([]),
});
export type PetpoojaMenuEnvelope = z.infer<typeof PetpoojaMenuEnvelopeSchema>;

export const PetpoojaStoreStatusSchema = z.object({
  restId: z.string(),
  status: z.union([z.literal('0'), z.literal('1')]),
  turnOnTime: z.string().optional(),
});
export type PetpoojaStoreStatus = z.infer<typeof PetpoojaStoreStatusSchema>;

export const PetpoojaStockEventSchema = z.object({
  restId: z.string(),
  itemId: z.string(),
  inStock: z.union([z.literal(0), z.literal(1), z.boolean()]),
});
export type PetpoojaStockEvent = z.infer<typeof PetpoojaStockEventSchema>;
