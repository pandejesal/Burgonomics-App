import { auth, db } from "@/core/config/firebase";
import {
  collection,
  addDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { mapOrderToPetpoojaSaveOrder, type PetpoojaSaveOrderPayload } from "./mapper";
import { useAuthStore } from "@/features/auth/state/authStore";
import { useDemoStore } from "@/features/demo/state/demoStore";
import { useOrdersStore } from "@/features/orders/state/ordersStore";
import type { Order } from "@/features/orders/models";
import type {
  GatewayAlert,
  GatewayHealth,
  GatewayMetrics,
  GatewayStore,
  PetpoojaGateway,
  PetpoojaMenuSyncResult,
  PetpoojaOrderPushResult,
  QueueOverview,
  StoreOperationalState,
  SyncLogRecord,
  SyncReport,
  WebhookRecord,
} from "./types";

/**
 * HttpPetpoojaGateway — LIVE Petpooja implementation (implementation: "live").
 *
 * Selected by the gateway factory when VITE_PETPOOJA_ENABLED=true. Talks to
 * the Cloud Functions backend:
 *
 *   POST {functionsBase}/petpooja/pushOrder  { orderId, order? }
 *   POST {functionsBase}/petpooja/syncMenu   { branchId, mode? }
 *   POST {functionsBase}/petpooja/health     {}                 (optional)
 *
 * Secrets (PETPOOJA_APP_KEY/SECRET/ACCESS_TOKEN) live ONLY in Functions env —
 * the browser sends the mapped payload with EMPTY credential fields plus the
 * Firebase ID token; the server injects credentials and forwards to Petpooja.
 *
 * Failed order pushes land in a persistent localStorage outbox (replayable),
 * and a client-side circuit breaker sheds load after 5 consecutive failures.
 * Read-only getters never throw — failures surface via getHealth/getAlerts.
 */

export interface HttpGatewayOptions {
  functionsBaseUrl?: string;
  fetchImpl?: typeof fetch;
  outboxKey?: string;
  breakerThreshold?: number;
  logWriteTimeoutMs?: number;
}

interface OutboxEntry {
  id: string;
  orderId: string;
  payload: PetpoojaSaveOrderPayload;
  enqueuedAt: string;
  attempts: number;
}

const DEFAULT_OUTBOX_KEY = "burgonomics.petpooja.outbox.v1";
const CACHE_TTL_MS = 60_000;
/** Firestore log writes must never hang the UI — bounded best-effort. */
const LOG_WRITE_TIMEOUT_MS = 4_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("log write timeout")), ms)
    ),
  ]);
}

/** localStorage when available (browser), in-memory fallback (SSR/tests). */
function createKeyValueStore() {
  const memory = new Map<string, string>();
  const hasLocalStorage = (() => {
    try {
      return typeof localStorage !== "undefined" && !!localStorage.getItem;
    } catch {
      return false;
    }
  })();
  return {
    get(key: string): string | null {
      try {
        if (hasLocalStorage) return localStorage.getItem(key);
      } catch {
        // fall through to memory
      }
      return memory.has(key) ? (memory.get(key) as string) : null;
    },
    set(key: string, value: string) {
      try {
        if (hasLocalStorage) {
          localStorage.setItem(key, value);
          return;
        }
      } catch {
        // fall through to memory
      }
      memory.set(key, value);
    },
  };
}

function defaultFunctionsBase(): string {
  const env = import.meta.env as Record<string, string | undefined>;
  if (env.VITE_PETPOOJA_PROXY_URL) return env.VITE_PETPOOJA_PROXY_URL.replace(/\/$/, "");
  if (env.VITE_FUNCTIONS_API_URL) return env.VITE_FUNCTIONS_API_URL.replace(/\/$/, "");
  const projectId = env.VITE_FIREBASE_PROJECT_ID || "burgonomics-7faa8";
  return `https://asia-south1-${projectId}.cloudfunctions.net/api`;
}

