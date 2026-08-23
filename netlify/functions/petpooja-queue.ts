import * as admin from "firebase-admin";
import express, { Request, Response } from "express";
import serverless from "serverless-http";

// Initialize Firebase Admin SDK if not already initialized
if (!admin.apps.length) {
  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccountRaw) {
    try {
      const serviceAccount = JSON.parse(serviceAccountRaw);
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    } catch {
      admin.initializeApp();
    }
  } else {
    admin.initializeApp();
  }
}

const db = admin.firestore();

export interface EnqueuePetpoojaResult {
  queued: boolean;
  reason?: string;
  orderId?: string;
  docId?: string;
}

/**
 * Maps order document to Petpooja SaveOrder payload structure.
 */
export function buildPetpoojaPayload(orderData: any, restId: string) {
  const appKey = process.env.PETPOOJA_APP_KEY || "";
  const appSecret = process.env.PETPOOJA_APP_SECRET || "";
  const accessToken = process.env.PETPOOJA_ACCESS_TOKEN || "";

  const items = Array.isArray(orderData.items) ? orderData.items : [];
  const orderItems = items.map((item: any) => ({
    id: item.id || item.productId || "item_unknown",
    name: item.name || "Menu Item",
    price: Number(item.unitPrice ?? item.price ?? 0).toFixed(2),
    qty: String(item.quantity || 1),
    tax_inclusive: "1",
    addonitem: (item.customizations || item.modifiers || []).map((m: any) => ({
      id: m.optionId || m.id || "addon_1",
      name: m.name || m.optionName || "Addon",
      group_name: m.groupName || "Options",
      price: Number(m.priceDelta ?? m.price ?? 0).toFixed(2),
    })),
  }));

  const taxes = [];
  if ((orderData.totals?.tax || orderData.totals?.taxes || 0) > 0) {
    taxes.push({
      id: "tax_gst",
      title: "GST (5%)",
      type: "percentage",
      price: Number(orderData.totals?.tax || orderData.totals?.taxes || 0).toFixed(2),
      tax: "5.00",
    });
  }

  return {
    app_key: appKey,
    app_secret: appSecret,
    access_token: accessToken,
    restID: restId,
    res_name: orderData.store?.name || "Burgonomics",
    OrderInfo: {
      Customer: {
        name: orderData.address?.name || "Customer",
        phone: orderData.address?.phone || "9876543210",
        email: orderData.customerEmail || "customer@burgonomics.com",
        address: orderData.address?.line1 || "Dine-in / Store Pickup",
      },
      Order: {
        orderID: orderData.id || orderData.orderId,
        collect_cash: orderData.payment?.method === "cod" ? "1" : "0",
        minimum_prep_time: "20",
        details: orderData.notes || "",
      },
      OrderItem: orderItems,
      Tax: taxes,
      Discount: [],
    },
  };
}

/**
 * Enqueues an order to the petpooja_orders collection if Petpooja is enabled.
 * If disabled or if the branch has no petpooja restId, safely skips without throwing.
 */
