import * as admin from "firebase-admin";
import express, { Request, Response } from "express";
import serverless from "serverless-http";
import { processPetpoojaOrder } from "./petpooja-queue";

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

export interface ReconciliationOptions {
  dryRun?: boolean;
  razorpayClient?: {
    payments: {
      fetch: (paymentId: string) => Promise<{ id: string; status: string; amount: number; order_id?: string }>;
    };
    orders?: {
      fetch: (orderId: string) => Promise<{ id: string; status: string; amount: number }>;
    };
  };
  fetchFn?: typeof fetch;
  now?: Date;
}

export interface ReconciliationResult {
  status: "success" | "error";
  dryRun: boolean;
  ordersChecked: number;
  discrepanciesFound: number;
  fixesApplied: Array<{ orderId: string; fix: string; reason: string }>;
  fixesWouldApply: Array<{ orderId: string; fix: string; reason: string }>;
  petpoojaRetried: Array<{ orderId: string; status: string }>;
  reconciledAt: string;
  error?: string;
}

/**
 * Nightly reconciliation engine:
 * 1. Checks payment status parity between orders, paymentAudits, and Razorpay gateway.
 * 2. Identifies discrepancies and repairs orders with idempotent paymentAudits (kind: "reconcile_fix").
 * 3. Reprocesses petpooja_orders stuck in "pending_petpooja_retry".
 */
