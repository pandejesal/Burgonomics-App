/**
 * HTTP interceptor primitives. Interceptors are pure async functions
 * composed by `httpClient`. Feature code never registers interceptors
 * directly — auth token injection, refresh, logging, and offline detection
 * are wired here so behaviour is consistent across every request.
 */
export interface HttpRequest {
  url: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers: Record<string, string>;
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  retry?: { attempts: number; backoffMs: number };
  meta?: Record<string, unknown>;
}

export interface HttpResponse<T = unknown> {
  ok: boolean;
  status: number;
  data: T;
  headers: Headers;
}

export type RequestInterceptor = (req: HttpRequest) => Promise<HttpRequest> | HttpRequest;
export type ResponseInterceptor = (
  res: HttpResponse,
  req: HttpRequest,
) => Promise<HttpResponse> | HttpResponse;
export type ErrorInterceptor = (
  error: unknown,
  req: HttpRequest,
) => Promise<HttpResponse | never> | HttpResponse | never;

export interface InterceptorRegistry {
  request: RequestInterceptor[];
  response: ResponseInterceptor[];
  error: ErrorInterceptor[];
}

export const createRegistry = (): InterceptorRegistry => ({
  request: [],
  response: [],
  error: [],
});