export async function enqueuePetpoojaOrder(
  firestoreDb: admin.firestore.Firestore,
  orderId: string,
  branchId: string,
  orderData: any,
): Promise<EnqueuePetpoojaResult> {
  const isEnabled = process.env.PETPOOJA_ENABLED === "true";
  if (!isEnabled) {
    return { queued: false, reason: "PETPOOJA_DISABLED" };
  }

  if (!branchId) {
    return { queued: false, reason: "MISSING_BRANCH_ID" };
  }

  let restId: string | null = null;
  try {
    const branchSnap = await firestoreDb.collection("branches").doc(branchId).get();
    if (branchSnap.exists) {
      const bData = branchSnap.data();
      restId = bData?.petpooja?.restId || bData?.restId || null;
    }
  } catch (err: any) {
    console.warn(`[petpooja-queue] Error reading branch ${branchId}:`, err?.message);
  }

  if (!restId) {
    restId = process.env.PETPOOJA_REST_ID || null;
  }

  if (!restId) {
    return { queued: false, reason: "MISSING_REST_ID" };
  }

  const payload = buildPetpoojaPayload(orderData, restId);
  const queueRef = firestoreDb.collection("petpooja_orders").doc(orderId);

  await queueRef.set({
    orderId,
    branchId,
    restId,
    payload,
    status: "pending",
    attempts: 0,
    nextRetryAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { queued: true, orderId, docId: orderId };
}

/**
 * Worker processor that executes the push_order API call to Petpooja.
 */
export async function processPetpoojaOrder(
  firestoreDb: admin.firestore.Firestore,
  orderId: string,
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<{ status: "synced" | "retry" | "failed"; statusCode?: number; error?: string }> {
  const queueRef = firestoreDb.collection("petpooja_orders").doc(orderId);
  const queueSnap = await queueRef.get();

  if (!queueSnap.exists) {
    return { status: "failed", error: "Queue record not found" };
  }

  const queueData = queueSnap.data() as any;
  const { payload, attempts = 0, branchId, restId } = queueData;
  const endpoint = `https://47pfzh5sf2.execute-api.ap-southeast-1.amazonaws.com/V1/push_order`;

  try {
    const response = await fetchFn(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Content_key: payload.app_key || process.env.PETPOOJA_APP_KEY || "",
        Authorization: `Bearer ${payload.access_token || process.env.PETPOOJA_ACCESS_TOKEN || ""}`,
        rest_id: restId || "",
      },
      body: JSON.stringify(payload),
    });

    const statusCode = response.status;

    // 2xx Success: Order successfully placed in Petpooja POS
    if (response.ok) {
      const responseData = await response.json().catch(() => ({}));
      const petpoojaOrderId = responseData?.orderID || responseData?.order_id || `pp_${orderId}`;

      await queueRef.update({
        status: "synced",
        petpoojaOrderId,
        syncedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Update primary order document
      const orderRef = firestoreDb.collection("orders").doc(orderId);
      const orderSnap = await orderRef.get();
      if (orderSnap.exists) {
        await orderRef.update({
          petpoojaStatus: "Synced",
          petpoojaOrderId,
          "status.kind": "sent_to_kitchen",
          "status.code": "SENT_TO_KITCHEN",
          "status.label": "Sent to kitchen",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      return { status: "synced", statusCode };
    }

    // 4xx Client Error (Unrecoverable without payload change)
    if (statusCode >= 400 && statusCode < 500) {
      const errorText = await response.text().catch(() => "4xx Client Error");

      await queueRef.update({
        status: "failed",
        lastError: errorText,
        failedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Write petpooja_logs record
      await firestoreDb.collection("petpooja_webhook_logs").add({
        orderId,
        branchId,
        type: "push_order_4xx_failed",
        statusCode,
        error: errorText,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const orderRef = firestoreDb.collection("orders").doc(orderId);
      const orderSnap = await orderRef.get();
      if (orderSnap.exists) {
        await orderRef.update({
          petpoojaStatus: "Failed",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      return { status: "failed", statusCode, error: errorText };
    }

    // 5xx Server Error: Retry with exponential backoff (1m, 5m, 15m)
    const retryDelaysMs = [60_000, 300_000, 900_000];
    const nextDelay = retryDelaysMs[Math.min(attempts, retryDelaysMs.length - 1)];
    const nextRetryAt = new Date(Date.now() + nextDelay).toISOString();

    await queueRef.update({
      status: "pending_petpooja_retry",
      attempts: attempts + 1,
      nextRetryAt,
      lastError: `Server error status ${statusCode}`,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { status: "retry", statusCode, error: `5xx error: ${statusCode}` };
  } catch (networkErr: any) {
    // Network / timeout error: Schedule retry
    const retryDelaysMs = [60_000, 300_000, 900_000];
    const nextDelay = retryDelaysMs[Math.min(attempts, retryDelaysMs.length - 1)];
    const nextRetryAt = new Date(Date.now() + nextDelay).toISOString();

    await queueRef.update({
      status: "pending_petpooja_retry",
      attempts: attempts + 1,
      nextRetryAt,
      lastError: networkErr?.message || "Network timeout",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { status: "retry", error: networkErr?.message };
  }
}

// ── Express router for queue operations ─────────────────────────────────────
const app = express();
app.use(express.json());

app.post(["/process", "/petpoojaQueue/process", "/.netlify/functions/petpooja-queue/process"], async (req: Request, res: Response) => {
  const { orderId } = req.body;
  if (!orderId) {
    res.status(400).send({ error: "orderId is required" });
    return;
  }
  const result = await processPetpoojaOrder(db, orderId);
  res.status(200).send(result);
});

export const handler = serverless(app);
