/**
 * Bounded, allowlisted diagnostic serialisation for the Customer logger.
 *
 * Native text capture flattens object arguments to `[object Object]`, while a
 * raw object argument can carry a token, a uid, an order identifier or a
 * provider payload into a console that a remote capture may pick up. This
 * module turns one log call into exactly one JSON string whose shape is fixed
 * and whose fields come from fixed lists (see DIAGNOSTIC-CONTRACT.md).
 *
 * Rules enforced here:
 * - Identity is one of the source-owned event IDs below; any other message —
 *   free text, template string, provider text, order-suffixed quote — collapses
 *   to `app.log`. Nothing is hashed or regex-scrubbed; unknown text is simply
 *   not copied through.
 * - Only allowlisted scalars survive: a bounded HTTP status, a bounded attempt
 *   count, a retryable flag, and recognised standard error codes/types.
 * - Hostile input (getters, proxies, `toJSON`, `toString`, BigInt, cycles) can
 *   neither leak nor throw. Descriptor and prototype *traps* do run — reading a
 *   value without invoking an accessor requires inspecting its descriptor — but
 *   each probe is guarded, accessors/`toJSON`/`toString` are never called, and
 *   nothing is enumerated or recursed.
 * - The output is bounded by construction: every accepted value has a fixed or
 *   short format, so a line cannot approach the 2 KiB ceiling.
 */

export type LogLevel = "debug" | "info" | "warn" | "error" | "critical";

/** Stable identity for anything that is not an allowlisted event ID. */
export const GENERIC_EVENT_ID = "app.log";

/** Hard ceiling; the construction below stays far under it. */
const MAX_EVENT_CHARS = 2048;

/** Fixed product name. Never taken from build configuration (see appIdentity). */
const APP_NAME = "Burgonomics";

/**
 * Source-owned identifiers, taken from the logger call sites that exist in this
 * app. A new call site must add its ID here before its identity can be logged;
 * until then it reports as `app.log` rather than leaking a free-text message.
 */
const EVENT_IDS = [
  "auth.device_link_failed",
  "auth.device_unlink_failed",
  "auth.loyalty_refresh_failed",
  "auth.otp_request_failed",
  "auth.otp_verify_failed",
  "auth.profile_refresh_failed",
  "auth.purged_scoped_caches",
  "auth.recaptcha_clear_failed",
  "auth.recaptcha_render_failed",
  "auth.session_persist_failed",
  "auth.stale_signout_failed",
  "auth.token_read_failed",
  "cart.availability_unverified",
  "cart.revalidate_failed",
  "checkout.fees_auth_unavailable",
  "checkout.fees_invalid_response",
  "checkout.fees_request_failed",
  "checkout.fees_store_not_linked",
  "GlobalErrorBoundary.caught",
  "GlobalErrorBoundary.unhandledrejection",
  "GlobalErrorBoundary.window_error",
  "location.native_error",
  "location.watch_error",
  "location.watcher_setup_failed",
  "loyalty.refresh_failed",
  "notifications.markAllReadDegraded",
  "notifications.markReadDegraded",
  "notifications.preferencesConflict",
  "notifications.preferencesReadError",
  "notifications.preferencesReadFailed",
  "notifications.preferencesReadInvalidResponse",
  "notifications.preferencesReadRejected",
  "notifications.preferencesReadRouteMissing",
  "notifications.preferencesWriteError",
  "notifications.preferencesWriteFailed",
  "notifications.preferencesWriteInvalidResponse",
  "notifications.preferencesWriteRejected",
  "notifications.preferencesWriteRouteMissing",
  "notifications.registerDeviceTokenError",
  "notifications.registerDeviceTokenNoAuth",
  "notifications.tokenRegistered",
  "notifications.unlinkFcmTokensError",
  "notifications.unregisterTokenError",
  "notifications.unregisterTokenFailed",
  "notifications.unregisterTokenNoAuth",
  "notifications.userUnlinkedFromToken",
  "orders.getOrder_failed",
  "orders.tracking_bind_failed",
  "orders.tracking_refresh_failed",
  "orders.tracking_snapshot_failed",
  "ordersService.cancel_persist_failed",
  "ordersService.finalize_server_read_failed",
  "ordersService.firestore_sync_failed",
  "ordersService.history_discarded_stale_auth",
  "ordersService.history_read_failed",
  "ordersService.mark_payment_failed_read_failed",
  "ordersService.quarantined_malformed_order",
  "ordersService.refresh_failed",
  "ordersService.whatsapp_optin_persist_failed",
  "payment.externalWallet",
  "payment.post_gateway_exception",
  "payment.totals_failed",
  "payments.appcheck_unavailable",
  "payments.create_order_failed",
  "payments.create_order_failed_unproven_noncapture",
  "payments.post_gateway_exception",
  "payments.verify_failed",
  "payments.verify_server_false",
  "payments.verify_transfer_in_progress_exhausted",
  "payments.verify_transfer_pending_no_retry_after",
  "pendingUnlinkDropped",
  "pendingUnlinkRecorded",
  "pendingUnlinkReplayed",
  "pendingUnlinkTokenWriteFailed",
  "push.actionPerformed",
  "push.channelCreationWarning",
  "push.droppedForeignRecipient",
  "push.droppedUnresolvedRefSignedOut",
  "push.droppedUnverifiedAccountPurpose",
  "push.initFailed",
  "push.orderConfirmationPromptFailed",
  "push.receivedForeground",
  "push.receivedForegroundWeb",
  "push.registerDeferred",
  "push.registered",
  "push.registrationDeferredForPendingUnlink",
  "push.registrationError",
  "push.requestPermissionsError",
  "push.webInitFailed",
  "push.webPushNoVapidKey",
  "push.webRequestFailed",
  "razorpay.sdk_load_failed",
  "razorpay.sdk_missing_after_load",
  "razorpay.test_runner_simulation",
  "razorpay.zero_charge_complete",
  "razorpay.zero_charge_skip_gateway",
  "route.error",
  "secureStorage.nativeWriteFailedTokenKey",
  "window.error",
  "window.unhandledrejection",
] as const;

