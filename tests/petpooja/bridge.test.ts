import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  enqueuePetpoojaOrder,
  processPetpoojaOrder,
} from "../../netlify/functions/petpooja-queue";
import {
  handlePetpoojaWebhook,
  mapPetpoojaStatusCode,
} from "../../netlify/functions/petpooja-webhook";
import { getPetpoojaHealth } from "../../netlify/functions/petpooja-health";

describe("Petpooja POS Bridge — Live Queue, Webhook & Health (6 Tests)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // Mock Firestore DB builder
  function createMockDb() {
    const store = new Map<string, any>();

    const db: any = {
      _store: store,
      collection: (colName: string) => ({
        doc: (docId: string) => ({
          get: async () => {
            const key = `${colName}/${docId}`;
            const data = store.get(key);
            return {
              exists: Boolean(data),
              data: () => data,
            };
          },
          set: async (data: any) => {
            const key = `${colName}/${docId}`;
            store.set(key, { ...data });
          },
          update: async (data: any) => {
            const key = `${colName}/${docId}`;
            const existing = store.get(key) || {};
            store.set(key, { ...existing, ...data });
          },
        }),
        add: async (data: any) => {
          const autoId = `auto_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          store.set(`${colName}/${autoId}`, data);
          return { id: autoId };
        },
      }),
    };

    return db;
  }

  // =========================================================================
  // 1. Enqueue on Enabled
  // =========================================================================

  it("1. [ENQUEUE-ENABLED] enqueues order to petpooja_orders when PETPOOJA_ENABLED=true and restId exists", async () => {
    process.env.PETPOOJA_ENABLED = "true";
    process.env.PETPOOJA_APP_KEY = "test_key";
    process.env.PETPOOJA_APP_SECRET = "test_secret";
    process.env.PETPOOJA_ACCESS_TOKEN = "test_token";

    const db = createMockDb();
    // Seed branch with petpooja restId
    await db.collection("branches").doc("branch_01").set({
      name: "Navrangpura",
      petpooja: { restId: "rest_nav_100" },
    });

    const orderData = {
      id: "ord_1001",
      items: [{ id: "prod_1", name: "Classic Burger", price: 149, quantity: 2 }],
      totals: { tax: 14.9, grandTotal: 312.9 },
      store: { id: "branch_01", name: "Navrangpura" },
    };

    const res = await enqueuePetpoojaOrder(db, "ord_1001", "branch_01", orderData);

    expect(res.queued).toBe(true);
    expect(res.orderId).toBe("ord_1001");

    const queuedDoc = await db.collection("petpooja_orders").doc("ord_1001").get();
    expect(queuedDoc.exists).toBe(true);
    expect(queuedDoc.data().status).toBe("pending");
    expect(queuedDoc.data().restId).toBe("rest_nav_100");
    expect(queuedDoc.data().attempts).toBe(0);
  });

  // =========================================================================
  // 2. Skip when Disabled
  // =========================================================================

  it("2. [SKIP-DISABLED] skips queueing and writes 0 documents when PETPOOJA_ENABLED=false", async () => {
    process.env.PETPOOJA_ENABLED = "false";
    const db = createMockDb();

    const orderData = { id: "ord_1002", items: [] };
    const res = await enqueuePetpoojaOrder(db, "ord_1002", "branch_01", orderData);

    expect(res.queued).toBe(false);
    expect(res.reason).toBe("PETPOOJA_DISABLED");

    const queuedDoc = await db.collection("petpooja_orders").doc("ord_1002").get();
    expect(queuedDoc.exists).toBe(false);
  });

  // =========================================================================
  // 3. Retry on 5xx / Network Error
  // =========================================================================

  it("3. [RETRY-5XX] transitions to pending_petpooja_retry with backoff on 5xx error", async () => {
    const db = createMockDb();
    await db.collection("petpooja_orders").doc("ord_1003").set({
      orderId: "ord_1003",
      payload: { app_key: "k", access_token: "t" },
      status: "pending",
      attempts: 0,
      restId: "rest_100",
    });

    // Mock 500 server error response from Petpooja
    const mockFetch = vi.fn().mockResolvedValueOnce({
      status: 500,
      ok: false,
      text: async () => "Internal Server Error",
    } as any);

    const result = await processPetpoojaOrder(db, "ord_1003", mockFetch);

    expect(result.status).toBe("retry");

    const queuedDoc = await db.collection("petpooja_orders").doc("ord_1003").get();
    expect(queuedDoc.data().status).toBe("pending_petpooja_retry");
    expect(queuedDoc.data().attempts).toBe(1);
    expect(queuedDoc.data().nextRetryAt).toBeDefined();
  });

  // =========================================================================
  // 4. Fail on 4xx Client Error
  // =========================================================================

  it("4. [FAIL-4XX] transitions to failed and logs error on 4xx client error", async () => {
    const db = createMockDb();
    await db.collection("petpooja_orders").doc("ord_1004").set({
      orderId: "ord_1004",
      branchId: "branch_01",
      payload: { app_key: "k" },
      status: "pending",
      attempts: 0,
      restId: "rest_100",
    });

    await db.collection("orders").doc("ord_1004").set({
      id: "ord_1004",
      petpoojaStatus: "Pending",
    });

    // Mock 400 bad request from Petpooja
    const mockFetch = vi.fn().mockResolvedValueOnce({
      status: 400,
      ok: false,
      text: async () => "Invalid menu item mapping",
    } as any);

    const result = await processPetpoojaOrder(db, "ord_1004", mockFetch);

    expect(result.status).toBe("failed");
    expect(result.statusCode).toBe(400);

    const queuedDoc = await db.collection("petpooja_orders").doc("ord_1004").get();
    expect(queuedDoc.data().status).toBe("failed");

    const orderDoc = await db.collection("orders").doc("ord_1004").get();
    expect(orderDoc.data().petpoojaStatus).toBe("Failed");
  });

  // =========================================================================
  // 5. Inbound Webhook Status Mapping & Update
  // =========================================================================

  it("5. [WEBHOOK-UPDATE] maps status and updates orders and petpooja_orders docs", async () => {
    const db = createMockDb();

    await db.collection("orders").doc("ord_1005").set({
      id: "ord_1005",
      status: { kind: "sent_to_kitchen", code: "SENT_TO_KITCHEN" },
    });

    await db.collection("petpooja_orders").doc("ord_1005").set({
      orderId: "ord_1005",
      status: "synced",
    });

    // Inbound webhook payload for READY status (code 3)
    const webhookPayload = {
      order_id: "ord_1005",
      status: "3", // ready
      rest_id: "rest_100",
    };

    const res = await handlePetpoojaWebhook(db, webhookPayload);

    expect(res.status).toBe("success");
    expect(res.mappedStatus).toBe("ready");

    const orderDoc = await db.collection("orders").doc("ord_1005").get();
    expect(orderDoc.data()["status.external"]).toBe("petpooja_ready");
    expect(orderDoc.data()["status.kind"]).toBe("ready");
    expect(orderDoc.data()["status.code"]).toBe("READY");

    const queueDoc = await db.collection("petpooja_orders").doc("ord_1005").get();
    expect(queueDoc.data().status).toBe("petpooja_ready");
  });

  // =========================================================================
  // 6. Health Endpoint
  // =========================================================================

  it("6. [HEALTH-ENDPOINT] returns correct health metrics and enabled state", () => {
    process.env.PETPOOJA_ENABLED = "false";
    const healthDisabled = getPetpoojaHealth();
    expect(healthDisabled.enabled).toBe(false);
    expect(healthDisabled.status).toBe("standby");

    process.env.PETPOOJA_ENABLED = "true";
    process.env.PETPOOJA_APP_KEY = "key_1";
    process.env.PETPOOJA_ACCESS_TOKEN = "token_1";
    const healthEnabled = getPetpoojaHealth();
    expect(healthEnabled.enabled).toBe(true);
    expect(healthEnabled.status).toBe("healthy");
    expect(healthEnabled.branchRestIdPresent).toBe(true);
  });
});
