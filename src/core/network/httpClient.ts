/**
 * Centralised HTTP client.
 *
 * Responsibilities:
 * - Compose global request/response/error interceptors (auth, refresh,
 *   logging, offline detection).
 * - Enforce per-request timeout via `AbortController`.
 * - Retry idempotent failures with exponential backoff.
 * - Map transport failures to typed `BaseAppError` subclasses so UI code
 *   never inspects raw HTTP internals.
 */
import { appConfig } from "@/core/config";
import {
  MaintenanceError,
  NetworkError,
  NotFoundError,
  OfflineError,
  ServerError,
  SessionExpiredError,
  TimeoutError,
  AuthenticationError,
  UnknownError,
} from "@/core/errors";
import {
  createRegistry,
  type HttpRequest,
  type HttpResponse,
  type InterceptorRegistry,
  type RequestInterceptor,
  type ResponseInterceptor,
  type ErrorInterceptor,
} from "./interceptors";

export interface HttpClientOptions {
  baseUrl?: string;
  defaultHeaders?: Record<string, string>;
  timeoutMs?: number;
  retry?: { attempts: number; backoffMs: number };
}

/** HTTP methods that are safe to retry on transient failure. */
const IDEMPOTENT_METHODS = new Set(["GET", "PUT", "DELETE"]);

export class HttpClient {
  private readonly registry: InterceptorRegistry = createRegistry();
  private readonly options: Required<HttpClientOptions>;

  constructor(options: HttpClientOptions = {}) {
    const baseUrl = options.baseUrl ?? appConfig.api.baseUrl;
    // Cleartext API transport must be a conscious choice, never a typo'd env:
    // allow http only for local dev loopback.
    const isDevLoopback = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(`${baseUrl}/`);
    if (
      !baseUrl.startsWith("https://") &&
      !(import.meta.env?.DEV && isDevLoopback) &&
      baseUrl.length > 0
    ) {
      throw new Error(`Refusing cleartext API base URL: ${baseUrl}`);
    }
    this.options = {
      baseUrl,
      defaultHeaders: options.defaultHeaders ?? { "content-type": "application/json" },
      timeoutMs: options.timeoutMs ?? appConfig.api.timeoutMs,
      retry: options.retry ?? appConfig.api.retry,
    };
  }

  useRequest(i: RequestInterceptor) {
    this.registry.request.push(i);
    return this;
  }
  useResponse(i: ResponseInterceptor) {
    this.registry.response.push(i);
    return this;
  }
  useError(i: ErrorInterceptor) {
    this.registry.error.push(i);
    return this;
  }

  get<T>(url: string, init?: Partial<HttpRequest>) {
    return this.request<T>({ ...init, url, method: "GET" });
  }
  post<T>(url: string, body?: unknown, init?: Partial<HttpRequest>) {
    return this.request<T>({ ...init, url, method: "POST", body });
  }
  put<T>(url: string, body?: unknown, init?: Partial<HttpRequest>) {
    return this.request<T>({ ...init, url, method: "PUT", body });
  }
  patch<T>(url: string, body?: unknown, init?: Partial<HttpRequest>) {
    return this.request<T>({ ...init, url, method: "PATCH", body });
  }
  delete<T>(url: string, init?: Partial<HttpRequest>) {
    return this.request<T>({ ...init, url, method: "DELETE" });
  }

