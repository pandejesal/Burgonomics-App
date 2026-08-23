import { mapOrderToPetpoojaSaveOrder } from "./mapper";
import { useDemoStore } from "@/features/demo/state/demoStore";
import { useAuthStore } from "@/features/auth/state/authStore";
import { useOrdersStore } from "@/features/orders/state/ordersStore";
import { MOCK_STORES } from "@/features/stores/data/mockStores";
import type { Order } from "@/features/orders/models";
import type {
  PetpoojaGateway,
  GatewayStore,
  StoreOperationalState,
  SyncReport,
  SyncLogRecord,
  QueueOverview,
  GatewayHealth,
  WebhookRecord,
  GatewayMetrics,
  GatewayAlert,
  PetpoojaMenuSyncResult,
  PetpoojaOrderPushResult,
  CircuitBreakerOverride,
} from "./types";

const SAMPLE_STORES: GatewayStore[] = MOCK_STORES.slice(0, 5).map((s) => ({
  id: s.id,
  name: s.name,
  address: s.address,
  city: s.city,
  area: s.area,
  lat: s.lat,
  lng: s.lng,
  phone: s.phone || "",
  imageUrl: s.imageUrl ?? null,
  hours: s.hours,
  isOpen: s.isOpen ?? true,
  isBusy: s.isBusy ?? false,
  isRecentlyOpened: s.isRecentlyOpened ?? false,
  supports: s.supports ?? { delivery: true, takeaway: true, dineIn: true },
  etaMinutes: s.etaMinutes ?? 30,
  pickupEtaMinutes: s.pickupEtaMinutes ?? 15,
  deliveryFee: s.deliveryFee ?? 29,
  petpoojaRestId: s.petpoojaRestId || `rest_${s.id.replace("str_", "")}`,
}));

export class MockPetpoojaGateway implements PetpoojaGateway {
  readonly implementation = "mock" as const;

  // In-memory circuit breaker overrides
  private breakerStates = new Map<string, "closed" | "open" | "half-open">([
    ["str_001", "closed"],
    ["str_002", "closed"],
    ["str_003", "closed"],
    ["str_004", "closed"],
    ["str_005", "closed"],
  ]);

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async getStores(): Promise<GatewayStore[]> {
    return SAMPLE_STORES;
  }

  async getStoreStatus(storeId: string): Promise<StoreOperationalState> {
    await this.delay(120);
    const breaker = this.breakerStates.get(storeId) ?? "closed";
    return {
      storeId,
      menuVersion: "Standby",
      lastSuccessfulVersion: "Standby",
      lastSyncTime: "Awaiting sync",
      webhookStatus: "standby",
      circuitBreaker: breaker,
      queueState: "idle",
      retryCount: 0,
      apiCredentialsLinked: false,
      webhookSecretLinked: false,
      posTerminalOnline: false,
    };
  }

  async runSync(
    storeId: string,
    mode: "full" | "incremental" | "stock" | "status",
  ): Promise<SyncReport> {
    await this.delay(300);

    const store = SAMPLE_STORES.find((s) => s.id === storeId) ?? SAMPLE_STORES[0];
    const started = new Date(Date.now() - 3200).toLocaleString();
    const finished = new Date().toLocaleString();
    const created = mode === "full" ? 3 : 0;
    const updated = mode === "stock" ? 12 : 24;

    const report: SyncReport = {
      currentVersion: "v4.2.1",
      lastSuccessfulVersion: "v4.2.0",
      started,
      finished,
      duration: "3.2s",
      created,
      updated,
      deleted: 0,
      categories: 5,
      modifiers: 8,
      errors: 0,
      warnings: 0,
      conflicts: 0,
      simulated: true,
    };

    // Persist real SyncLogRecord to Firestore collection petpooja_sync_logs
    try {
      const { db } = await import("@/core/config/firebase");
      const { collection, addDoc, serverTimestamp } = await import("firebase/firestore");

      await addDoc(collection(db, "petpooja_sync_logs"), {
        storeName: store.name,
        storeId: store.id,
        scope: mode.toUpperCase(),
        status: "COMPLETED",
        version: "v4.2.1",
        startedAt: new Date(Date.now() - 3200).toISOString(),
        finishedAt: new Date().toISOString(),
        createdAt: serverTimestamp(),
        duration: "3.2s",
        created,
        updated,
        deleted: 0,
        conflicts: 0,
        error: null,
        simulated: true,
        source: "mockGateway",
      });
    } catch (err) {
      console.warn("MockPetpoojaGateway: failed to persist sync log to Firestore:", err);
    }

    return report;
  }

