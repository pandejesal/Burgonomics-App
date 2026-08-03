/**
 * Auth-domain validators. Pure functions — kept out of components so the
 * same rules apply to the UI and future server-side echo checks.
 */

export const PHONE_LENGTH = 10;
export const COUNTRY_CODE = "+91" as const;

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/** Normalises raw input to a digits-only string, trimmed to PHONE_LENGTH. */
export function sanitizePhone(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, PHONE_LENGTH);
}

export function validatePhone(raw: string): ValidationResult {
  const digits = sanitizePhone(raw);
  if (!digits) return { valid: false, error: "Mobile number is required." };
  if (digits.length !== PHONE_LENGTH)
    return { valid: false, error: `Enter a ${PHONE_LENGTH}-digit mobile number.` };
  return { valid: true };
}

export const OTP_LENGTH = 6;

export function validateOtp(raw: string): ValidationResult {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== OTP_LENGTH)
    return { valid: false, error: `Enter the ${OTP_LENGTH}-digit code.` };
  return { valid: true };
}