  async request<T>(
    input: Partial<HttpRequest> & { url: string; method: HttpRequest["method"] },
  ): Promise<HttpResponse<T>> {
    let req: HttpRequest = {
      url: this.resolveUrl(input.url),
      method: input.method,
      headers: { ...this.options.defaultHeaders, ...(input.headers ?? {}) },
      body: input.body,
      signal: input.signal,
      timeoutMs: input.timeoutMs ?? this.options.timeoutMs,
      retry: input.retry ?? this.options.retry,
      meta: input.meta,
    };

    // Run request interceptors (e.g. auth token injection).
    for (const i of this.registry.request) req = await i(req);

    const retryConfig = req.retry ?? this.options.retry;
    const maxAttempts = IDEMPOTENT_METHODS.has(req.method) ? retryConfig.attempts : 1;

    let lastError: unknown;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await this.dispatch<T>(req);

        // Run response interceptors.
        let res = response;
        for (const i of this.registry.response) res = (await i(res, req)) as HttpResponse<T>;
        return res;
      } catch (err) {
        lastError = err;

        // Let error interceptors attempt recovery (e.g. token refresh → retry).
        for (const i of this.registry.error) {
          try {
            return (await i(err, req)) as HttpResponse<T>;
          } catch {
            /* interceptor could not recover — continue to next or rethrow */
          }
        }

        // Only retry on transient network/server errors, not client errors.
        const isRetryable = isTransientError(err);
        if (!isRetryable || attempt >= maxAttempts - 1) {
          throw mapTransportError(lastError);
        }

        // Exponential backoff: backoffMs * 2^attempt (e.g. 400, 800, 1600…)
        const delay = retryConfig.backoffMs * Math.pow(2, attempt);
        await sleep(delay);
      }
    }

    throw mapTransportError(lastError);
  }

  /**
   * Perform the actual `fetch()` call with timeout enforcement.
   */
  private async dispatch<T>(req: HttpRequest): Promise<HttpResponse<T>> {
    const controller = new AbortController();
    const timeoutMs = req.timeoutMs ?? this.options.timeoutMs;

    // Merge caller signal with timeout signal.
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // If the caller provided a signal, forward its abort to our controller.
    if (req.signal) {
      if (req.signal.aborted) {
        controller.abort();
      } else {
        req.signal.addEventListener("abort", () => controller.abort(), { once: true });
      }
    }

    try {
      const fetchInit: RequestInit = {
        method: req.method,
        headers: req.headers,
        signal: controller.signal,
      };

      // Attach body for non-GET/DELETE methods.
      if (req.body !== undefined && req.method !== "GET") {
        fetchInit.body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
      }

      const raw = await fetch(req.url, fetchInit);

      // Parse JSON body (or null for 204 No Content).
      let data: T;
      const contentType = raw.headers.get("content-type") ?? "";
      if (raw.status === 204 || !contentType.includes("application/json")) {
        data = null as T;
      } else {
        data = (await raw.json()) as T;
      }

      const response: HttpResponse<T> = {
        ok: raw.ok,
        status: raw.status,
        data,
        headers: raw.headers,
      };

      // Throw on non-2xx so error interceptors and retry logic can handle it.
      if (!raw.ok) {
        throw Object.assign(new Error(`HTTP ${raw.status}`), {
          status: raw.status,
          response,
        });
      }

      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private resolveUrl(url: string) {
    if (/^https?:\/\//i.test(url)) return url;
    const base = this.options.baseUrl.replace(/\/$/, "");
    return `${base}/${url.replace(/^\//, "")}`;
  }
}

/**
 * Determines if an error is transient (network flake, 5xx) and worth retrying.
 */
function isTransientError(err: unknown): boolean {
  // Network failures (fetch rejected).
  if (err instanceof TypeError) return true;
  // Timeout (AbortError).
  if (err instanceof Error && err.name === "AbortError") return true;
  // Server errors (5xx) — excluding 503 (maintenance) which maps to
  // MaintenanceError (retryable: false). Retrying a maintenance window
  // wastes backoff time without improving the outcome.
  if (err && typeof err === "object" && "status" in err) {
    const status = Number((err as { status: unknown }).status);
    return status >= 500 && status !== 503;
  }
  return false;
}

/**
 * Maps low-level transport failures (fetch rejection, HTTP status) into the
 * app's typed error taxonomy. Called from `HttpClient` and available to
 * feature code that wraps third-party SDKs.
 */
export const mapTransportError = (err: unknown): Error => {
  if (err instanceof Error && err.name === "AbortError") return new TimeoutError();
  if (typeof navigator !== "undefined" && navigator.onLine === false) return new OfflineError();
  if (err && typeof err === "object" && "status" in err) {
    const status = Number((err as { status: unknown }).status);
    if (status === 401) return new AuthenticationError();
    if (status === 403) return new SessionExpiredError();
    if (status === 404) return new NotFoundError();
    if (status === 503) return new MaintenanceError();
    if (status >= 500) return new ServerError(status);
  }
  if (
    err instanceof TypeError ||
    (err instanceof Error && err.message?.includes("Failed to fetch"))
  ) {
    return new NetworkError(
      "Server unreachable. Please check connection or try again.",
      err as Error,
    );
  }
  if (err instanceof Error) return new NetworkError(err.message, err);
  return new UnknownError();
};

/** Simple promise-based sleep for backoff delays. */
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Shared singleton — feature repositories should import this. */
export const httpClient = new HttpClient();