export class HttpPetpoojaGateway implements PetpoojaGateway {
  readonly implementation = "live" as const;

  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  private readonly outboxKey: string;
  private readonly breakerThreshold: number;
  private readonly logTimeout: number;

  private breakers = new Map<string, { state: "closed" | "open" | "half-open"; failures: number }>();
  private readonly store = createKeyValueStore();
  private cache = new Map<string, { at: number; data: any }>();
  private calls = 0;
  private failures = 0;
  private lastLatencyMs = 0;
  private lastError: string | null = null;

  constructor(opts: HttpGatewayOptions = {}) {
    this.base = (opts.functionsBaseUrl || defaultFunctionsBase()).replace(/\/$/, "");
    this.fetchImpl = opts.fetchImpl || fetch.bind(globalThis);
    this.outboxKey = opts.outboxKey || DEFAULT_OUTBOX_KEY;
    this.breakerThreshold = opts.breakerThreshold ?? 5;
    this.logTimeout = opts.logWriteTimeoutMs ?? LOG_WRITE_TIMEOUT_MS;
  }

  // -- transport ---------------------------------------------------------

  private async authHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
    try {
      const token = await auth.currentUser?.getIdToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;
    } catch {
      // unauthenticated — server decides
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

  private async post<T>(route: string, body: Record<string, any>, breakerKey = "global"): Promise<T> {
    const breaker = this.breakerFor(breakerKey);
    if (breaker.state === "open") {
      throw new Error(`Circuit breaker OPEN for ${breakerKey} — failing fast`);
    }
    const started = Date.now();
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base}${route}`, {
        method: "POST",
        headers: await this.authHeaders(),
        body: JSON.stringify(body),
      });
    } catch (err) {
      this.recordFailure(breakerKey, err instanceof Error ? err.message : "Network error");
      throw err;
    }
    if (!res.ok) {
      let detail = `Server error ${res.status}`;
      try {
        const data = await res.json();
        detail = (data as any)?.error || (data as any)?.message || detail;
      } catch {
        // keep status text
      }
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

  private traceApiCall(label: string, status: "ok" | "fail", ms: number, meta: Record<string, any>) {
    try {
      useDemoStore.getState().pushApiCall({ label, status, ms, meta });
    } catch {
      // demo store unavailable — skip debug trace
    }
  }

  // -- outbox ------------------------------------------------------------

  private readOutbox(): OutboxEntry[] {
    try {
      const raw = this.store.get(this.outboxKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private writeOutbox(entries: OutboxEntry[]) {
    try {
      this.store.set(this.outboxKey, JSON.stringify(entries.slice(-50)));
    } catch {
      // quota — drop silently, order already in Firestore
    }
  }

  private enqueueOutbox(orderId: string, payload: PetpoojaSaveOrderPayload) {
    const entries = this.readOutbox();
    entries.push({
      id: `ob_${Date.now()}_${Math.floor(Math.random() * 1e4)}`,
      orderId,
      payload,
      enqueuedAt: new Date().toISOString(),
      attempts: 0,
    });
    this.writeOutbox(entries);
  }

  // -- POS-critical paths --------------------------------------------------

  async pushOrder(orderId: string, customOrder?: Order): Promise<PetpoojaOrderPushResult> {
    const started = Date.now();
    let order = customOrder;
    if (!order) {
      order = useOrdersStore.getState().byId[orderId];
    }
    if (!order) {
      throw new Error(`Order ${orderId} not found in client store.`);
    }

    const user = useAuthStore.getState().user;
    const payload = mapOrderToPetpoojaSaveOrder(order, {
      customerName: user?.name || undefined,
      customerPhone: user?.phone || undefined,
      customerEmail: "customer@burgonomics.com",
    });

    try {
      const res = await this.post<{ success?: boolean; petpoojaOrderId?: string; kotNumber?: string }>(
        "/petpooja/pushOrder",
        { orderId, order: payload },
        `push:${payload.restID}`
      );
      this.traceApiCall("POST petpooja/save_order", "ok", Date.now() - started, {
        orderId,
        restID: payload.restID,
        kotNumber: res.kotNumber || res.petpoojaOrderId,
      });
      return {
        acknowledged: res.success !== false,
        kotNumber: res.kotNumber || res.petpoojaOrderId,
        payload,
      };
    } catch (err) {
      this.traceApiCall("POST petpooja/save_order", "fail", Date.now() - started, { orderId });
      this.enqueueOutbox(orderId, payload);
      return { acknowledged: false, payload };
    }
  }

  async pushMenu(storeId: string): Promise<PetpoojaMenuSyncResult> {
    const started = Date.now();
    try {
      const res = await this.post<{ itemCount?: number; categoriesCount?: number; syncedItems?: number; syncedCategories?: number }>(
        "/petpooja/syncMenu",
        { branchId: storeId, mode: "full" },
        `menu:${storeId}`
      );
      const itemsSynced = res.itemCount ?? res.syncedItems ?? 0;
      const categoriesCount = res.categoriesCount ?? res.syncedCategories ?? 0;
      this.traceApiCall("POST petpooja/menu_push", "ok", Date.now() - started, {
        storeId,
        itemsSynced,
        categoriesCount,
      });
      await this.writeSyncLog(storeId, "FULL", itemsSynced, categoriesCount, null);
      return { itemsSynced, categoriesCount, addonGroupsCount: 0, syncedAt: new Date().toISOString() };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Menu sync failed";
      this.traceApiCall("POST petpooja/menu_push", "fail", Date.now() - started, { storeId });
      await this.writeSyncLog(storeId, "FULL", 0, 0, message);
      return { itemsSynced: 0, categoriesCount: 0, addonGroupsCount: 0, syncedAt: new Date().toISOString() };
    }
  }

  async runSync(
    storeId: string,
    mode: "full" | "incremental" | "stock" | "status"
  ): Promise<SyncReport> {
    const started = Date.now();
    if (mode === "full" || mode === "incremental") {
      const res = await this.pushMenu(storeId);
      const ms = Date.now() - started;
      return {
        currentVersion: `live-${new Date().toISOString().slice(0, 10)}`,
        lastSuccessfulVersion: res.itemsSynced > 0 ? "live" : "none",
        started: new Date(started).toISOString(),
        finished: new Date().toISOString(),
        duration: `${(ms / 1000).toFixed(1)}s`,
        created: 0,
        updated: res.itemsSynced,
        deleted: 0,
        categories: res.categoriesCount,
        modifiers: 0,
        errors: res.itemsSynced > 0 ? 0 : 1,
        warnings: 0,
        conflicts: 0,
        simulated: false,
      };
    }
    try {
      await this.get("/health", `menu:${storeId}`);
      const ms = Date.now() - started;
      return {
        currentVersion: "live-ping",
        lastSuccessfulVersion: "live-ping",
        started: new Date(started).toISOString(),
        finished: new Date().toISOString(),
        duration: `${(ms / 1000).toFixed(1)}s`,
        created: 0,
        updated: 0,
        deleted: 0,
        categories: 0,
        modifiers: 0,
        errors: 0,
        warnings: 0,
        conflicts: 0,
        simulated: false,
      };
    } catch {
      const ms = Date.now() - started;
      return {
        currentVersion: "live-ping",
        lastSuccessfulVersion: "none",
        started: new Date(started).toISOString(),
        finished: new Date().toISOString(),
        duration: `${(ms / 1000).toFixed(1)}s`,
        created: 0,
        updated: 0,
        deleted: 0,
        categories: 0,
        modifiers: 0,
        errors: 1,
        warnings: 0,
        conflicts: 0,
        simulated: false,
      };
    }
  }

  // -- reads ---------------------------------------------------------------

  async getStores(): Promise<GatewayStore[]> {
    // Optional server route; empty (not error) when unimplemented.
    try {
      const res = await this.cached("stores", () => this.post<any[]>("/petpooja/stores", {}));
      return Array.isArray(res) ? (res as GatewayStore[]) : [];
    } catch {
      return [];
    }
  }

  async getStoreStatus(storeId: string): Promise<StoreOperationalState> {
    const breaker = this.breakerFor(`menu:${storeId}`);
    try {
      const res = await this.cached(`status:${storeId}`, () => this.get<any>("/health", `menu:${storeId}`));
      const online = res?.status === "healthy";
      return {
        storeId,
        menuVersion: "Live",
        lastSuccessfulVersion: "Live",
        lastSyncTime: new Date().toISOString(),
        webhookStatus: "standby",
        circuitBreaker: breaker.state,
        queueState: this.readOutbox().length > 0 ? "waiting" : "idle",
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
        queueState: this.readOutbox().length > 0 ? "waiting" : "idle",
        retryCount: 0,
        apiCredentialsLinked: true,
        webhookSecretLinked: false,
        posTerminalOnline: false,
      };
    }
  }

  async getHealth(): Promise<GatewayHealth> {
    const outboxDepth = this.readOutbox().length;
    let connected = false;
    let message = "Petpooja proxy unreachable";
    let latencyMs = 0;
    try {
      const started = Date.now();
      const res = await this.get<{ status?: string }>("/health");
      latencyMs = Date.now() - started;
      connected = res?.status === "healthy";
      message = !connected
        ? "API reachable but reports unhealthy"
        : outboxDepth > 0
          ? `Live — ${outboxDepth} order(s) queued for retry`
          : "Live — Petpooja bridge connected";
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
        {
          service: "Order Push Outbox",
          status: outboxDepth > 0 ? "degraded" : "healthy",
          latencyMs: 0,
          details: `${outboxDepth} queued order(s)`,
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
      const q = query(collection(db, "petpooja_sync_logs"), orderBy("createdAt", "desc"), limit(50));
      const snapshot = await getDocs(q);
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
          simulated: data.simulated ?? false,
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
      const q = query(collection(db, "petpooja_webhook_logs"), orderBy("timestamp", "desc"), limit(50));
      const snapshot = await getDocs(q);
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
    onError?: (err: Error) => void
  ): () => void {
    try {
      const q = query(collection(db, "petpooja_webhook_logs"), orderBy("timestamp", "desc"), limit(50));
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
            })
          );
        },
        (err) => onError?.(err as Error)
      );
    } catch (err) {
      onError?.(err as Error);
      return () => undefined;
    }
  }

  // -- ops -------------------------------------------------------------------

  async replayWebhook(_id: string): Promise<{ acknowledged: boolean }> {
    const entries = this.readOutbox();
    if (entries.length === 0) return { acknowledged: true };
    const remaining: OutboxEntry[] = [];
    for (const entry of entries) {
      try {
        const res = await this.post<{ success?: boolean }>(
          "/petpooja/pushOrder",
          { orderId: entry.orderId, order: entry.payload },
          `push:${entry.payload.restID}`
        );
        if (res.success === false) {
          remaining.push({ ...entry, attempts: entry.attempts + 1 });
        }
      } catch {
        remaining.push({ ...entry, attempts: entry.attempts + 1 });
      }
    }
    this.writeOutbox(remaining);
    return { acknowledged: remaining.length === 0 };
  }

  async tripBreaker(storeId: string): Promise<void> {
    this.breakerFor(`menu:${storeId}`).state = "open";
    this.breakerFor(`push:${storeId}`).state = "open";
  }

  async resetBreaker(storeId: string): Promise<void> {
    const m = this.breakerFor(`menu:${storeId}`);
    m.state = "closed";
    m.failures = 0;
    const p = this.breakerFor(`push:${storeId}`);
    p.state = "closed";
    p.failures = 0;
  }

  async flushCache(): Promise<{ flushed: boolean; message: string }> {
    const keys = this.cache.size;
    this.cache.clear();
    return { flushed: true, message: `Live gateway cache flushed (${keys} keys).` };
  }

  async getMetrics(): Promise<GatewayMetrics> {
    const outboxDepth = this.readOutbox().length;
    const openBreakersCount = [...this.breakers.values()].filter((b) => b.state === "open").length;
    return {
      connectedStoresCount: 0,
      totalStoresCount: 0,
      syncSuccessRate: this.calls > 0 ? (this.calls - this.failures) / this.calls : 0,
      openBreakersCount,
      queueStatusLabel: outboxDepth > 0 ? "WAITING" : "IDLE",
      timeSeries: [],
      menuSyncDuration: [],
      prometheusText: [
        "# HELP petpooja_api_calls_total Live Petpooja proxy calls",
        "# TYPE petpooja_api_calls_total counter",
        `petpooja_api_calls_total ${this.calls}`,
        "# HELP petpooja_api_failures_total Failed Petpooja proxy calls",
        "# TYPE petpooja_api_failures_total counter",
        `petpooja_api_failures_total ${this.failures}`,
        "# HELP petpooja_outbox_depth Queued order pushes awaiting retry",
        "# TYPE petpooja_outbox_depth gauge",
        `petpooja_outbox_depth ${outboxDepth}`,
        "# HELP petpooja_gateway_status Gateway operational status (0=Standby, 1=Live)",
        "# TYPE petpooja_gateway_status gauge",
        "petpooja_gateway_status 1",
      ].join("\n"),
      simulated: false,
    };
  }

  async getAlerts(): Promise<GatewayAlert[]> {
    const alerts: GatewayAlert[] = [];
    const outboxDepth = this.readOutbox().length;
    if (outboxDepth > 0) {
      alerts.push({
        id: "outbox-depth",
        type: "warning",
        title: `${outboxDepth} order push(es) queued`,
        message: "Orders are safe in the outbox — use Replay to retry the Petpooja push.",
        timestamp: new Date().toISOString(),
      });
    }
    for (const [key, b] of this.breakers.entries()) {
      if (b.state === "open") {
        alerts.push({
          id: `breaker-${key}`,
          type: "error",
          title: `Circuit breaker OPEN (${key})`,
          message: `${b.failures} consecutive failures — calls fail fast to the outbox.`,
          timestamp: new Date().toISOString(),
        });
      }
    }
    return alerts;
  }

  async getQueues(): Promise<QueueOverview> {
    const outbox = this.readOutbox();
    return {
      status: outbox.length > 0 ? "active" : "standby",
      activeJobsCount: 0,
      waitingJobsCount: outbox.length,
      failedJobsCount: 0,
      delayedJobsCount: 0,
      completedJobsCount: 0,
      jobs: outbox.map((e) => ({
        id: e.id,
        name: `pushOrder ${e.orderId}`,
        queue: "petpooja-outbox",
        state: "waiting" as const,
        attempts: e.attempts,
        maxAttempts: 10,
        createdAt: e.enqueuedAt,
        processedAt: null,
        durationMs: null,
        payload: { orderId: e.orderId },
        errorMessage: null,
      })),
    };
  }

  // -- private ---------------------------------------------------------------

  private async writeSyncLog(
    storeId: string,
    scope: "FULL" | "INCREMENTAL" | "STOCK" | "STATUS",
    created: number,
    updated: number,
    error: string | null
  ) {
    try {
      await withTimeout(
        addDoc(collection(db, "petpooja_sync_logs"), {
          storeName: storeId,
          storeId,
          scope,
          status: error ? "FAILED" : "COMPLETED",
          version: "live",
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          createdAt: serverTimestamp(),
          duration: "live",
          created,
          updated,
          deleted: 0,
          conflicts: 0,
          error,
          simulated: false,
          source: "httpGateway",
        }),
        this.logTimeout
      );
    } catch (err) {
      console.warn("HttpPetpoojaGateway: sync log persist failed:", err);
    }
  }
}
