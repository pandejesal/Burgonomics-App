/**
 * Uniform API envelope per R-API-001 / R-API-002.
 * All service layer calls return `ApiResult<T>` so screens can render
 * consistent loading / error states without inspecting HTTP internals.
 */
export type ApiSuccess<T> = { success: true; data: T; meta?: Record<string, unknown> };
export type ApiFailure = {
  success: false;
  error: {
    code: string;
    message: string;
    retryable?: boolean;
    /** Server-issued structured data a screen must act on (e.g. PRICE_CHANGED totals). */
    details?: Record<string, unknown>;
  };
};
export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export const ok = <T>(data: T, meta?: Record<string, unknown>): ApiSuccess<T> => ({
  success: true,
  data,
  meta,
});

export const fail = (
  code: string,
  message: string,
  retryable = false,
  details?: Record<string, unknown>,
): ApiFailure => ({
  success: false,
  error: { code, message, retryable, ...(details ? { details } : {}) },
});

export const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
