/**
 * Customer-facing error copy (P1-8).
 *
 * Raw exception text (`PERMISSION_DENIED: …`, `Firebase: Error (auth/…)`,
 * `fetch failed`) and internal server messages must never reach toasts or
 * checkout's red `role="alert"` box. Map structured failures through here:
 * known codes get a friendly string, everything else falls back to a generic
 * message. Log the raw error to console/telemetry separately if needed.
 *
 * Shapes handled by `toUserMessage`:
 *  - `ApiFailure` from core/network/http: `{ success: false, error: { code, message } }`
 *  - a bare `error` object `{ code, message }`
 *  - `AppError` from core/errors/AppError: `{ kind, message }`
 *  - a store/counter result `{ ok: false, error: "<text>" }` → `userMessageForText`
 *  - `Error` / `string` / anything else → generic fallback (message is dropped)
 */
import { messages as appErrorMessages } from "./AppError";

export const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

/** Friendly copy per service error code. Codes not listed here fall back. */
const CODE_MESSAGES: Record<string, string> = {
  // auth / session
  AUTH_REQUIRED: "Please sign in to continue.",
  UNAUTHORIZED: "Please sign in again to continue.",
  SESSION_EXPIRED: "Your session expired. Please sign in again.",
  AUTH_REFRESH_FAILED: "Your session expired. Please sign in again.",
  // Firebase Auth. The SDK's own `auth/*` codes reach the auth store verbatim
  // (P1-13) — namespaced so they cannot collide with our service codes.
  "auth/invalid-verification-code": "That code isn't right. Please check it and try again.",
  "auth/invalid-verification-id": "That code isn't right. Please check it and try again.",
  "auth/missing-verification-code": "Please enter the 6-digit code we sent you.",
  "auth/code-expired": "That code has expired. Please request a new one.",
  "auth/expired-action-code": "That code has expired. Please request a new one.",
  "auth/invalid-phone-number": "That mobile number doesn't look right. Please check it.",
  "auth/too-many-requests": "Too many attempts. Please wait a few minutes and try again.",
  "auth/quota-exceeded": "Too many attempts. Please wait a few minutes and try again.",
  "auth/network-request-failed": "We couldn't reach our servers. Check your connection and try again.",
  "auth/captcha-check-failed": "We couldn't complete the security check. Please refresh and try again.",
  "auth/invalid-app-credential": "We couldn't verify this request. Please refresh and try again.",
  "auth/user-disabled": "This number can't sign in. Please contact support.",
  "auth/operation-not-allowed": "Sign-in isn't available right now. Please try again later.",
  "auth/internal-error": "Something went wrong on our end. Please try again.",
  // network / availability
  NETWORK: "We couldn't reach our servers. Please try again.",
  OFFLINE: "You're offline. Check your connection and try again.",
  BACKEND_UNAVAILABLE: "This service isn't available right now. Please try again later.",
  MAINTENANCE: "We're performing scheduled maintenance. Please check back shortly.",
  // writes / server
  WRITE_FAILED: "We couldn't save your changes. Please try again.",
  SERVER_ERROR: "Something went wrong on our end. Please try again.",
  NOT_FOUND: "We couldn't find what you were looking for.",
  STORE_MISMATCH: "Clear your cart before adding items from a different store.",
  // payments
  GATEWAY_ERROR: "The payment couldn't be started. Please try again.",
  VERIFY_GATEWAY_ERROR: "We couldn't verify your payment. Please try again.",
  VERIFICATION_FAILED: "We couldn't verify your payment. Please try again.",
  INVALID_AMOUNT: "Order amount must be greater than zero.",
  MISSING_ORDER: "We couldn't find an order to pay for. Please try again.",
  // support tickets
  TICKET_SUBMIT_FAILED: "We couldn't send your ticket. Please try again.",
  EVIDENCE_UPLOAD_FAILED: "We couldn't upload your attachment. Please try again.",
  FEEDBACK_SUBMIT_FAILED: "We couldn't send your feedback. Please try again.",
  INVALID_TICKET: "Please add a subject and a short message.",
  INVALID_RATING: "Please select a rating between 1 and 5.",
  // addresses
  INVALID_ADDRESS: "Please check the address fields and try again.",
  INVALID_PROFILE: "Please check your details and try again.",
  NOT_IMPLEMENTED: "This isn't available yet.",
};

