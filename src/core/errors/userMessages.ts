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
  // network / availability
  NETWORK: "We couldn't reach our servers. Please try again.",
  OFFLINE: "You're offline. Check your connection and try again.",
  BACKEND_UNAVAILABLE: "This service isn't available right now. Please try again later.",
  MAINTENANCE: "We're performing scheduled maintenance. Please check back shortly.",
  // writes / server
  WRITE_FAILED: "We couldn't save your changes. Please try again.",
  SERVER_ERROR: "Something went wrong on our end. Please try again.",
  NOT_FOUND: "We couldn't find what you were looking for.",
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

    // AppError: { kind, message } — reuse the curated kind messages.
    const kind = asCode(error.kind);
    if (kind && kind in appErrorMessages) {
      return appErrorMessages[kind as keyof typeof appErrorMessages];
    }
  }

  // Error instances, strings, and unknown shapes: drop the raw text entirely.
  return GENERIC_ERROR_MESSAGE;
}
