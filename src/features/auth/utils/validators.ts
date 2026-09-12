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

/**
 * Normalises raw input to a 10-digit string, stripping +91 country codes and leading zeroes.
 */
export function sanitizePhone(raw: string): string {
  let clean = raw.trim();
  if (clean.startsWith("+91")) {
    clean = clean.slice(3);
  } else if (clean.startsWith("91") && clean.replace(/\D/g, "").length > 10) {
    clean = clean.slice(2);
  } else if (clean.startsWith("0")) {
    clean = clean.replace(/^0+/, "");
  }
  return clean.replace(/\D/g, "").slice(0, PHONE_LENGTH);
}

export function validatePhone(raw: string): ValidationResult {
  const rawClean = raw.trim();
  if (!rawClean) return { valid: false, error: "Mobile number is required." };
  
  const rawDigits = rawClean.replace(/\D/g, "");
  // Check if raw length without country code is oversized
  if (rawClean.startsWith("+91") || (rawClean.startsWith("91") && rawDigits.length > 10)) {
    const stripped = rawClean.startsWith("+91") ? rawClean.slice(3).replace(/\D/g, "") : rawDigits.slice(2);
    if (stripped.length !== PHONE_LENGTH) {
      return { valid: false, error: `Enter a ${PHONE_LENGTH}-digit mobile number.` };
    }
  } else if (rawDigits.length !== PHONE_LENGTH) {
    return { valid: false, error: `Enter a ${PHONE_LENGTH}-digit mobile number.` };
  }

  const digits = sanitizePhone(raw);
  if (digits.length !== PHONE_LENGTH) {
    return { valid: false, error: `Enter a ${PHONE_LENGTH}-digit mobile number.` };
  }
  if (!/^[6-9]/.test(digits)) {
    return { valid: false, error: "Please enter a valid 10-digit Indian mobile number." };
  }
  return { valid: true };
}

export const OTP_LENGTH = 6;

export function validateOtp(raw: string): ValidationResult {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== OTP_LENGTH)
    return { valid: false, error: `Enter the ${OTP_LENGTH}-digit code.` };
  return { valid: true };
}