const EVENT_ID_SET: ReadonlySet<string> = new Set(EVENT_IDS);

/**
 * Standard error codes, matched as exact literals only. Three families:
 * canonical gRPC/Firestore codes (both casings the SDKs use), the Capacitor
 * `ExceptionCode` values a native bridge rejects with, and the Firebase Auth
 * codes this app's own error map recognises. Anything else — a provider body,
 * a made-up string, a code smuggled through a context object — is omitted.
 */
const ALLOWED_CODES = [
  "aborted",
  "already-exists",
  "cancelled",
  "data-loss",
  "deadline-exceeded",
  "failed-precondition",
  "internal",
  "invalid-argument",
  "not-found",
  "out-of-range",
  "permission-denied",
  "resource-exhausted",
  "unauthenticated",
  "unavailable",
  "unimplemented",
  "unknown",
  "UNAVAILABLE",
  "UNIMPLEMENTED",
  "UNAUTHENTICATED",
  "PERMISSION_DENIED",
  "auth/invalid-phone-number",
  "auth/missing-phone-number",
  "auth/invalid-verification-code",
  "auth/invalid-verification-id",
  "auth/missing-verification-code",
  "auth/code-expired",
  "auth/too-many-requests",
  "auth/quota-exceeded",
  "auth/network-request-failed",
  "auth/captcha-check-failed",
  "auth/credential-already-in-use",
  "auth/internal-error",
] as const;

/** Standard error type names; a custom or provider-supplied name is omitted. */
const ALLOWED_TYPES = [
  "Error",
  "TypeError",
  "RangeError",
  "SyntaxError",
  "ReferenceError",
  "EvalError",
  "URIError",
  "AggregateError",
  "AbortError",
  "DataCloneError",
  "EncodingError",
  "NetworkError",
  "NotAllowedError",
  "QuotaExceededError",
  "TimeoutError",
  "FirebaseError",
] as const;

/** Environments this app recognises; anything else reports as `unknown`. */
const ALLOWED_ENVIRONMENTS = ["development", "staging", "production"] as const;

type AppEnvironmentName = (typeof ALLOWED_ENVIRONMENTS)[number] | "unknown";

/** Public semver only: `major.minor.patch` with optional bounded pre/build. */
const SEMVER = /^\d{1,4}\.\d{1,4}\.\d{1,4}(?:-[0-9A-Za-z.-]{1,32})?(?:\+[0-9A-Za-z.-]{1,32})?$/;

/** Fallback when the configured version is absent or not a bounded semver. */
const UNKNOWN_VERSION = "0.0.0";

/** Prototype depth allowed when looking for one field. */
const MAX_PROTOTYPE_DEPTH = 4;

export interface AppIdentity {
  name: string;
  version: string;
  env: string;
}

/** The fixed shape handed to a sink: allowlisted fields only, no raw payload. */
export interface SanitizedEvent {
  v: 1;
  level: LogLevel;
  event: string;
  timestamp: string;
  app: AppIdentity;
  code?: string;
  type?: string;
  status?: number;
  attempt?: number;
  retryable?: boolean;
}

/**
 * Read `key` only if it is a data property, walking a short prototype chain.
 * Accessors are returned as `undefined` without being called, and a throwing
 * proxy trap ends the walk. Nothing is enumerated or recursively visited.
 */
