import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import * as https from 'node:https';
import * as http from 'node:http';
import { randomUUID } from 'node:crypto';
import { IntegrationError } from '@common/errors';
import { ERROR_CODES } from '@common/errors/error-codes';
import { MetricsService } from '@infra/observability/metrics/metrics.service';
import { PetpoojaCredentialsService } from '../services/petpooja-credentials.service';
import {
  PETPOOJA_BREAKER_DEFAULTS,
  PETPOOJA_METRIC_LABELS,
  type PetpoojaEndpoint,
} from '../constants';
import { CircuitBreaker, CircuitBreakerOpenError } from './circuit-breaker';

export interface PetpoojaCallOptions {
  correlationId?: string;
  /** Endpoint label for metrics/log tagging. Defaults to path. */
  metricLabel?: string;
  /** Retries on network/5xx errors (default: 3). */
  maxRetries?: number;
  /** Base backoff in ms; doubled per attempt (default: 500ms). */
  backoffMs?: number;
}

interface CallContext {
  requestId: string;
  correlationId: string;
  metricLabel: string;
  endpoint: PetpoojaEndpoint | string;
  startedAt: number;
}

/**
 * Production HTTP client for PETPOOJA V1. Handles connection pooling,
 * timeouts, exponential-backoff retries (idempotent-safe: PETPOOJA
 * spec treats each POST as idempotent via clientorderID / restID),
 * a per-endpoint circuit breaker, structured logging and Prometheus
 * metrics. Every request injects our `X-Request-Id` header for
 * correlation.
 */
@Injectable()
export class PetpoojaHttpClient implements OnModuleInit {
  private readonly logger = new Logger(PetpoojaHttpClient.name);
  private axios!: AxiosInstance;
  private readonly breakers = new Map<string, CircuitBreaker>();

  constructor(
    private readonly credentials: PetpoojaCredentialsService,
    private readonly metrics: MetricsService,
  ) {}

