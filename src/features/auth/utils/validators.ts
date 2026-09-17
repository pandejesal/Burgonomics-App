/**
 * Auth-domain validators. Pure functions — kept out of components so the
 * same rules apply to the UI and future server-side echo checks.
 */

export const PHONE_LENGTH = 10;
export const COUNTRY_CODE = "+91" as const;

/** Single OTP delivery default (L3): login + store + service all use SMS. */
export const DEFAULT_DELIVERY_METHOD: "whatsapp" | "sms" = "sms";

/** Strict Indian mobile rule, single source (M7): first digit 6–9. */
export const INDIAN_MOBILE_RE = /^[6-9]\d{9}$/;

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/** Normalises raw input to a digits-only string, trimmed to PHONE_LENGTH. */
export function sanitizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  // Strip the +91/91 country prefix so "+919825012345" → "9825012345".
  if (digits.length > PHONE_LENGTH && digits.startsWith("91")) {
    digits = digits.slice(2);
  }
  // Strip trunk-prefix zeros so "09825012345" → "9825012345".
  digits = digits.replace(/^0+/, "");
  return digits.slice(0, PHONE_LENGTH);
}

/** Normalise without truncation — validation must see overlong input. */
function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.length > PHONE_LENGTH && digits.startsWith("91")) {
    digits = digits.slice(2);
  }
  return digits.replace(/^0+/, "");
}

export function validatePhone(raw: string): ValidationResult {
  if (!raw.replace(/\D/g, "")) return { valid: false, error: "Mobile number is required." };
  const digits = normalizePhone(raw);
  if (digits.length !== PHONE_LENGTH)
    return { valid: false, error: `Enter a ${PHONE_LENGTH}-digit mobile number.` };
  // Fail-closed: 0000000000, 1234567890, 5-series etc. are all rejected here.
  if (!INDIAN_MOBILE_RE.test(digits))
    return { valid: false, error: "Please enter a valid 10-digit Indian mobile number." };
  return { valid: true };
}

export const OTP_LENGTH = 6;

export function validateOtp(raw: string): ValidationResult {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== OTP_LENGTH)
    return { valid: false, error: `Enter the ${OTP_LENGTH}-digit code.` };
  return { valid: true };
}

/**
 * Validates a JWT token format and expiration.
 * Does NOT verify signature (that's server-side only).
 * Returns true if token appears valid and not expired.
 */
export function isJwtExpired(token: string | null | undefined): boolean {
  if (!token || typeof token !== 'string') return true;
  
  const parts = token.split('.');
  if (parts.length !== 3) return true;
  
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (!payload.exp || typeof payload.exp !== 'number') return true;
    
    const now = Math.floor(Date.now() / 1000);
    // Add 30 second buffer for clock skew
    return payload.exp < (now + 30);
  } catch {
    return true;
  }
}
