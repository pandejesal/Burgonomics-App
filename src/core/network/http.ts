/**
 * Uniform API envelope per R-API-001 / R-API-002.
 * All service layer calls return `ApiResult<T>` so screens can render
 * consistent loading / error states without inspecting HTTP internals.
 */
export type ApiSuccess<T> = { success: true; data: T; meta?: Record<string, unknown> };
export type ApiFailure = {
  success: false;
  error: { code: string; message: string; retryable?: boolean };
};
export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export const ok = <T>(data: T, meta?: Record<string, unknown>): ApiSuccess<T> => ({
  success: true,
  data,
  meta,
});

export const fail = (code: string, message: string, retryable = false): ApiFailure => ({
  success: false,
  error: { code, message, retryable },
});

export const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