  async getQueues(): Promise<QueueOverview> {
    await this.delay(150);
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

  async getHealth(): Promise<GatewayHealth> {
    await this.delay(150);

    const circuitBreakers: CircuitBreakerOverride[] = SAMPLE_STORES.map((s) => ({
      storeId: s.id,
      storeName: s.name,
      restId: s.petpoojaRestId,
      state: this.breakerStates.get(s.id) ?? "closed",
      failureCount: 0,
      maxFailures: 5,
    }));

    return {
      status: "standby",
      connected: false,
      message: "Awaiting live merchant Petpooja credentials",
      services: [
        {
          service: "Petpooja POS API Bridge",
          status: "standby",
          latencyMs: 0,
          details: "Standby — awaiting live merchant credentials",
        },
        {
          service: "Webhook Verification Service",
          status: "standby",
          latencyMs: 0,
          details: "No webhook secret configured",
        },
        {
          service: "Catalog Sync Engine",
          status: "standby",
          latencyMs: 0,
          details: "0 active sync workers",
        },
        {
          service: "Redis Cache & Queue Daemon",
          status: "healthy",
          latencyMs: 1,
          details: "Local cache ready (0 active keys)",
        },
      ],
      circuitBreakers,
      cacheMetrics: {
        sizeBytes: 0,
        sizeFormatted: "0 KB",
        keyCount: 0,
        hitRate: 0,
        status: "Idle",
      },
    };
  }

  async getSyncLogs(): Promise<SyncLogRecord[]> {
    try {
      const { db } = await import("@/core/config/firebase");
      const { collection, getDocs, query, orderBy, limit } = await import("firebase/firestore");

      const q = query(
        collection(db, "petpooja_sync_logs"),
        orderBy("createdAt", "desc"),
        limit(50),
      );
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        return snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            storeName: data.storeName || "Unknown Store",
            storeId: data.storeId || "",
            scope: data.scope || "FULL",
            status: data.status || "COMPLETED",
            version: data.version || "v4.2.1",
            startedAt: data.startedAt || new Date().toISOString(),
            finishedAt: data.finishedAt || new Date().toISOString(),
            createdAt: data.createdAt ?? null,
            duration: data.duration || "0.0s",
            created: data.created ?? 0,
            updated: data.updated ?? 0,
            deleted: data.deleted ?? 0,
            conflicts: data.conflicts ?? 0,
            error: data.error ?? null,
            simulated: data.simulated ?? true,
            source: data.source ?? "mockGateway",
          };
        });
      }
    } catch (err) {
      console.warn("MockPetpoojaGateway: getSyncLogs firestore read fallback:", err);
    }

    // Default sample if no Firestore records yet
    return [
      {
        id: "log_initial_sample",
        storeName: "Burgonomics Navrangpura",
        storeId: "str_001",
        scope: "FULL",
        status: "COMPLETED",
        version: "v4.2.1",
        startedAt: new Date(Date.now() - 3600000).toISOString(),
        finishedAt: new Date(Date.now() - 3596800).toISOString(),
        createdAt: null,
        duration: "3.2s",
        created: 3,
        updated: 24,
        deleted: 0,
        conflicts: 0,
        error: null,
        simulated: true,
        source: "mockGateway",
      },
    ];
  }

  async getWebhookLogs(): Promise<WebhookRecord[]> {
    try {
      const { db } = await import("@/core/config/firebase");
      const { collection, getDocs, query, orderBy, limit } = await import("firebase/firestore");

      const q = query(
        collection(db, "petpooja_webhook_logs"),
        orderBy("timestamp", "desc"),
        limit(50),
      );
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
      console.warn("MockPetpoojaGateway: getWebhookLogs error:", err);
      return [];
    }
  }

  subscribeWebhookLogs(
    onLogs: (logs: WebhookRecord[]) => void,
    onError?: (err: Error) => void,
  ): () => void {
    let unsubscribe: () => void = () => {};

    import("@/core/config/firebase").then(({ db }) => {
      import("firebase/firestore").then(({ collection, query, orderBy, limit, onSnapshot }) => {
        const q = query(
          collection(db, "petpooja_webhook_logs"),
          orderBy("timestamp", "desc"),
          limit(50),
        );

        unsubscribe = onSnapshot(
          q,
          (snapshot) => {
            const logs = snapshot.docs.map((d) => {
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
            onLogs(logs);
          },
          (err) => {
            console.warn("MockPetpoojaGateway: webhook logs subscription error:", err);
            onError?.(err);
          },
        );
      });
    });

    return () => unsubscribe();
  }

  async replayWebhook(_id: string): Promise<{ acknowledged: boolean }> {
    await this.delay(200);
    return { acknowledged: false };
  }

  async tripBreaker(storeId: string): Promise<void> {
    await this.delay(100);
    this.breakerStates.set(storeId, "open");
  }

  async resetBreaker(storeId: string): Promise<void> {
    await this.delay(100);
    this.breakerStates.set(storeId, "closed");
  }

  async flushCache(): Promise<{ flushed: boolean; message: string }> {
    await this.delay(200);
    return { flushed: true, message: "Petpooja local catalog cache flushed successfully." };
  }

  async getMetrics(): Promise<GatewayMetrics> {
    await this.delay(100);

    const openBreakersCount = Array.from(this.breakerStates.values()).filter(
      (s) => s === "open",
    ).length;

    return {
      connectedStoresCount: 0,
      totalStoresCount: SAMPLE_STORES.length,
      syncSuccessRate: 100,
      openBreakersCount,
      queueStatusLabel: "Standby (0 jobs)",
      timeSeries: [
        { time: "09:00", latency: 120, processingTime: 40, volume: 0, retries: 0, queueGrowth: 0 },
        { time: "10:00", latency: 130, processingTime: 45, volume: 0, retries: 0, queueGrowth: 0 },
        { time: "11:00", latency: 125, processingTime: 42, volume: 0, retries: 0, queueGrowth: 0 },
        { time: "12:00", latency: 140, processingTime: 50, volume: 0, retries: 0, queueGrowth: 0 },
        { time: "13:00", latency: 135, processingTime: 48, volume: 0, retries: 0, queueGrowth: 0 },
        { time: "14:00", latency: 128, processingTime: 44, volume: 0, retries: 0, queueGrowth: 0 },
        { time: "15:00", latency: 122, processingTime: 40, volume: 0, retries: 0, queueGrowth: 0 },
        { time: "16:00", latency: 120, processingTime: 38, volume: 0, retries: 0, queueGrowth: 0 },
      ],
      menuSyncDuration: [
        { date: "Jul 13", duration: 3.2, created: 3, updated: 24, deleted: 0 },
        { date: "Jul 14", duration: 2.8, created: 0, updated: 12, deleted: 0 },
        { date: "Jul 15", duration: 3.1, created: 1, updated: 18, deleted: 0 },
        { date: "Jul 16", duration: 3.5, created: 4, updated: 20, deleted: 0 },
        { date: "Jul 17", duration: 4.0, created: 2, updated: 32, deleted: 0 },
        { date: "Jul 18", duration: 3.0, created: 0, updated: 10, deleted: 0 },
        { date: "Jul 19", duration: 3.2, created: 3, updated: 24, deleted: 0 },
      ],
      prometheusText: `# HELP petpooja_api_latency_seconds Latency of Petpooja API requests (simulated)
# TYPE petpooja_api_latency_seconds summary
petpooja_api_latency_seconds{quantile="0.5",store_id="all"} 0.120
petpooja_api_latency_seconds{quantile="0.9",store_id="all"} 0.135
petpooja_api_latency_seconds{quantile="0.99",store_id="all"} 0.140
petpooja_api_latency_seconds_count{store_id="all"} 0

# HELP petpooja_gateway_status Gateway operational status (0=Standby, 1=Live)
# TYPE petpooja_gateway_status gauge
petpooja_gateway_status 0

# HELP firestore_queue_waiting Active Firestore queue size
# TYPE firestore_queue_waiting gauge
firestore_queue_waiting{queue="petpooja-menu-sync"} 0
firestore_queue_waiting{queue="petpooja-webhook-handler"} 0`,
      simulated: true,
    };
  }

  async getAlerts(): Promise<GatewayAlert[]> {
    return [];
  }

  async pushMenu(storeId: string): Promise<PetpoojaMenuSyncResult> {
    await this.delay(800);

    const categoriesCount = 5;
    const itemsSynced = 16;
    const addonGroupsCount = 4;

    useDemoStore.getState().pushApiCall({
      label: "POST petpooja/menu_push",
      status: "ok",
      ms: 800,
      meta: { storeId, categoriesCount, itemsSynced, addonGroupsCount },
    });

    return {
      itemsSynced,
      categoriesCount,
      addonGroupsCount,
      syncedAt: new Date().toISOString(),
    };
  }

  async pushOrder(orderId: string, customOrder?: Order): Promise<PetpoojaOrderPushResult> {
    await this.delay(350);

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

    const isSuccess = useDemoStore.getState().petpoojaSimulateSuccess;
    const kotNumber = `KOT-${orderId.slice(-6).toUpperCase()}`;

    useDemoStore.getState().pushApiCall({
      label: "POST petpooja/save_order",
      status: isSuccess ? "ok" : "fail",
      ms: 350,
      meta: {
        orderId,
        restID: payload.restID,
        kotNumber,
        payloadSize: JSON.stringify(payload).length,
        payload,
      },
    });

    if (!isSuccess) {
      return {
        acknowledged: false,
        kotNumber,
        payload,
      };
    }

    return {
      acknowledged: true,
      kotNumber,
      payload,
    };
  }
}

export const petpoojaGateway = new MockPetpoojaGateway();