type ErrorLike = {
  code?: unknown;
  message?: unknown;
  kind?: unknown;
  error?: unknown;
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

const asCode = (v: unknown): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

/**
 * Friendly customer-facing message for a service error code.
 * Unknown/empty codes → generic fallback.
 */
export function userMessageFor(code?: string): string {
  if (!code) return GENERIC_ERROR_MESSAGE;
  return CODE_MESSAGES[code] ?? GENERIC_ERROR_MESSAGE;
}

/** A Firebase Auth code embedded in raw SDK text: `Firebase: Error (auth/…).` */
const FIREBASE_AUTH_CODE_RE = /\bauth\/[a-z0-9-]+/;

/**
 * Customer-facing copy this app authors itself and that legitimately travels
 * as a bare string (authService curated fallbacks + authStore guards). This is
 * an allow-list, not a blacklist: any string not listed here fails closed to
 * the generic fallback, so unrecognized provider/exception text can never be
 * echoed to customers (P1-13). Strings are kept verbatim with their source.
 */
const AUTHORED_AUTH_COPY = new Set<string>([
  // authStore — store-authored guard copy
  "Please request an OTP first.", // authStore.ts:218
  "No active OTP request.", // authStore.ts:243
  // authService — curated fallbacks when Firebase supplies no code
  "Verification check failed to load. Please refresh the page and try again.", // authService.ts:95
  "Failed to send SMS verification code. Please check the number and try again.", // authService.ts:131
  "No active verification session found. Please request a new code.", // authService.ts:141
  "Invalid verification code. Please check and try again.", // authService.ts:193
]);

/** authStore's store-owned cooldown copy: `Please wait <n>s before…`. */
const AUTH_COOLDOWN_TEXT_RE = /^Please wait [1-9]\d*s before requesting a new code\.$/;

/**
 * Friendly copy for an error that only survives as a *string* (P1-13).
 *
 * The auth store flattens `ApiFailure`s to `error.message`, mixing two
 * different things in one field: raw Firebase text (`Firebase: Error
 * (auth/too-many-requests).`) and messages the store itself authored
 * ("Please wait 12s before requesting a new code."). Known `auth/*` codes are
 * recovered from the text and mapped; only copy this app actually authored
 * (plus the numeric cooldown pattern) passes through; every other string is
 * dropped to the generic fallback.
 */
export function userMessageForText(raw?: string | null): string {
  if (typeof raw !== "string" || raw.trim().length === 0) return GENERIC_ERROR_MESSAGE;

  const code = raw.match(FIREBASE_AUTH_CODE_RE)?.[0];
  if (code) return userMessageFor(code);

  // Fail closed: only authored copy may pass through.
  if (AUTHORED_AUTH_COPY.has(raw) || AUTH_COOLDOWN_TEXT_RE.test(raw)) {
    return raw;
  }
  return GENERIC_ERROR_MESSAGE;
}

/**
 * Map any thrown/returned error to copy that is safe to show customers.
 * Never returns raw exception text.
 */
export function toUserMessage(error: unknown): string {
  // ApiFailure envelope: { success: false, error: { code, message } }
  if (isRecord(error) && isRecord(error.error)) {
    const inner = error.error as ErrorLike;
    const code = asCode(inner.code);
    if (code) return userMessageFor(code);
    return GENERIC_ERROR_MESSAGE;
  }

  if (isRecord(error)) {
    const code = asCode(error.code);
    if (code) return userMessageFor(code);

    // Store/counter result shape: `{ ok: false, error: "<text>" }`. The code
    // (if any) survives only inside the text, so recover it there (P1-13).
    if (typeof error.error === "string") {
      return userMessageForText(error.error);
    }

    // AppError: { kind, message } — reuse the curated kind messages.
    const kind = asCode(error.kind);
    if (kind && kind in appErrorMessages) {
      return appErrorMessages[kind as keyof typeof appErrorMessages];
    }
  }

  // Error instances, strings, and unknown shapes: drop the raw text entirely.
  return GENERIC_ERROR_MESSAGE;
}
