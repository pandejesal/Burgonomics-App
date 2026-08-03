import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import * as https from 'node:https';
import * as http from 'node:http';
import { randomUUID } from 'node:crypto';
import { IntegrationError } from '@common/errors';
import { ERROR_CODES } from '@common/errors/error-codes';
import { MetricsService } from '@infra/observability/metrics/metrics.service';
import { RazorpayCredentialsService } from '../services/razorpay-credentials.service';
import { RAZORPAY_BREAKER_DEFAULTS } from '../constants';
import { CircuitBreaker, CircuitBreakerOpenError } from '@modules/petpooja/http/circuit-breaker';

export interface RazorpayCallOptions {
  correlationId?: string;
  metricLabel?: string;
  maxRetries?: number;
  backoffMs?: number;
  idempotencyKey?: string;
}

/**
 * Production HTTP client for Razorpay REST v1. Uses Basic auth built
 * from (keyId:keySecret), keeps-alive connection pools, retries idempotent
 * calls with jittered exponential backoff, protects the platform with a
 * per-endpoint circuit breaker, and emits Prometheus metrics + structured
 * logs. This client is the ONLY module allowed to speak HTTP to Razorpay.
 */
@Injectable()
export class RazorpayHttpClient implements OnModuleInit {
  private readonly logger = new Logger(RazorpayHttpClient.name);
  private axios!: AxiosInstance;
  private readonly breakers = new Map<string, CircuitBreaker>();

  constructor(
    private readonly credentials: RazorpayCredentialsService,
    private readonly metrics: MetricsService,
  ) {}

  onModuleInit(): void {
    this.axios = axios.create({
      baseURL: this.credentials.baseUrl(),
      timeout: this.credentials.timeoutMs(),
      httpAgent: new http.Agent({ keepAlive: true, maxSockets: 50 }),
      httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 50 }),
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'Burgonomics-Backend/1.0 (+razorpay-integration)',
      },
      transitional: { silentJSONParsing: true, forcedJSONParsing: true },
      validateStatus: () => true,
    });
  }

  private breakerFor(endpoint: string): CircuitBreaker {
    let b = this.breakers.get(endpoint);
    if (!b) {
      b = new CircuitBreaker({ ...RAZORPAY_BREAKER_DEFAULTS, name: endpoint });
      this.breakers.set(endpoint, b);
    }
    return b;
  }

  breakerStates(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [name, b] of this.breakers) out[name] = b.currentState;
    return out;
  }

  async postJson<TResp>(
    endpoint: string,
    body: unknown,
    options: RazorpayCallOptions = {},
  ): Promise<TResp> {
    return this.request<TResp>('POST', endpoint, body, options);
  }

  async getJson<TResp>(endpoint: string, options: RazorpayCallOptions = {}): Promise<TResp> {
    return this.request<TResp>('GET', endpoint, undefined, options);
  }

  private async request<TResp>(
    method: 'GET' | 'POST',
    endpoint: string,
    body: unknown,
    options: RazorpayCallOptions,
  ): Promise<TResp> {
    if (!this.credentials.isConfigured()) {
      throw new IntegrationError(
        ERROR_CODES.RAZORPAY_UPSTREAM,
        'Razorpay credentials are not configured',
      );
    }
    const correlationId = options.correlationId ?? randomUUID();
    const metricLabel = options.metricLabel ?? endpoint;
    const maxRetries = options.maxRetries ?? 3;
    const backoffMs = options.backoffMs ?? 400;
    const breaker = this.breakerFor(metricLabel);

    return breaker.execute(() =>
      this.runWithRetries<TResp>(
        method,
        endpoint,
        body,
        correlationId,
        metricLabel,
        maxRetries,
        backoffMs,
        options.idempotencyKey,
      ),
    );
  }

  private async runWithRetries<TResp>(
    method: 'GET' | 'POST',
    endpoint: string,
    body: unknown,
    correlationId: string,
    metricLabel: string,
    maxRetries: number,
    backoffMs: number,
    idempotencyKey?: string,
  ): Promise<TResp> {
    let attempt = 0;
    let lastError: unknown;
    while (attempt <= maxRetries) {
      try {
        return await this.doCall<TResp>(
          method,
          endpoint,
          body,
          correlationId,
          metricLabel,
          attempt,
          idempotencyKey,
        );
      } catch (err) {
        lastError = err;
        if (err instanceof CircuitBreakerOpenError) throw err;
        if (!this.isRetryable(err) || attempt === maxRetries) break;
        const wait = backoffMs * 2 ** attempt + Math.floor(Math.random() * 150);
        this.logger.warn(
          `[${correlationId}] razorpay retry ${attempt + 1}/${maxRetries} for ${method} ${endpoint} in ${wait}ms — ${(err as Error).message}`,
        );
        await new Promise((r) => setTimeout(r, wait));
        attempt += 1;
      }
    }
    throw this.classify(lastError);
  }

  private async doCall<TResp>(
    method: 'GET' | 'POST',
    endpoint: string,
    body: unknown,
    correlationId: string,
    metricLabel: string,
    attempt: number,
    idempotencyKey?: string,
  ): Promise<TResp> {
    const started = Date.now();
    const requestId = randomUUID();
    const config: AxiosRequestConfig = {
      method,
      url: endpoint,
      data: body,
      auth: {
        username: this.credentials.keyId(),
        password: this.credentials.keySecret(),
      },
      headers: {
        'X-Request-Id': requestId,
        'X-Correlation-Id': correlationId,
        'X-Attempt': String(attempt + 1),
        ...(idempotencyKey ? { 'X-Razorpay-Idempotency-Key': idempotencyKey } : {}),
      },
    };
    const res: AxiosResponse<unknown> = await this.axios.request(config);
    const durationSec = (Date.now() - started) / 1000;
    this.metrics.razorpayLatency.labels(metricLabel).observe(durationSec);
    this.metrics.razorpayCalls.labels(metricLabel, String(res.status)).inc();

    this.logger.log(
      `[${correlationId}] ← razorpay ${method} ${endpoint} ${res.status} (${Math.round(durationSec * 1000)}ms)`,
    );

    if (res.status >= 200 && res.status < 300) {
      return res.data as TResp;
    }
    const body5xx = res.status >= 500;
    const err = new IntegrationError(
      ERROR_CODES.RAZORPAY_UPSTREAM,
      `Razorpay ${method} ${endpoint} responded ${res.status}`,
      { status: res.status, body: res.data },
    );
    // Tag 5xx as retryable via classify()
    if (body5xx) (err as unknown as { _retry: boolean })._retry = true;
    throw err;
  }

  private isRetryable(err: unknown): boolean {
    if (err instanceof IntegrationError) {
      const status = (err.details as { status?: number } | undefined)?.status;
      if (typeof status === 'number' && status >= 500) return true;
      return Boolean((err as unknown as { _retry?: boolean })._retry);
    }
    // Network-level (ECONN*, timeout) errors are retryable.
    const code = (err as { code?: string })?.code;
    if (
      code &&
      ['ECONNRESET', 'ECONNABORTED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'].includes(code)
    ) {
      return true;
    }
    return false;
  }

  private classify(err: unknown): Error {
    if (err instanceof IntegrationError) return err;
    return new IntegrationError(
      ERROR_CODES.RAZORPAY_UPSTREAM,
      (err as Error)?.message ?? 'Razorpay upstream error',
    );
  }
}
