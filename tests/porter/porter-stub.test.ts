import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as crypto from "crypto";
import { createPorterOrder } from "../../netlify/functions/create-porter-order";
import {
  handlePorterWebhook,
  verifyPorterWebhookSignature,
} from "../../netlify/functions/porter-webhook";
import { sendTopicNotification } from "../../netlify/functions/lib/notify";

describe("Porter Delivery & FCM Notification Stubs (6 Tests)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // Mock Firestore in-memory DB builder
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
              id: docId,
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
          const autoId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          store.set(`${colName}/${autoId}`, data);
          return { id: autoId };
        },
      }),
    };

    return db;
  }

  // =========================================================================
  // 1. Disabled Returns Skipped (0 Network Calls)
  // =========================================================================

  it("1. [PORTER-DISABLED-SKIPPED] returns skipped: true and makes 0 fetch calls when porterEnabled=false or key missing", async () => {
    delete process.env.PORTER_API_KEY;

    const db = createMockDb();
    await db.collection("branches").doc("branch_navrangpura").set({
      name: "Navrangpura",
      features: { porterEnabled: false },
    });
    await db.collection("orders").doc("ord_porter_1").set({
      id: "ord_porter_1",
      branchId: "branch_navrangpura",
      address: { line1: "123 Main Street", city: "Ahmedabad", phone: "9876543210" },
    });

    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await createPorterOrder(db, "ord_porter_1");

    expect(result.status).toBe("skipped");
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("porter_disabled");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // =========================================================================
  // 2. Dry Run Mode Performs 0 DB Writes
  // =========================================================================

  it("2. [PORTER-DRY-RUN-NO-WRITE] returns payload preview and writes 0 documents when dryRun=true", async () => {
    process.env.PORTER_API_KEY = "dummy_porter_key";

    const db = createMockDb();
    await db.collection("branches").doc("branch_01").set({
      name: "Navrangpura",
      features: { porterEnabled: true },
      address: "Branch Address 1",
    });
    await db.collection("orders").doc("ord_porter_2").set({
      id: "ord_porter_2",
      branchId: "branch_01",
      address: { line1: "Drop Address 2", city: "Ahmedabad", phone: "9876543210", name: "Rahul" },
      items: [{ id: "item_1" }],
    });

    const result = await createPorterOrder(db, "ord_porter_2", { dryRun: true });

    expect(result.status).toBe("success");
    expect(result.wouldCreate).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.payload.drop_details.contact.name).toBe("Rahul");

    // Order doc is unchanged
    const orderDoc = await db.collection("orders").doc("ord_porter_2").get();
    expect(orderDoc.data().deliveryStatus).toBeUndefined();
  });

  // =========================================================================
  // 3. Enabled + Mock Fetch Writes Porter Order ID
  // =========================================================================

  it("3. [PORTER-ENABLED-WRITES-DOC] calls Porter API and updates order doc with porterOrderId and cost", async () => {
    process.env.PORTER_API_KEY = "live_test_porter_key";
    process.env.PORTER_CUSTOMER_ID = "cust_123";

    const db = createMockDb();
    await db.collection("branches").doc("branch_02").set({
      name: "Vastrapur",
      features: { porterEnabled: true },
      address: "Store Vastrapur",
    });
    await db.collection("orders").doc("ord_porter_3").set({
      id: "ord_porter_3",
      branchId: "branch_02",
      address: { line1: "Vastrapur Lake Road", city: "Ahmedabad", phone: "9876543210" },
    });

    const mockPorterResponse = {
      order_id: "ptr_live_999",
      status: "OPEN",
      fare: { total_fare: 55 },
    };

    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockPorterResponse,
    } as any);

    const result = await createPorterOrder(db, "ord_porter_3", { fetchFn: mockFetch });

    expect(result.status).toBe("success");
    expect(result.porterOrderId).toBe("ptr_live_999");

    const orderDoc = await db.collection("orders").doc("ord_porter_3").get();
    expect(orderDoc.data()["delivery.porter"].orderId).toBe("ptr_live_999");
    expect(orderDoc.data()["delivery.porter"].cost).toBe(55);
    expect(orderDoc.data().deliveryStatus).toBe("porter_open");
  });

  // =========================================================================
  // 4. Valid Webhook HMAC Updates Delivery Status
  // =========================================================================

  it("4. [WEBHOOK-VALID-HMAC] updates delivery status when valid signature is provided", async () => {
    const webhookSecret = "test_webhook_secret_key";
    process.env.PORTER_WEBHOOK_SECRET = webhookSecret;

    const db = createMockDb();
    await db.collection("orders").doc("ord_porter_4").set({
      id: "ord_porter_4",
      deliveryStatus: "porter_open",
    });

    const payload = {
      order_id: "ord_porter_4",
      status: "rider_assigned",
      tracking_url: "https://track.porter.in/ptr_999",
    };
    const rawBody = JSON.stringify(payload);
    const validSignature = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");

    const res = await handlePorterWebhook(db, payload, validSignature, rawBody);

    expect(res.status).toBe("success");
    expect(res.statusCode).toBe(200);

    const orderDoc = await db.collection("orders").doc("ord_porter_4").get();
    expect(orderDoc.data()["delivery.porter.status"]).toBe("rider_assigned");
    expect(orderDoc.data().deliveryStatus).toBe("porter_rider_assigned");
  });

  // =========================================================================
  // 5. Invalid Webhook HMAC Returns 401
  // =========================================================================

  it("5. [WEBHOOK-INVALID-HMAC] rejects invalid webhook signature with 401 Unauthorized", async () => {
    process.env.PORTER_WEBHOOK_SECRET = "secret_abc";

    const db = createMockDb();
    const payload = { order_id: "ord_porter_5", status: "delivered" };
    const rawBody = JSON.stringify(payload);

    const res = await handlePorterWebhook(db, payload, "invalid_signature_hex", rawBody);

    expect(res.status).toBe("unauthorized");
    expect(res.statusCode).toBe(401);
  });

  // =========================================================================
  // 6. FCM Disabled Returns Skipped Safely
  // =========================================================================

  it("6. [FCM-DISABLED-SKIPPED] safely skips notification when FCM_ENABLED=false without throwing", async () => {
    process.env.FCM_ENABLED = "false";

    const result = await sendTopicNotification("order_ord_123", {
      notification: {
        title: "Order Ready",
        body: "Your order is ready for pickup!",
      },
    });

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("fcm_disabled");
    expect(result.topic).toBe("order_ord_123");
  });
});
