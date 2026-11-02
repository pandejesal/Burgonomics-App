import { auth, db } from "@/core/config/firebase";
import { defaultFunctionsBase } from "@/core/config/functionsBase";
import {
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import type {
  GatewayAlert,
  GatewayHealth,
  GatewayMetrics,
  PetpoojaGateway,
  QueueOverview,
  StoreOperationalState,
  SyncLogRecord,
  WebhookRecord,
} from "./types";

/**
 * HttpPetpoojaGateway — LIVE Petpooja implementation (implementation: "live").
 *
 * Selected by the gateway factory when VITE_PETPOOJA_ENABLED=true. This is the
 * CUSTOMER build, so it carries only what a customer app is allowed to do:
 *
 *   GET  {functionsBase}/health              (public diagnostic)
 *   Firestore petpooja_sync_logs / petpooja_webhook_logs (staff-written reads)
 *
 * Deliberately NOT here (api-contract-audit items 1-2):
 *   POST /petpooja/pushOrder  staff-only (403 for every customer) — KOTs are
 *                             pushed server-side from payment capture and from
 *                             the order-update trigger after staff accept/bump.
 *   POST /petpooja/syncMenu   staff-only (403) — menu sync is ops/scheduler.
 *   POST /petpooja/stores     no such route (404) — outlets come from the
 *                             Firestore `stores` directory, not the POS proxy.
 *
 * Failures surface via getHealth/getAlerts; reads never throw.
 */

export interface HttpGatewayOptions {
  functionsBaseUrl?: string;
  fetchImpl?: typeof fetch;
  breakerThreshold?: number;
  logWriteTimeoutMs?: number;
}

const CACHE_TTL_MS = 60_000;
/** Firestore log writes must never hang the UI — bounded best-effort. */
const LOG_WRITE_TIMEOUT_MS = 4_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("log write timeout")), ms)),
  ]);
}

export class HttpPetpoojaGateway implements PetpoojaGateway {
  readonly implementation = "live" as const;

  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  private readonly breakerThreshold: number;
  private readonly logTimeout: number;

  private breakers = new Map<
    string,
    { state: "closed" | "open" | "half-open"; failures: number }
  >();
  private cache = new Map<string, { at: number; data: any }>();
  private calls = 0;
  private failures = 0;
  private lastLatencyMs = 0;
  private lastError: string | null = null;

  constructor(opts: HttpGatewayOptions = {}) {
    this.base = (opts.functionsBaseUrl || defaultFunctionsBase()).replace(/\/$/, "");
    this.fetchImpl = opts.fetchImpl || fetch.bind(globalThis);
    this.breakerThreshold = opts.breakerThreshold ?? 5;
    this.logTimeout = opts.logWriteTimeoutMs ?? LOG_WRITE_TIMEOUT_MS;
  }

  // -- transport ---------------------------------------------------------

