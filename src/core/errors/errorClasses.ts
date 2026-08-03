/**
 * Reusable domain error classes. All errors thrown across the app should be
 * instances of `BaseAppError` so the UI can render consistent feedback and
 * the observability layer can group by `code`.
 *
 * These classes are transport-agnostic — HTTP status codes are mapped into
 * them by the HTTP client (see `@/core/network`). Feature code should throw
 * these directly instead of raw `Error` instances.
 */
import type { AppErrorKind } from "./AppError";

export abstract class BaseAppError extends Error {
  abstract readonly kind: AppErrorKind;
  readonly retryable: boolean;
  readonly cause?: unknown;

  constructor(message: string, opts: { retryable?: boolean; cause?: unknown } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.retryable = opts.retryable ?? false;
    this.cause = opts.cause;
  }
}

export class AuthenticationError extends BaseAppError {
  readonly kind = "UNAUTHORIZED" as const;
  constructor(message = "Please sign in again to continue.", cause?: unknown) {
    super(message, { retryable: false, cause });
  }
}

export class SessionExpiredError extends BaseAppError {
  readonly kind = "SESSION_EXPIRED" as const;
  constructor(message = "Your session expired.", cause?: unknown) {
    super(message, { retryable: false, cause });
  }
}

export class NetworkError extends BaseAppError {
  readonly kind = "NETWORK" as const;
  constructor(message = "We couldn't reach our servers.", cause?: unknown) {
    super(message, { retryable: true, cause });
  }
}

export class OfflineError extends BaseAppError {
  readonly kind = "OFFLINE" as const;
  constructor(message = "You're offline.", cause?: unknown) {
    super(message, { retryable: true, cause });
  }
}

export class TimeoutError extends BaseAppError {
  readonly kind = "NETWORK" as const;
  constructor(message = "The request timed out.", cause?: unknown) {
    super(message, { retryable: true, cause });
  }
}

export class ValidationError extends BaseAppError {
  readonly kind = "UNKNOWN" as const;
  readonly fieldErrors: Record<string, string>;
  constructor(message = "Please check your input.", fieldErrors: Record<string, string> = {}) {
    super(message, { retryable: false });
    this.fieldErrors = fieldErrors;
  }
}

export class ServerError extends BaseAppError {
  readonly kind = "UNKNOWN" as const;
  readonly status: number;
  constructor(status: number, message = "Something went wrong on our end.", cause?: unknown) {
    super(message, { retryable: true, cause });
    this.status = status;
  }
}

export class MaintenanceError extends BaseAppError {
  readonly kind = "MAINTENANCE" as const;
  constructor(message = "We're performing scheduled maintenance.", cause?: unknown) {
    super(message, { retryable: false, cause });
  }
}

export class NotFoundError extends BaseAppError {
  readonly kind = "NOT_FOUND" as const;
  constructor(message = "We couldn't find what you were looking for.", cause?: unknown) {
    super(message, { retryable: false, cause });
  }
}

export class UnknownError extends BaseAppError {
  readonly kind = "UNKNOWN" as const;
  constructor(message = "Something went wrong.", cause?: unknown) {
    super(message, { retryable: true, cause });
  }
}
