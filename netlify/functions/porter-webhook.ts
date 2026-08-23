import * as admin from "firebase-admin";
import * as crypto from "crypto";
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

/**
 * Constant-time signature verification for Porter webhooks.
 */
export function verifyPorterWebhookSignature(
  rawBody: string,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature || !secret) return false;

  try {
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");

    const expectedBuf = Buffer.from(expectedSignature, "utf-8");
    const sigBuf = Buffer.from(signature, "utf-8");

    if (expectedBuf.length !== sigBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuf, sigBuf);
  } catch {
    return false;
  }
}

export async function handlePorterWebhook(
  firestoreDb: admin.firestore.Firestore,
  payload: any,
  signatureHeader?: string,
  rawBody?: string,
): Promise<{ status: "success" | "error" | "unauthorized"; orderId?: string; error?: string; statusCode?: number }> {
  const webhookSecret = process.env.PORTER_WEBHOOK_SECRET;

  // Verify signature if secret is configured
  if (webhookSecret) {
    const bodyToVerify = rawBody || JSON.stringify(payload);
    const isValid = verifyPorterWebhookSignature(bodyToVerify, signatureHeader, webhookSecret);
    if (!isValid) {
      return { status: "unauthorized", statusCode: 401, error: "Invalid Porter webhook signature" };
    }
  }

  const orderId = payload.order_id || payload.orderId || payload.request_id?.replace("req_", "");
  const status = payload.status || payload.order_status || "updated";

  if (!orderId) {
    return { status: "error", statusCode: 400, error: "Missing order_id in Porter payload" };
  }

  try {
    // 1. Write delivery logs record
    await firestoreDb.collection("delivery_logs").add({
      orderId,
      porterOrderId: payload.order_id,
      status,
      payload,
      receivedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 2. Update order delivery status
    const orderRef = firestoreDb.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();

    if (orderSnap.exists) {
      await orderRef.update({
        "delivery.porter.status": status,
        "delivery.porter.trackingUrl": payload.tracking_url || null,
        deliveryStatus: `porter_${status}`,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    return { status: "success", orderId, statusCode: 200 };
  } catch (err: any) {
    console.error(`[porter-webhook] Error updating order ${orderId}:`, err);
    return { status: "error", statusCode: 500, error: err?.message };
  }
}

const app = express();
app.use(express.json({
  verify: (req: any, _res, buf) => {
    req.rawBody = buf.toString("utf-8");
  },
}));

app.post(
  [
    "/",
    "/webhook",
    "/porterWebhook",
    "/.netlify/functions/porter-webhook",
    "/api/porter/webhook",
  ],
  async (req: Request, res: Response) => {
    const signature = (req.headers["x-porter-signature"] || req.headers["x-signature"]) as string;
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);

    const result = await handlePorterWebhook(db, req.body, signature, rawBody);
    if (result.status === "unauthorized") {
      res.status(401).send({ error: result.error });
      return;
    }
    if (result.status === "error") {
      res.status(result.statusCode || 400).send({ error: result.error });
      return;
    }

    res.status(200).send(result);
  },
);

export const handler = serverless(app);