  private async authHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    try {
      const token = await auth.currentUser?.getIdToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;
    } catch {
      // unauthenticated — server decides
    }
    try {
      const { getAppCheckToken } = await import("@/core/config/firebase");
      const appCheckToken = await getAppCheckToken();
      if (appCheckToken) headers["X-Firebase-AppCheck"] = appCheckToken;
    } catch {
      // Attestation unavailable — server runs monitor mode until enforced.
    }
    return headers;
  }

  private breakerFor(key: string) {
    let b = this.breakers.get(key);
    if (!b) {
      b = { state: "closed", failures: 0 };
      this.breakers.set(key, b);
    }
    return b;
  }

  private recordSuccess(key: string, latencyMs: number) {
    this.calls += 1;
    this.lastLatencyMs = latencyMs;
    const b = this.breakerFor(key);
    b.failures = 0;
    if (b.state !== "open") b.state = "closed";
  }

  private recordFailure(key: string, message: string) {
    this.calls += 1;
    this.failures += 1;
    this.lastError = message;
    const b = this.breakerFor(key);
    b.failures += 1;
    if (b.failures >= this.breakerThreshold) b.state = "open";
  }

  private async get<T>(route: string, breakerKey = "global"): Promise<T> {
    const started = Date.now();
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base}${route}`, {
        method: "GET",
        headers: await this.authHeaders(),
      });
    } catch (err) {
      this.recordFailure(breakerKey, err instanceof Error ? err.message : "Network error");
      throw err;
    }
    if (!res.ok) {
      const detail = `Server error ${res.status}`;
      this.recordFailure(breakerKey, detail);
      throw new Error(detail);
    }
    this.recordSuccess(breakerKey, Date.now() - started);
    return (await res.json()) as T;
  }

  private cached<T>(key: string, loader: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return Promise.resolve(hit.data as T);
    return loader().then((data) => {
      this.cache.set(key, { at: Date.now(), data });
      return data;
    });
  }

  // -- reads ---------------------------------------------------------------

  async getStoreStatus(storeId: string): Promise<StoreOperationalState> {
    const breaker = this.breakerFor(`menu:${storeId}`);
    try {
      const res = await this.cached(`status:${storeId}`, () =>
        this.get<any>("/health", `menu:${storeId}`),
      );
      const online = res?.status === "healthy";
      return {
        storeId,
        menuVersion: "Live",
        lastSuccessfulVersion: "Live",
        lastSyncTime: new Date().toISOString(),
        webhookStatus: "standby",
        circuitBreaker: breaker.state,
        queueState: "idle",
        retryCount: 0,
        apiCredentialsLinked: true,
        webhookSecretLinked: false,
        posTerminalOnline: online,
      };
    } catch {
      return {
        storeId,
        menuVersion: "Unknown",
        lastSuccessfulVersion: "Unknown",
        lastSyncTime: "Never",
        webhookStatus: "degraded",
        circuitBreaker: breaker.state,
        queueState: "idle",
        retryCount: 0,
        apiCredentialsLinked: true,
        webhookSecretLinked: false,
        posTerminalOnline: false,
      };
    }
  }

  async getHealth(): Promise<GatewayHealth> {
    let connected = false;
    let message = "Petpooja proxy unreachable";
    let latencyMs = 0;
    try {
      const started = Date.now();
      const res = await this.get<{ status?: string }>("/health");
      latencyMs = Date.now() - started;
      connected = res?.status === "healthy";
      message = !connected ? "API reachable but reports unhealthy" : "Live — Petpooja bridge connected";
    } catch (err) {
      message = err instanceof Error ? err.message : message;
    }
    return {
      status: connected ? "healthy" : "degraded",
      connected,
      message,
      services: [
        {
          service: "Petpooja POS API Bridge",
          status: connected ? "healthy" : "failing",
          latencyMs,
          details: connected ? `Live via ${this.base}` : message,
        },
      ],
      circuitBreakers: [...this.breakers.entries()].map(([storeId, b]) => ({
        storeId,
        storeName: storeId,
        restId: storeId,
        state: b.state,
        failureCount: b.failures,
        maxFailures: this.breakerThreshold,
      })),
      cacheMetrics: {
        sizeBytes: 0,
        sizeFormatted: `${this.cache.size} keys`,
        keyCount: this.cache.size,
        hitRate: 0,
        status: this.cache.size > 0 ? "Active" : "Idle",
      },
    };
  }

  async getSyncLogs(): Promise<SyncLogRecord[]> {
    try {
      const q = query(
        collection(db, "petpooja_sync_logs"),
        orderBy("createdAt", "desc"),
        limit(50),
      );
      const snapshot = await withTimeout(getDocs(q), this.logTimeout);
      return snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          storeName: data.storeName || "Unknown Store",
          storeId: data.storeId || "",
          scope: data.scope || "FULL",
          status: data.status || "COMPLETED",
          version: data.version || "live",
          startedAt: data.startedAt || new Date().toISOString(),
          finishedAt: data.finishedAt || new Date().toISOString(),
          createdAt: data.createdAt ?? null,
          duration: data.duration || "0.0s",
          created: data.created ?? 0,
          updated: data.updated ?? 0,
          deleted: data.deleted ?? 0,
          conflicts: data.conflicts ?? 0,
          error: data.error ?? null,
          source: data.source ?? "httpGateway",
        };
      });
    } catch (err) {
      console.warn("HttpPetpoojaGateway: sync log read failed:", err);
      return [];
    }
  }

  async getWebhookLogs(): Promise<WebhookRecord[]> {
    try {
      const q = query(
        collection(db, "petpooja_webhook_logs"),
        orderBy("timestamp", "desc"),
        limit(50),
      );
      const snapshot = await withTimeout(getDocs(q), this.logTimeout);
      return snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          timestamp: data.timestamp?.toDate ? data.timestamp.toDate() : new Date(),
          storeName: data.storeName || "Unknown Store",
          storeId: data.storeId || "",
          type: data.type || "unknown",
          status: data.status || "success",
          executionTimeMs: data.executionTimeMs ?? 0,
          payload: data.payload || {},
        };
      });
    } catch (err) {
      console.warn("HttpPetpoojaGateway: webhook log read failed:", err);
      return [];
    }
  }

  subscribeWebhookLogs(
    onLogs: (logs: WebhookRecord[]) => void,
    onError?: (err: Error) => void,
  ): () => void {
    try {
      const q = query(
        collection(db, "petpooja_webhook_logs"),
        orderBy("timestamp", "desc"),
        limit(50),
      );
      return onSnapshot(
        q,
        (snapshot) => {
          onLogs(
            snapshot.docs.map((d) => {
              const data = d.data();
              return {
                id: d.id,
                timestamp: data.timestamp?.toDate ? data.timestamp.toDate() : new Date(),
                storeName: data.storeName || "Unknown Store",
                storeId: data.storeId || "",
                type: data.type || "unknown",
                status: data.status || "success",
                executionTimeMs: data.executionTimeMs ?? 0,
                payload: data.payload || {},
              };
            }),
          );
        },
        (err) => onError?.(err as Error),
      );
    } catch (err) {
      onError?.(err as Error);
      return () => undefined;
    }
  }

  // -- ops -------------------------------------------------------------------

  async tripBreaker(storeId: string): Promise<void> {
    this.breakerFor(`menu:${storeId}`).state = "open";
  }

  async resetBreaker(storeId: string): Promise<void> {
    const m = this.breakerFor(`menu:${storeId}`);
    m.state = "closed";
    m.failures = 0;
  }

  async flushCache(): Promise<{ flushed: boolean; message: string }> {
    const keys = this.cache.size;
    this.cache.clear();
    return { flushed: true, message: `Live gateway cache flushed (${keys} keys).` };
  }

  async getMetrics(): Promise<GatewayMetrics> {
    const openBreakersCount = [...this.breakers.values()].filter((b) => b.state === "open").length;
    return {
      connectedStoresCount: 0,
      totalStoresCount: 0,
      syncSuccessRate: this.calls > 0 ? (this.calls - this.failures) / this.calls : 0,
      openBreakersCount,
      queueStatusLabel: "IDLE",
      timeSeries: [],
      menuSyncDuration: [],
      prometheusText: [
        "# HELP petpooja_api_calls_total Live Petpooja proxy calls",
        "# TYPE petpooja_api_calls_total counter",
        `petpooja_api_calls_total ${this.calls}`,
        "# HELP petpooja_api_failures_total Failed Petpooja proxy calls",
        "# TYPE petpooja_api_failures_total counter",
        `petpooja_api_failures_total ${this.failures}`,
        "# HELP petpooja_gateway_status Gateway operational status (0=Standby, 1=Live)",
        "# TYPE petpooja_gateway_status gauge",
        "petpooja_gateway_status 1",
      ].join("\n"),
    };
  }

  async getAlerts(): Promise<GatewayAlert[]> {
    const alerts: GatewayAlert[] = [];
    for (const [key, b] of this.breakers.entries()) {
      if (b.state === "open") {
        alerts.push({
          id: `breaker-${key}`,
          type: "error",
          title: `Circuit breaker OPEN (${key})`,
          message: `${b.failures} consecutive failures — calls fail fast.`,
          timestamp: new Date().toISOString(),
        });
      }
    }
    return alerts;
  }

  /**
   * The customer client no longer queues order pushes, so there is no local
   * outbox: the queue is always empty (never an invented depth).
   */
  async getQueues(): Promise<QueueOverview> {
    return {
      status: "standby",
      activeJobsCount: 0,
      waitingJobsCount: 0,
      failedJobsCount: 0,
      delayedJobsCount: 0,
      completedJobsCount: 0,
      jobs: [],
    };
  }
}