  onModuleInit(): void {
    const timeout = this.credentials.timeoutMs();
    this.axios = axios.create({
      baseURL: this.credentials.baseUrl(),
      timeout,
      httpAgent: new http.Agent({ keepAlive: true, maxSockets: 50 }),
      httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 50 }),
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'User-Agent': 'Burgonomics-Backend/1.0 (+petpooja-integration)',
      },
      // We only accept JSON responses; PETPOOJA sometimes returns
      // 200 with a stringified body — axios handles both.
      transitional: { silentJSONParsing: true, forcedJSONParsing: true },
      validateStatus: () => true, // classify manually below
    });
  }

  private breakerFor(endpoint: string): CircuitBreaker {
    let b = this.breakers.get(endpoint);
    if (!b) {
      b = new CircuitBreaker({
        ...PETPOOJA_BREAKER_DEFAULTS,
        name: endpoint,
      });
      this.breakers.set(endpoint, b);
    }
    return b;
  }

  breakerStates(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [name, b] of this.breakers) out[name] = b.currentState;
    return out;
  }

  /** POST a JSON body to PETPOOJA and return the parsed response. */
  async postJson<TResp>(
    endpoint: PetpoojaEndpoint | string,
    body: unknown,
    options: PetpoojaCallOptions = {},
  ): Promise<TResp> {
    if (!this.credentials.isConfigured()) {
      throw new IntegrationError(
        ERROR_CODES.PETPOOJA_UPSTREAM,
        'PETPOOJA credentials are not configured',
      );
    }
    const ctx: CallContext = {
      requestId: randomUUID(),
      correlationId: options.correlationId ?? randomUUID(),
      metricLabel: options.metricLabel ?? endpoint,
      endpoint,
      startedAt: Date.now(),
    };
    const maxRetries = options.maxRetries ?? 3;
    const backoffMs = options.backoffMs ?? 500;
    const breaker = this.breakerFor(endpoint);

    return breaker.execute(async () =>
      this.runWithRetries<TResp>(endpoint, body, ctx, maxRetries, backoffMs),
    );
  }

  private async runWithRetries<TResp>(
    endpoint: string,
    body: unknown,
    ctx: CallContext,
    maxRetries: number,
    backoffMs: number,
  ): Promise<TResp> {
    let attempt = 0;
    let lastError: unknown;
    while (attempt <= maxRetries) {
      try {
        const res = await this.doCall<TResp>(endpoint, body, ctx, attempt);
        return res;
      } catch (err) {
        lastError = err;
        if (err instanceof CircuitBreakerOpenError) throw err;
        if (!this.isRetryable(err) || attempt === maxRetries) break;
        const wait = backoffMs * 2 ** attempt + Math.floor(Math.random() * 100);
        this.logger.warn(
          `[${ctx.correlationId}] retry ${attempt + 1}/${maxRetries} for ${endpoint} in ${wait}ms — ${(err as Error).message}`,
        );
        await new Promise((r) => setTimeout(r, wait));
        attempt += 1;
      }
    }
    throw this.classify(lastError, ctx);
  }

  private async doCall<TResp>(
    endpoint: string,
    body: unknown,
    ctx: CallContext,
    attempt: number,
  ): Promise<TResp> {
    const started = Date.now();
    const config: AxiosRequestConfig = {
      method: 'POST',
      url: endpoint,
      data: body,
      headers: {
        'X-Request-Id': ctx.requestId,
        'X-Correlation-Id': ctx.correlationId,
        'X-Attempt': String(attempt + 1),
      },
      decompress: true,
    };
    const res: AxiosResponse<TResp> = await this.axios.request(config);
    const durationSec = (Date.now() - started) / 1000;
    this.metrics.petpoojaLatency.labels(ctx.metricLabel).observe(durationSec);

    if (res.status >= 500) {
      this.metrics.petpoojaCalls.labels(ctx.metricLabel, String(res.status)).inc();
      const message = `PETPOOJA ${endpoint} responded ${res.status}`;
      this.logger.error(
        `[${ctx.correlationId}] ${message} — body=${JSON.stringify(res.data).slice(0, 512)}`,
      );
      throw new IntegrationError(ERROR_CODES.PETPOOJA_UPSTREAM, message, {
        status: res.status,
        body: res.data,
      });
    }
    if (res.status >= 400) {
      this.metrics.petpoojaCalls.labels(ctx.metricLabel, String(res.status)).inc();
      throw new IntegrationError(
        ERROR_CODES.PETPOOJA_UPSTREAM,
        `PETPOOJA ${endpoint} rejected request (${res.status})`,
        { status: res.status, body: res.data },
      );
    }
    this.metrics.petpoojaCalls.labels(ctx.metricLabel, String(res.status)).inc();
    this.logger.log(
      `[${ctx.correlationId}] ← PETPOOJA ${endpoint} ${res.status} (${Math.round(durationSec * 1000)}ms)`,
    );
    return res.data;
  }

  private isRetryable(err: unknown): boolean {
    if (err instanceof IntegrationError) {
      const status = (err.details as { status?: number } | undefined)?.status;
      return !status || status >= 500;
    }
    if (axios.isAxiosError(err)) {
      const ax = err as AxiosError;
      if (!ax.response) return true; // network / timeout
      return ax.response.status >= 500;
    }
    return true; // unknown → be conservative and retry once
  }

  private classify(err: unknown, ctx: CallContext): Error {
    if (err instanceof IntegrationError) return err;
    if (axios.isAxiosError(err)) {
      this.metrics.petpoojaCalls.labels(ctx.metricLabel, 'network_error').inc();
      return new IntegrationError(
        ERROR_CODES.PETPOOJA_UPSTREAM,
        `PETPOOJA network error on ${ctx.endpoint}: ${err.message}`,
        { code: err.code, url: err.config?.url },
      );
    }
    return err instanceof Error ? err : new Error(String(err));
  }
}