function readDataProperty(source: unknown, key: string): unknown {
  if (source === null || (typeof source !== "object" && typeof source !== "function")) {
    return undefined;
  }
  let current: object | null = source as object;
  for (let depth = 0; current !== null && depth < MAX_PROTOTYPE_DEPTH; depth += 1) {
    try {
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (descriptor !== undefined) {
        return Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
      }
      current = Object.getPrototypeOf(current);
    } catch {
      // Hostile proxy trap (getOwnPropertyDescriptor / getPrototypeOf).
      return undefined;
    }
  }
  return undefined;
}

function allowedString(value: unknown, allowed: readonly string[]): string | undefined {
  return typeof value === "string" && allowed.includes(value) ? value : undefined;
}

function boundedInteger(value: unknown, min: number, max: number): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max
    ? value
    : undefined;
}

function resolveEventId(message: unknown): string {
  return typeof message === "string" && EVENT_ID_SET.has(message) ? message : GENERIC_EVENT_ID;
}

/**
 * Validate the build identity instead of forwarding configuration strings.
 *
 * `appName`/`appVersion`/`env` come from public environment configuration, so a
 * misconfigured or hostile build could otherwise choose arbitrary text for
 * every diagnostic. The product name is fixed, the environment must be one of
 * the three known values, and the version must be public semver or fall back.
 */
export function appIdentity(rawEnv: unknown, rawVersion: unknown): AppIdentity {
  const env = allowedString(rawEnv, ALLOWED_ENVIRONMENTS);
  const version =
    typeof rawVersion === "string" && rawVersion.length <= 64 && SEMVER.test(rawVersion)
      ? rawVersion
      : UNKNOWN_VERSION;
  // Frozen: callers may share this object, and a sink that writes through it
  // must not be able to rewrite the identity every future event is built from.
  return Object.freeze({
    name: APP_NAME,
    version,
    env: (env ?? "unknown") as AppEnvironmentName,
  });
}

/**
 * A defensive copy of one event, including its nested `app` object.
 *
 * Every sink gets its own copy. Sinks are third-party code — a mutating or
 * throwing one must not be able to rewrite the record another sink is about to
 * receive, nor the validated identity the next event is built from.
 */
export function cloneEvent<T extends SanitizedEvent>(event: T): T {
  return { ...event, app: { ...event.app } };
}

/**
 * Build the one event for a log call. Never throws: every read is guarded, so a
 * proxy trap or a throwing accessor degrades to an omitted field.
 */
export function sanitizeEvent(
  level: LogLevel,
  message: unknown,
  app: AppIdentity,
  error?: unknown,
  context?: unknown,
): SanitizedEvent {
  const record: SanitizedEvent = {
    v: 1,
    level,
    event: resolveEventId(message),
    timestamp: new Date().toISOString(),
    // A copy: the validated identity is shared module state and must never be
    // reachable by reference from an event handed to a sink.
    app: { ...app },
  };

  // Error and context are probed field by field; neither is serialised,
  // enumerated or stringified, and neither can supply `event`/`level`.
  for (const source of [error, context] as const) {
    const code = allowedString(readDataProperty(source, "code"), ALLOWED_CODES);
    if (code !== undefined && record.code === undefined) record.code = code;

    const type = allowedString(readDataProperty(source, "name"), ALLOWED_TYPES);
    if (type !== undefined && record.type === undefined) record.type = type;

    const status = boundedInteger(readDataProperty(source, "status"), 100, 599);
    if (status !== undefined && record.status === undefined) record.status = status;

    const attempt = boundedInteger(readDataProperty(source, "attempt"), 0, 99);
    if (attempt !== undefined && record.attempt === undefined) record.attempt = attempt;

    const retryable = readDataProperty(source, "retryable");
    if (typeof retryable === "boolean" && record.retryable === undefined) {
      record.retryable = retryable;
    }
  }

  return record;
}

/**
 * Serialise one event to its single console argument.
 *
 * Fields are copied explicitly rather than by serialising the object, so a
 * caller-side or future addition (a `message`, an extra key) cannot widen what
 * reaches the console. If the built line ever exceeded the ceiling, the
 * identity degrades to the generic one instead of emitting an oversized record.
 */
export function toDiagnosticLine(event: SanitizedEvent): string {
  const record: Record<string, string | number | boolean | AppIdentity> = {
    v: 1,
    level: event.level,
    event: event.event,
    timestamp: event.timestamp,
    app: event.app,
  };
  if (event.code !== undefined) record.code = event.code;
  if (event.type !== undefined) record.type = event.type;
  if (event.status !== undefined) record.status = event.status;
  if (event.attempt !== undefined) record.attempt = event.attempt;
  if (event.retryable !== undefined) record.retryable = event.retryable;

  const line = JSON.stringify(record);
  if (line.length <= MAX_EVENT_CHARS) return line;

  return JSON.stringify({
    v: 1,
    level: event.level,
    event: GENERIC_EVENT_ID,
    timestamp: event.timestamp,
    app: event.app,
  });
}
