import * as admin from "firebase-admin";
import express, { Request, Response } from "express";
import serverless from "serverless-http";

// Initialize Firebase Admin SDK if needed
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

export function mapPetpoojaStatusCode(code: string | number): "accepted" | "preparing" | "ready" | "cancelled" | "unknown" {
  const str = String(code).trim().toLowerCase();
  switch (str) {
    case "1":
    case "accepted":
      return "accepted";
    case "2":
    case "preparing":
      return "preparing";
    case "3":
    case "ready":
      return "ready";
    case "4":
    case "cancelled":
      return "cancelled";
    default:
      return "unknown";
  }
}

/**
 * Inbound webhook handler for Petpooja status updates.
 */
export async function handlePetpoojaWebhook(
  firestoreDb: admin.firestore.Firestore,
  payload: any,
): Promise<{ status: "success" | "ignored" | "error"; orderId?: string; mappedStatus?: string; error?: string }> {
  const orderId = payload.order_id || payload.orderID || payload.orderId;
  const rawStatus = payload.status || payload.order_status || payload.current_status;

  if (!orderId) {
    return { status: "error", error: "Missing order_id in Petpooja webhook payload" };
  }

  const mappedStatus = mapPetpoojaStatusCode(rawStatus);

  try {
    // 1. Record inbound webhook event log
    await firestoreDb.collection("petpooja_webhook_logs").add({
      orderId,
      rawStatus,
      mappedStatus,
      payload,
      receivedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 2. Update petpooja_orders queue record if present
    const queueRef = firestoreDb.collection("petpooja_orders").doc(orderId);
    const queueSnap = await queueRef.get();
    if (queueSnap.exists) {
      await queueRef.update({
        status: `petpooja_${mappedStatus}`,
        lastWebhookAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // 3. Update primary orders collection
    const orderRef = firestoreDb.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();

    if (orderSnap.exists) {
      const kind =
        mappedStatus === "ready"
          ? "ready"
          : mappedStatus === "preparing"
            ? "in_progress"
            : mappedStatus === "cancelled"
              ? "cancelled"
              : "sent_to_kitchen";

      await orderRef.update({
        "status.external": `petpooja_${mappedStatus}`,
        "status.kind": kind,
        "status.code": mappedStatus.toUpperCase(),
        "status.label": mappedStatus.charAt(0).toUpperCase() + mappedStatus.slice(1),
        petpoojaStatus: mappedStatus === "cancelled" ? "Cancelled" : "Synced",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    return { status: "success", orderId, mappedStatus };
  } catch (err: any) {
    console.error(`[petpooja-webhook] Error processing webhook for ${orderId}:`, err);
    return { status: "error", orderId, error: err?.message };
  }
}

const app = express();
app.use(express.json());

app.post(
  [
    "/",
    "/webhook",
    "/petpoojaWebhook",
    "/.netlify/functions/petpooja-webhook",
    "/api/petpooja/webhook",
  ],
  async (req: Request, res: Response) => {
    const result = await handlePetpoojaWebhook(db, req.body);
    if (result.status === "error") {
      res.status(400).send(result);
      return;
    }
    res.status(200).send(result);
  },
);

export const handler = serverless(app);
