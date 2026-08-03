/**
 * Wire-format DTOs returned by the backend. DTO fields mirror the JSON on
 * the wire exactly (snake_case, nullable fields, string timestamps). UI
 * MUST NOT consume DTOs directly — feature repositories map them into
 * `@/core/models` (or feature-local models) before returning.
 */
export interface ApiEnvelopeDto<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; retryable?: boolean };
  meta?: Record<string, unknown>;
}
