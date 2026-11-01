import type { ApiSuccess } from "@/core/network/http";

/** The three UI surfaces that may legitimately own a reCAPTCHA host. */
export type AuthFlowId = "login" | "otp" | "checkout";

export type HostFailure =
  | "HOST_CONFLICT"
  | "RECAPTCHA_NOT_BOUND"
  | "RECAPTCHA_CONTAINER_NOT_READY"
  | "RECAPTCHA_RENDER_FAILED";

export type AuthAttemptFailure =
  | "AUTH_OTP_IN_FLIGHT"
  | "AUTH_OTP_COOLDOWN"
  | "AUTH_LAST_ATTEMPT_UNKNOWN"
  | "CHALLENGE_ACTIVE_OTHER_FLOW"
  | "CHALLENGE_MISMATCH"
  | "NO_CHALLENGE"
  | "STALE_EPOCH"
  | "AUTH_ATTEMPT_INVALIDATED";

export interface AuthErrorDetails {
  flow?: AuthFlowId;
  maskedPhone?: string;
  handle?: string;
  seconds?: number;
}

export interface AuthFailure {
  success: false;
  error: {
    code: string;
    message: string;
    retryable?: boolean;
    details?: AuthErrorDetails;
  };
}

export type AuthApiResult<T> = ApiSuccess<T> | AuthFailure;

/**
 * Customer-facing copy for every auth failure we author. Provider text is
 * never used: Firebase messages can contain the phone number, the raw code,
 * or project configuration.
 */
const COPY: Record<string, string> = {
  AUTH_OTP_IN_FLIGHT: "A verification is already in progress. Please wait a moment.",
  AUTH_LAST_ATTEMPT_UNKNOWN:
    "We couldn't confirm this request. A code may arrive; request a new code to continue.",
  CHALLENGE_ACTIVE_OTHER_FLOW:
    "A verification is already active on another screen. Resume it here or reset it to continue.",
  CHALLENGE_MISMATCH: "That verification code is no longer valid. Request a new code.",
  NO_CHALLENGE: "No active verification session found. Please request a new code.",
  STALE_EPOCH: "This sign-in attempt was cancelled. Please request a new code.",
  AUTH_ATTEMPT_INVALIDATED: "This sign-in attempt was cancelled. Please request a new code.",
  RECAPTCHA_NOT_BOUND: "Verification is not ready on this screen. Please try again.",
  RECAPTCHA_CONTAINER_NOT_READY: "Verification is still loading. Please try again in a moment.",
  RECAPTCHA_RENDER_FAILED: "Verification could not be loaded. Please refresh and try again.",
  HOST_CONFLICT: "This login form is already owned by another open screen.",
  AUTH_INVALID_PHONE: "Please check the mobile number and try again.",
  AUTH_INVALID_CODE: "That code didn't match. Check it and try again.",
  AUTH_CODE_EXPIRED: "That code has expired. Request a new code.",
  AUTH_TOO_MANY_REQUESTS: "Too many attempts. Please wait before requesting another code.",
  AUTH_NETWORK: "We couldn't reach the verification service. Please try again.",
  AUTH_CAPTCHA_FAILED: "Verification failed. Please refresh and try again.",
  AUTH_CREDENTIAL_IN_USE: "This number is already linked to another account.",
  AUTH_INTERNAL: "Something went wrong while verifying. Please try again.",
  AUTH_OTP_REQUEST_FAILED: "Failed to send the SMS verification code. Please try again.",
  AUTH_OTP_VERIFY_FAILED: "Verification failed. Please check the code and try again.",
  AUTH_REFRESH_FAILED: "Your session could not be refreshed. Please sign in again.",
};

const FIREBASE_CODE_MAP: Record<string, string> = {
  "auth/invalid-phone-number": "AUTH_INVALID_PHONE",
  "auth/missing-phone-number": "AUTH_INVALID_PHONE",
  "auth/invalid-verification-code": "AUTH_INVALID_CODE",
  "auth/invalid-verification-id": "AUTH_INVALID_CODE",
  "auth/missing-verification-code": "AUTH_INVALID_CODE",
  "auth/code-expired": "AUTH_CODE_EXPIRED",
  "auth/too-many-requests": "AUTH_TOO_MANY_REQUESTS",
  "auth/quota-exceeded": "AUTH_TOO_MANY_REQUESTS",
  "auth/network-request-failed": "AUTH_NETWORK",
  "auth/captcha-check-failed": "AUTH_CAPTCHA_FAILED",
  "auth/credential-already-in-use": "AUTH_CREDENTIAL_IN_USE",
  "auth/internal-error": "AUTH_INTERNAL",
};

/** Reads only the SDK code field; never message/customData (they may hold PII). */
export function firebaseAuthCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && code.length <= 96 ? code : null;
}

export function mapFirebaseAuthCode(error: unknown, fallback: string): string {
  const raw = firebaseAuthCode(error);
  if (!raw) return fallback;
  return FIREBASE_CODE_MAP[raw] ?? fallback;
}

export function authCopy(code: string, details?: AuthErrorDetails): string {
  if (code === "AUTH_OTP_COOLDOWN") {
    const seconds = Math.max(1, Math.ceil(details?.seconds ?? 1));
    return `Please wait ${seconds}s before requesting a new code.`;
  }
  return COPY[code] ?? "Something went wrong. Please try again.";
}

const AUTHORED_COPY_VALUES = new Set(Object.values(COPY));
const COOLDOWN_COPY_RE = /^Please wait [1-9]\d*s before requesting a new code\.$/;

/** True only for copy this module authored; never for provider text. */
export function isAuthoredAuthMessage(value: unknown): value is string {
  return (
    typeof value === "string" &&
    (AUTHORED_COPY_VALUES.has(value) || COOLDOWN_COPY_RE.test(value))
  );
}

export function authFail(
  code: string,
  details?: AuthErrorDetails,
  retryable = code === "AUTH_NETWORK" || code === "AUTH_TOO_MANY_REQUESTS",
): AuthFailure {
  return {
    success: false,
    error: {
      code,
      message: authCopy(code, details),
      retryable,
      ...(details ? { details } : {}),
    },
  };
}

export function hostFail(code: HostFailure): { ok: false; code: HostFailure } {
  return { ok: false, code };
}

export function isAuthFailure(value: unknown): value is AuthFailure {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as { success?: unknown }).success === false &&
      typeof (value as { error?: { code?: unknown } }).error?.code === "string",
  );
}
