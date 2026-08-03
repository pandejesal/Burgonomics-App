import { z } from 'zod';

export const PhoneSchema = z.string().regex(/^\+[1-9]\d{7,14}$/);

export const RequestOtpSchema = z.object({
  phone: PhoneSchema,
  purpose: z.enum(['LOGIN', 'PHONE_CHANGE', 'ACCOUNT_RECOVERY']).optional(),
});

export const VerifyOtpSchema = z.object({
  phone: PhoneSchema,
  code: z.string().min(4).max(8),
});

export const RefreshSchema = z.object({
  refreshToken: z.string().min(20),
});
