import type { Timestamp } from "firebase/firestore";

export interface StoreOperationalState {
  storeId: string;
  menuVersion: string;
  lastSuccessfulVersion: string;
  lastSyncTime: string;
  webhookStatus: "standby" | "active" | "degraded" | "failing";
  circuitBreaker: "closed" | "half-open" | "open";
  queueState: "idle" | "active" | "failed" | "waiting";
  retryCount: number;
  apiCredentialsLinked: boolean;
  webhookSecretLinked: boolean;
  posTerminalOnline: boolean;
}

export interface SyncLogRecord {
  id: string;
  storeName: string;
  storeId: string;
  scope: "FULL" | "INCREMENTAL" | "STOCK" | "STATUS";
  status: "COMPLETED" | "FAILED" | "RUNNING" | "PENDING";
  version: string;
  startedAt: string;
  finishedAt: string;
  createdAt?: Timestamp | null;
  duration: string;
  created: number;
  updated: number;
  deleted: number;
  conflicts: number;
  error: string | null;
  source: string;
}

export interface QueueJob {
  id: string;
  name: string;
  queue: string;
  state: "active" | "waiting" | "completed" | "failed" | "delayed" | "paused";
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  processedAt: string | null;
  durationMs: number | null;
  payload: Record<string, any>;
  errorMessage: string | null;
}

export interface QueueOverview {
  status: "standby" | "active" | "paused";
  activeJobsCount: number;
  waitingJobsCount: number;
  failedJobsCount: number;
  delayedJobsCount: number;
  completedJobsCount: number;
  jobs: QueueJob[];
}

export interface GatewayHealthService {
  service: string;
  status: "healthy" | "standby" | "degraded" | "failing";
  latencyMs: number;
  details: string;
}

export interface CircuitBreakerOverride {
  storeId: string;
  storeName: string;
  restId: string;
  state: "closed" | "open" | "half-open";
  failureCount: number;
  maxFailures: number;
}

export interface GatewayHealth {
  status: "standby" | "healthy" | "degraded";
  connected: boolean;
  message: string;
  services: GatewayHealthService[];
  circuitBreakers: CircuitBreakerOverride[];
  cacheMetrics: {
    sizeBytes: number;
    sizeFormatted: string;
    keyCount: number;
    hitRate: number;
    status: string;
  };
}

export interface WebhookRecord {
  id: string;
  timestamp: Date;
  storeName: string;
  storeId: string;
  type: string;
  status: string;
  executionTimeMs: number;
  payload: Record<string, any>;
}

export interface GatewayMetrics {
  connectedStoresCount: number;
  totalStoresCount: number;
  syncSuccessRate: number;
  openBreakersCount: number;
  queueStatusLabel: string;
  timeSeries: Array<{
    time: string;
    latency: number;
    processingTime: number;
    volume: number;
    retries: number;
    queueGrowth: number;
  }>;
  menuSyncDuration: Array<{
    date: string;
    duration: number;
    created: number;
    updated: number;
    deleted: number;
  }>;
  prometheusText: string;
}

export interface GatewayAlert {
  id: string;
  type: "warning" | "error" | "info";
  title: string;
  message: string;
  timestamp: string;
}

/**
 * Customer-facing gateway surface.
 *
 * There is deliberately no pushOrder / syncMenu / getStores here: those hit
 * staff-only or non-existent server routes and returned 403/404 to every
 * customer (api-contract-audit items 1-2). KOT pushing is server-side and the
 * outlet directory is the Firestore `stores` collection.
 */
export interface PetpoojaGateway {
  readonly implementation: "live";
  getStoreStatus(storeId: string): Promise<StoreOperationalState>;
  getQueues(): Promise<QueueOverview>;
  getHealth(): Promise<GatewayHealth>;
  getSyncLogs(): Promise<SyncLogRecord[]>;
  getWebhookLogs(): Promise<WebhookRecord[]>;
  subscribeWebhookLogs(
    onLogs: (logs: WebhookRecord[]) => void,
    onError?: (err: Error) => void,
  ): () => void;
  tripBreaker(storeId: string): Promise<void>;
  resetBreaker(storeId: string): Promise<void>;
  flushCache(): Promise<{ flushed: boolean; message: string }>;
  getMetrics(): Promise<GatewayMetrics>;
  getAlerts(): Promise<GatewayAlert[]>;
}
