import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as crypto from "crypto";

const db = admin.firestore();

async function logWebhook(
  type: "menu.sync" | "store.status" | "order.save",
  status: "SUCCESS" | "FAILED" | "IGNORED",
  payload: any,
  execTimeMs: number,
  storeId: string = "unknown",
  storeName: string = "Unknown Store",
) {
  try {
    await db.collection("petpooja_webhook_logs").add({
      type,
      status,
      payload,
      executionTimeMs: execTimeMs,
      storeId,
      storeName,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) {
    functions.logger.error("Failed to log webhook to Firestore", e);
  }
}

/**
 * Authenticates an incoming Petpooja webhook using an HMAC-SHA256 signature
 * over the raw request body. Fail-closed: any missing/invalid input returns
 * { ok: false, reason } and the caller must reject the request.
 */
function isAuthorizedPetpoojaWebhook(req: any): { ok: boolean; reason?: string } {
  const secret = process.env.PETPOOJA_WEBHOOK_SECRET || functions.config().petpooja?.webhook_secret;
  if (!secret) {
    return { ok: false, reason: "Webhook secret not configured" };
  }

  const signature = req.headers["x-petpooja-signature"] as string;
  if (!signature) {
    return { ok: false, reason: "Missing x-petpooja-signature" };
  }

  if (!req.rawBody) {
    return { ok: false, reason: "Missing raw body" };
  }

  const timestampHeader = req.headers["x-petpooja-timestamp"];
  if (timestampHeader !== undefined) {
    const ts = parseInt(String(timestampHeader), 10);
    if (isNaN(ts) || Math.abs(Date.now() - ts) > 300000) {
      return { ok: false, reason: "Stale or invalid timestamp" };
    }
  }

  const expected = crypto.createHmac("sha256", secret).update(req.rawBody).digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(signature, "hex");
  } catch {
    return { ok: false, reason: "Malformed signature" };
  }

  if (provided.length !== expected.length || !crypto.timingSafeEqual(expected, provided)) {
    return { ok: false, reason: "Invalid signature" };
  }

  return { ok: true };
}

/**
 * HTTP Webhook for Petpooja Menu Push
 * Petpooja sends a POST request with the entire menu catalog (categories, items, modifiers)
 * We parse this and safely upsert into our Firestore collections.
 */
export const pushMenu = functions.https.onRequest(async (req: any, res: any) => {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const auth = isAuthorizedPetpoojaWebhook(req);
  if (!auth.ok) {
    functions.logger.warn(`Rejected unauthenticated Petpooja menu push: ${auth.reason}`);
    res.status(401).send({ status: "error", message: auth.reason });
    return;
  }

  const startTime = Date.now();
  try {
    const payload = req.body;

    const { restaurants, success } = payload;

    if (success !== "1" && success !== 1 && success !== true) {
      functions.logger.warn("Received failed menu push payload from Petpooja", payload);
      res.status(400).send("Invalid success flag");
      return;
    }

    if (!restaurants || !Array.isArray(restaurants)) {
      res.status(400).send("No restaurants data found");
      await logWebhook("menu.sync", "FAILED", payload, Date.now() - startTime);
      return;
    }

    let overallRestId = "unknown";
    let overallRestName = "Unknown Store";

    // Process each restaurant's menu
    for (const rest of restaurants) {
      const restId = rest.details?.restID;
      if (!restId) continue;

      const categories = rest.categories || [];

      // Batch writes can only hold 500 ops. We should chunk them.
      let batch = db.batch();
      let opCount = 0;

      const commitBatchIfNeeded = async () => {
        if (opCount >= 450) {
          await batch.commit();
          batch = db.batch();
          opCount = 0;
        }
      };

      for (const cat of categories) {
        // Upsert Category
        const catRef = db.collection("petpooja_categories").doc(cat.categoryid.toString());
        batch.set(
          catRef,
          {
            id: cat.categoryid.toString(),
            name: cat.categoryname,
            description: cat.categorydescription || "",
            active: cat.active === "1" || cat.active === 1,
            sortOrder: parseInt(cat.categoryrank, 10) || 0,
            restId: restId,
            imageUrl: cat.categoryimage_url || null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        opCount++;
        await commitBatchIfNeeded();

        // Upsert Products in this Category
        const items = cat.items || [];
        for (const item of items) {
          const itemRef = db.collection("petpooja_products").doc(item.itemid.toString());

          // Map Customizations (Addons/Variations)
          const customizations = (item.addon_groups || []).map((ag: any) => ({
            id: ag.addon_group_id?.toString(),
            name: ag.addon_group_name,
            minSelections: parseInt(ag.min_select, 10) || 0,
            maxSelections: parseInt(ag.max_select, 10) || 1,
            options: (ag.addon_items || []).map((ai: any) => ({
              id: ai.addon_item_id?.toString(),
              name: ai.addon_item_name,
              price: parseFloat(ai.addon_item_price) || 0,
              isAvailable: ai.active === "1" || ai.active === 1,
            })),
          }));

          batch.set(
            itemRef,
            {
              id: item.itemid.toString(),
              categoryId: cat.categoryid.toString(),
              restId: restId,
              name: item.itemname,
              description: item.itemdescription || "",
              price: parseFloat(item.itemprice) || 0,
              imageUrl: item.itemimage_url || null,
              isAvailable: item.active === "1" || item.active === 1,
              dietaryTag:
                item.item_attributeid === "1"
                  ? "veg"
                  : item.item_attributeid === "2"
                    ? "non-veg"
                    : "veg",
              sortOrder: parseInt(item.itemrank, 10) || 0,
              customizations: customizations,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
          opCount++;
          await commitBatchIfNeeded();
        }
      }

      // Commit remaining ops
      if (opCount > 0) {
        await batch.commit();
      }

      overallRestId = restId;
      overallRestName = `Store ${restId}`;
      functions.logger.info(`Successfully processed menu for restaurant ${restId}`);
    }

    await logWebhook(
      "menu.sync",
      "SUCCESS",
      payload,
      Date.now() - startTime,
      overallRestId,
      overallRestName,
    );
    res.status(200).send({ status: "success", message: "Menu synced successfully" });
  } catch (error: any) {
    functions.logger.error("Error processing Petpooja Menu push", error);
    await logWebhook("menu.sync", "FAILED", req.body, Date.now() - startTime);
    res.status(500).send({ status: "error", message: "Internal server error" });
  }
});

/**
 * HTTP Webhook for Petpooja Store Status (Store Open/Close/Offline triggers)
 */
export const storeStatus = functions.https.onRequest(async (req: any, res: any) => {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const auth = isAuthorizedPetpoojaWebhook(req);
  if (!auth.ok) {
    functions.logger.warn(`Rejected unauthenticated Petpooja store status push: ${auth.reason}`);
    res.status(401).send({ status: "error", message: auth.reason });
    return;
  }

  const startTime = Date.now();
  try {
    const payload = req.body;
    const { restID, status } = payload;

    if (!restID || !status) {
      res.status(400).send("Missing restID or status");
      await logWebhook("store.status", "FAILED", payload, Date.now() - startTime);
      return;
    }

    // Find the store in admin_stores by petpoojaRestId
    const storesRef = db.collection("admin_stores");
    const snapshot = await storesRef
      .where("petpoojaRestId", "==", restID.toString())
      .limit(1)
      .get();

    let storeName = "Unknown Store";
    if (!snapshot.empty) {
      const storeDoc = snapshot.docs[0];
      storeName = storeDoc.data()?.name || "Unknown Store";
      await storeDoc.ref.update({
        isOpen: status === "1" || status === "active" || status === 1,
        lastSyncTime: admin.firestore.FieldValue.serverTimestamp(),
        webhookStatus: "active",
      });
      functions.logger.info(`Updated store ${storeDoc.id} status to ${status}`);
    } else {
      functions.logger.warn(`Received status for unknown petpoojaRestId: ${restID}`);
    }

    await logWebhook(
      "store.status",
      "SUCCESS",
      payload,
      Date.now() - startTime,
      restID.toString(),
      storeName,
    );
    res.status(200).send({ status: "success" });
  } catch (error: any) {
    functions.logger.error("Error processing Store Status push", error);
    await logWebhook("store.status", "FAILED", req.body, Date.now() - startTime);
    res.status(500).send({ status: "error", message: "Internal server error" });
  }
});
