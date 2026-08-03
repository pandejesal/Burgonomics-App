import { z } from 'zod';

export const SearchStoresSchema = z.object({
  query: z.string().max(120).optional(),
  city: z.string().max(80).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  radiusKm: z.number().int().min(1).max(50).optional(),
});
