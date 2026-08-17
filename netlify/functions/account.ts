import * as admin from "firebase-admin";
import express, { Request, Response } from "express";
import serverless from "serverless-http";
import { getOrderScrubUpdatePayload } from "./lib/account-scrub";

// Initialize Firebase Admin SDK (mirrors payments.ts)
if (!admin.apps.length) {
  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccountRaw) {
    try {
      const serviceAccount = JSON.parse(serviceAccountRaw);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    } catch (e) {
      console.error("[Netlify Account] Failed to parse FIREBASE_SERVICE_ACCOUNT JSON", e);
      admin.initializeApp();
    }
  } else {
    admin.initializeApp();
  }
}

const db = admin.firestore();

/**
 * Validates the caller's Firebase Auth token.
 */
async function authenticateRequest(req: Request): Promise<admin.auth.DecodedIdToken | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.split("Bearer ")[1];
  try {
    return await admin.auth().verifyIdToken(token);
  } catch (err) {
    console.warn("[Netlify Account] Authentication token verification failed:", err);
    return null;
  }
}

/**
 * Anonymizes every order the user created — top-level `orders/{id}`
 * and the `users/{uid}/orders` subcollection. PII-bearing fields are
 * removed; financial/ledger fields (totals, items, status, timestamps)
 * are preserved for business records and reconciliation.
 */
async function anonymizeUserOrders(uid: string): Promise<number> {
  let count = 0;

  // 1. Top-level orders (single-collection single-field query — no index required)
  const topLevel = await db.collection("orders").where("userId", "==", uid).get();
  for (const docSnap of topLevel.docs) {
    await scrubOrder(docSnap.ref);
    count++;
  }

  // 2. Subcollection orders under users/{uid}/orders
  const subCollection = await db.collection(`users/${uid}/orders`).listDocuments();
  for (const ref of subCollection) {
    const docSnap = await ref.get();
    if (docSnap.exists) {
      await scrubOrder(ref);
      count++;
    }
  }

  return count;
}

async function scrubOrder(ref: admin.firestore.DocumentReference) {
  const updatePayload = getOrderScrubUpdatePayload(
    admin.firestore.FieldValue.serverTimestamp(),
    admin.firestore.FieldValue.delete(),
  );
  await ref.update(updatePayload);
}

/**
 * Deletes the user's personal data outside of order records:
 * addresses subcollection, the users/{uid} doc, and device tokens.
 */
async function deletePersonalData(uid: string): Promise<{ addresses: number; tokens: number }> {
  // 1. Addresses subcollection
  let addresses = 0;
  const addressRefs = await db.collection(`users/${uid}/addresses`).listDocuments();
  for (const ref of addressRefs) {
    await ref.delete();
    addresses++;
  }

  // 2. users/{uid} doc (covers favorites, profile fields, flags)
  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();
  if (userSnap.exists) {
    await userRef.delete();
  }

  // 3. Device tokens linked to this user
  let tokens = 0;
  const tokenDocs = await db.collection("device_tokens").where("userId", "==", uid).get();
  for (const docSnap of tokenDocs.docs) {
    await docSnap.ref.delete();
    tokens++;
  }

  return { addresses, tokens };
}

/**
 * POST /deleteAccount — permanently deletes the authenticated user's account.
 * Orders are anonymized (PII scrubbed, financial data retained), everything
 * else is deleted, and the Firebase Auth account is removed.
 */
export async function handleDeleteAccount(req: Request, res: Response) {
  const decodedToken = await authenticateRequest(req);
  if (!decodedToken || !decodedToken.uid) {
    res
      .status(401)
      .send({ status: "error", message: "Unauthorized. Valid Firebase ID token is required." });
    return;
  }
  const uid = decodedToken.uid;

  try {
    const ordersAnonymized = await anonymizeUserOrders(uid);
    const { addresses, tokens } = await deletePersonalData(uid);
    await admin.auth().deleteUser(uid);

    console.info(
      `[Netlify Account] Account deleted for ${uid}: ${ordersAnonymized} orders anonymized, ${addresses} addresses and ${tokens} device tokens removed.`,
    );
    res.status(200).send({
      status: "success",
      deleted: true,
      ordersAnonymized,
      addressesDeleted: addresses,
      deviceTokensDeleted: tokens,
    });
  } catch (error: any) {
    console.error("[Netlify Account] Error deleting account:", error);
    res.status(500).send({ status: "error", message: "Internal server error" });
  }
}

// ── Express application mounted for Netlify Functions ──────────────────────
const app = express();

app.use((req: Request, res: Response, next: any) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  next();
});

app.use(express.json());

// Routes supporting relative, /account, and full Netlify function paths
app.post(
  ["/deleteAccount", "/account/deleteAccount", "/.netlify/functions/account/deleteAccount"],
  handleDeleteAccount,
);

export const handler = serverless(app);
