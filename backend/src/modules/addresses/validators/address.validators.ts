import { z } from 'zod';

export const CreateAddressSchema = z.object({
  label: z.string().min(1).max(60),
  line1: z.string().min(1).max(200),
  line2: z.string().max(200).optional(),
  landmark: z.string().max(120).optional(),
  city: z.string().min(1).max(80),
  state: z.string().min(1).max(80),
  pincode: z.string().regex(/^[0-9A-Za-z\- ]{4,12}$/),
  country: z.string().length(2).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  isDefault: z.boolean().optional(),
});

export const UpdateAddressSchema = CreateAddressSchema.partial();