export async function runReconciliation(
  firestoreDb: admin.firestore.Firestore,
  options: ReconciliationOptions = {},
): Promise<ReconciliationResult> {
  const isDryRun = Boolean(options.dryRun);
  const now = options.now || new Date();
  const dateKey = now.toISOString().split("T")[0];

  const fixesApplied: Array<{ orderId: string; fix: string; reason: string }> = [];
  const fixesWouldApply: Array<{ orderId: string; fix: string; reason: string }> = [];
  const petpoojaRetried: Array<{ orderId: string; status: string }> = [];

  let ordersChecked = 0;
  let discrepanciesFound = 0;

  try {
    // ── 1. Payment Reconciliation ──────────────────────────────────────────
    // Query orders that might need reconciliation
    let ordersQuery: admin.firestore.Query = firestoreDb.collection("orders");
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    try {
      ordersQuery = ordersQuery.where("createdAt", ">=", sevenDaysAgo).limit(100);
    } catch {
      ordersQuery = firestoreDb.collection("orders").limit(100);
    }

    const ordersSnap = await ordersQuery.get();
    ordersChecked = ordersSnap.size;

    for (const doc of ordersSnap.docs) {
      const order = doc.data();
      const orderId = doc.id;
      const paymentStatus = order.paymentStatus || order.payment?.status;
      const paymentId = order.payment?.transactionId || order.payment?.razorpay_payment_id || order.paymentId;
      const rzpOrderId = order.payment?.razorpay_order_id || order.paymentOrderId;

      // Check with gateway if paymentId exists and razorpayClient is available
      if (options.razorpayClient && (paymentId || rzpOrderId)) {
        try {
          let gatewayStatus = "";
          let gatewayAmountPaise = 0;

          if (paymentId) {
            const rzpPayment = await options.razorpayClient.payments.fetch(paymentId);
            gatewayStatus = rzpPayment.status;
            gatewayAmountPaise = rzpPayment.amount;
          }

          // If Gateway says captured / paid, but Firestore order is not marked "Paid"
          if (gatewayStatus === "captured" && paymentStatus !== "Paid" && paymentStatus !== "paid") {
            discrepanciesFound++;
            const expectedAmountPaise = Math.round((order.totals?.grandTotal || 0) * 100);
            const amountMismatch = gatewayAmountPaise > 0 && gatewayAmountPaise !== expectedAmountPaise;

            const fixDescriptor = {
              orderId,
              fix: "mark_order_paid",
              reason: `gateway_captured_firestore_${paymentStatus}`,
            };

            if (isDryRun) {
              fixesWouldApply.push(fixDescriptor);
            } else {
              // 1. Record discrepancy
              await firestoreDb.collection("payment_discrepancies").doc(orderId).set({
                orderId,
                branchId: order.branchId || order.store?.id || "unknown",
                expected: "Paid",
                gateway: gatewayStatus,
                firestoreStatus: paymentStatus,
                amount: order.totals?.grandTotal || 0,
                amountPaiseMismatch: amountMismatch,
                reason: fixDescriptor.reason,
                reconciledAt: admin.firestore.FieldValue.serverTimestamp(),
              });

              // 2. Fix order paymentStatus
              await firestoreDb.collection("orders").doc(orderId).update({
                paymentStatus: "Paid",
                "payment.status": "paid",
                "payment.paidAt": now.toISOString(),
                validatedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });

              // 3. Idempotent audit record
              const auditKey = `reconcile_${orderId}_${dateKey}`;
              const auditRef = firestoreDb.collection("paymentAudits").doc(auditKey);
              const auditSnap = await auditRef.get();

              if (!auditSnap.exists) {
                await auditRef.set({
                  orderId,
                  branchId: order.branchId || order.store?.id || "unknown",
                  amount: order.totals?.grandTotal || 0,
                  amountPaise: expectedAmountPaise,
                  kind: "reconcile_fix",
                  source: "nightly_reconcile",
                  metadata: {
                    fix: "mark_order_paid",
                    gatewayStatus,
                    previousStatus: paymentStatus,
                  },
                  createdAt: admin.firestore.FieldValue.serverTimestamp(),
                });
              }

              fixesApplied.push(fixDescriptor);
            }
          }
        } catch (err: any) {
          console.warn(`[reconcile] Error checking gateway for order ${orderId}:`, err?.message);
        }
      }
    }

    // ── 2. Petpooja Retry Queue Reconciliation ─────────────────────────────
    try {
      const nowIso = now.toISOString();
      const petpoojaSnap = await firestoreDb
        .collection("petpooja_orders")
        .where("status", "==", "pending_petpooja_retry")
        .get();

      for (const queueDoc of petpoojaSnap.docs) {
        const qData = queueDoc.data();
        const nextRetryAt = qData.nextRetryAt;
        const shouldRetry = !nextRetryAt || (typeof nextRetryAt === "string" && nextRetryAt <= nowIso) || (nextRetryAt.toDate && nextRetryAt.toDate() <= now);

        if (shouldRetry) {
          if (isDryRun) {
            petpoojaRetried.push({ orderId: queueDoc.id, status: "dry_run_scheduled" });
          } else {
            const retryRes = await processPetpoojaOrder(firestoreDb, queueDoc.id, options.fetchFn);
            petpoojaRetried.push({ orderId: queueDoc.id, status: retryRes.status });
          }
        }
      }
    } catch (ppErr: any) {
      console.warn("[reconcile] Error checking petpooja retry queue:", ppErr?.message);
    }

    return {
      status: "success",
      dryRun: isDryRun,
      ordersChecked,
      discrepanciesFound,
      fixesApplied,
      fixesWouldApply,
      petpoojaRetried,
      reconciledAt: now.toISOString(),
    };
  } catch (globalErr: any) {
    console.error("[reconcile] Global reconciliation failure:", globalErr);
    return {
      status: "error",
      dryRun: isDryRun,
      ordersChecked,
      discrepanciesFound,
      fixesApplied,
      fixesWouldApply,
      petpoojaRetried,
      reconciledAt: now.toISOString(),
      error: globalErr?.message || "Unknown reconciliation error",
    };
  }
}

// ── Express router for reconcile endpoint ───────────────────────────────────
const app = express();
app.use(express.json());

app.get(
  [
    "/",
    "/reconcile",
    "/api/reconcile",
    "/.netlify/functions/reconcile",
  ],
  async (req: Request, res: Response) => {
    const isDryRun = req.query.dryRun === "1" || req.query.dryRun === "true";

    // Setup Razorpay client if keys are present
    let razorpayClient: any = undefined;
    if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Razorpay = require("razorpay");
        razorpayClient = new Razorpay({
          key_id: process.env.RAZORPAY_KEY_ID,
          key_secret: process.env.RAZORPAY_KEY_SECRET,
        });
      } catch (err: any) {
        console.warn("[reconcile] Could not initialize live Razorpay client:", err?.message);
      }
    }

    const result = await runReconciliation(db, {
      dryRun: isDryRun,
      razorpayClient,
    });

    res.status(result.status === "success" ? 200 : 500).send(result);
  },
);

export const handler = serverless(app);
